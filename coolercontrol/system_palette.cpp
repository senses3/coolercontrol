// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

#include "system_palette.h"

#include <QColor>
#include <QDBusArgument>
#include <QDBusConnection>
#include <QDBusInterface>
#include <QDBusReply>
#include <QFile>
#include <QFileSystemWatcher>
#include <QHash>
#include <QJsonDocument>
#include <QJsonObject>
#include <QStandardPaths>
#include <QStringBuilder>
#include <QTextStream>
#include <optional>

namespace system_palette {

namespace {

constexpr auto PORTAL_SERVICE = "org.freedesktop.portal.Desktop";
constexpr auto PORTAL_PATH = "/org/freedesktop/portal/desktop";
constexpr auto PORTAL_SETTINGS = "org.freedesktop.portal.Settings";
constexpr auto APPEARANCE_NS = "org.freedesktop.appearance";

QString kdeGlobalsPath() {
  return QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation) % "/kdeglobals";
}

/*
  ReadOne arrived with Settings version 2, which is also the version that added
  accent-color. Older portals only have Read, which wraps its answer in a second
  variant, so both shapes are unwrapped here rather than assuming a version.
*/
QVariant readPortalKey(const QString& key) {
  QDBusInterface portal(PORTAL_SERVICE, PORTAL_PATH, PORTAL_SETTINGS,
                        QDBusConnection::sessionBus());
  if (!portal.isValid()) {
    return {};
  }
  const QDBusReply<QDBusVariant> one = portal.call("ReadOne", APPEARANCE_NS, key);
  if (one.isValid()) {
    return one.value().variant();
  }
  const QDBusReply<QDBusVariant> legacy = portal.call("Read", APPEARANCE_NS, key);
  if (!legacy.isValid()) {
    return {};
  }
  const auto inner = legacy.value().variant();
  return inner.canConvert<QDBusVariant>() ? inner.value<QDBusVariant>().variant() : inner;
}

/* The portal reports "no accent chosen" as an out-of-range triple, not an error. */
std::optional<QColor> portalAccent() {
  const auto value = readPortalKey(QStringLiteral("accent-color"));
  if (!value.canConvert<QDBusArgument>()) {
    return std::nullopt;
  }
  // Must be const: the non-const overloads are the marshalling ones, so a mutable
  // argument starts writing a struct here instead of reading the one that arrived,
  // and libdbus aborts the process on the next extraction.
  const QDBusArgument argument = value.value<QDBusArgument>();
  if (argument.currentType() != QDBusArgument::StructureType) {
    return std::nullopt;
  }
  double red = -1.0;
  double green = -1.0;
  double blue = -1.0;
  argument.beginStructure();
  argument >> red >> green >> blue;
  argument.endStructure();
  const auto inRange = [](const double channel) { return channel >= 0.0 && channel <= 1.0; };
  if (!inRange(red) || !inRange(green) || !inRange(blue)) {
    return std::nullopt;
  }
  return QColor::fromRgbF(red, green, blue);
}

/* color-scheme is 0 no preference, 1 dark, 2 light. */
std::optional<bool> portalPrefersDark() {
  const auto value = readPortalKey(QStringLiteral("color-scheme"));
  if (!value.isValid()) {
    return std::nullopt;
  }
  auto ok = false;
  const auto scheme = value.toUInt(&ok);
  if (!ok || scheme == 0) {
    return std::nullopt;
  }
  return scheme == 1;
}

/*
  kdeglobals is read by hand rather than through QSettings. KDE writes subgroups
  as `[Colors:Header][Inactive]`, which the INI parser does not model, and its
  `r,g,b` values come back split into a string list. Only the flat `[Colors:*]`
  groups matter here, so a direct read is both shorter and less surprising.
*/
QHash<QString, QColor> readKdeColors(const QString& path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
    return {};
  }
  QHash<QString, QColor> colors;
  QString group;
  QTextStream stream(&file);
  while (!stream.atEnd()) {
    const auto line = stream.readLine().trimmed();
    if (line.startsWith('[')) {
      // A second bracket marks a state variant such as [Inactive], which is a
      // different palette to the one being read. Skip until the next plain group.
      group = line.endsWith(']') && line.count('[') == 1 ? line.mid(1, line.size() - 2) : QString();
      continue;
    }
    if (!group.startsWith(QStringLiteral("Colors:"))) {
      continue;
    }
    const auto separator = line.indexOf('=');
    if (separator < 1) {
      continue;
    }
    const auto parts = line.mid(separator + 1).split(',');
    if (parts.size() != 3) {
      continue;
    }
    auto valid = true;
    int channels[3] = {0, 0, 0};
    for (auto i = 0; i < 3; ++i) {
      auto ok = false;
      channels[i] = parts.at(i).trimmed().toInt(&ok);
      if (!ok || channels[i] < 0 || channels[i] > 255) {
        valid = false;
        break;
      }
    }
    if (valid) {
      colors.insert(group % '/' % line.left(separator).trimmed(),
                    QColor(channels[0], channels[1], channels[2]));
    }
  }
  return colors;
}

