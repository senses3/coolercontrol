// SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

#include "translations.h"

#include <QDebug>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSettings>
#include <QStringBuilder>

#include "constants.h"

void cacheUiStrings(const QString& translationsJson) {
  const auto obj = QJsonDocument::fromJson(translationsJson.toUtf8()).object();
  if (obj.isEmpty()) {
    qWarning() << "Ignoring empty translation payload from the UI.";
    return;
  }
  QSettings settings;
  settings.beginGroup(SETTING_GROUP_TRANSLATIONS.data());
  // Replaced wholesale so switching locale cannot leave stale strings behind.
  settings.remove(QString());
  for (auto it = obj.constBegin(); it != obj.constEnd(); ++it) {
    settings.setValue(it.key(), it.value().toString());
  }
  settings.endGroup();
  qDebug() << "Cached" << obj.size() << "UI strings for Qt-rendered surfaces.";
}

QString uiString(const QString& key, const QString& fallback) {
  const QSettings settings;
  const auto value =
      settings.value(QString(SETTING_GROUP_TRANSLATIONS.data()) % "/" % key).toString();
  return value.isEmpty() ? fallback : value;
}