/*
  KDE's palette maps onto the UI's tokens directly, including the status colors:
  ForegroundPositive, ForegroundNeutral and ForegroundNegative are exactly
  success, warning and error. View is the content well behind the page and Window
  is the raised chrome, which is the same relationship bg-one and bg-two have.

  All or nothing: a partial palette would mix desktop colors with ours, which
  reads worse than either on its own.
*/
std::optional<QJsonObject> kdeTokens() {
  const auto colors = readKdeColors(kdeGlobalsPath());
  if (colors.isEmpty()) {
    return std::nullopt;
  }
  struct Mapping {
    const char* token;
    const char* source;
  };
  static constexpr Mapping MAPPINGS[] = {
      {"bgOne", "Colors:View/BackgroundNormal"},
      {"bgTwo", "Colors:Window/BackgroundNormal"},
      {"borderOne", "Colors:Window/BackgroundAlternate"},
      {"textColor", "Colors:Window/ForegroundNormal"},
      {"textColorSecondary", "Colors:Window/ForegroundInactive"},
      {"accent", "Colors:Selection/BackgroundNormal"},
      {"success", "Colors:Window/ForegroundPositive"},
      {"warning", "Colors:Window/ForegroundNeutral"},
      {"error", "Colors:Window/ForegroundNegative"},
      {"info", "Colors:Window/ForegroundLink"},
  };
  QJsonObject tokens;
  for (const auto& [token, source] : MAPPINGS) {
    const auto color = colors.value(QString::fromLatin1(source));
    if (!color.isValid()) {
      return std::nullopt;
    }
    tokens.insert(QString::fromLatin1(token), color.name());
  }
  // KDE has no brand gradient, so the accent carries both ends. Selection's
  // alternate background is the only candidate and it is a fill drawn behind
  // selected text, far too dark to stroke onto the window background.
  tokens.insert(QStringLiteral("accentGradientTo"),
                tokens.value(QStringLiteral("accent")).toString());
  return tokens;
}

}  // namespace

QString readAsJson() {
  QJsonObject root;
  const auto tokens = kdeTokens();
  if (tokens.has_value()) {
    // Taken from the same palette as the rest rather than from the portal, so
    // every token in the object agrees with every other.
    root.insert(QStringLiteral("tokens"), *tokens);
    root.insert(QStringLiteral("accent"), tokens->value(QStringLiteral("accent")));
  } else if (const auto accent = portalAccent(); accent.has_value()) {
    root.insert(QStringLiteral("accent"), accent->name());
  }
  if (const auto prefersDark = portalPrefersDark(); prefersDark.has_value()) {
    root.insert(QStringLiteral("variant"), *prefersDark ? "dark" : "light");
  } else if (tokens.has_value()) {
    // No stated preference, so read it off the palette the desktop is drawing.
    const QColor page(tokens->value(QStringLiteral("bgOne")).toString());
    root.insert(QStringLiteral("variant"), page.lightnessF() < 0.5 ? "dark" : "light");
  }
  if (root.isEmpty()) {
    return {};
  }
  return QString::fromUtf8(QJsonDocument(root).toJson(QJsonDocument::Compact));
}

Watcher::Watcher(QObject* parent) : QObject(parent), m_files(new QFileSystemWatcher(this)) {
  QDBusConnection::sessionBus().connect(
      QLatin1String(PORTAL_SERVICE), QLatin1String(PORTAL_PATH), QLatin1String(PORTAL_SETTINGS),
      QStringLiteral("SettingChanged"), this,
      SLOT(onPortalSettingChanged(QString, QString, QDBusVariant)));
  connect(m_files, &QFileSystemWatcher::fileChanged, this, &Watcher::onFileChanged);
  const auto path = kdeGlobalsPath();
  if (QFile::exists(path)) {
    m_files->addPath(path);
  }
}

void Watcher::onPortalSettingChanged(const QString& nameSpace, const QString& key,
                                     const QDBusVariant& value) {
  Q_UNUSED(key)
  Q_UNUSED(value)
  if (nameSpace == QLatin1String(APPEARANCE_NS)) {
    emit changed();
  }
}

void Watcher::onFileChanged(const QString& path) {
  // Settings are saved by writing a temporary file and renaming it over the old
  // one, which drops the watch with the inode it was holding. Re-arm it, or the
  // first scheme change is the only one ever seen.
  if (!m_files->files().contains(path) && QFile::exists(path)) {
    m_files->addPath(path);
  }
  emit changed();
}

}  // namespace system_palette
