// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

#ifndef SYSTEM_PALETTE_H
#define SYSTEM_PALETTE_H

#include <QDBusVariant>
#include <QObject>
#include <QString>

class QFileSystemWatcher;

/*
  The desktop's own colors, for the UI's System theme.

  Two sources, because the desktops publish different amounts. KDE writes its
  resolved palette to kdeglobals, a plain INI any process can read, so the whole
  token set is available. Everywhere else only the XDG appearance portal answers,
  and it carries an accent and a light/dark preference and nothing more: the rest
  of a GTK palette lives inside GTK, where a Qt process cannot reach it.
*/
namespace system_palette {

/*
  A JSON object for the UI, or an empty string when the desktop offers nothing:

    {"variant":"dark","accent":"#3daee9","tokens":{...}}

  Each field is omitted when unknown. `tokens` carries the UI's full ThemeTokens
  set and appears only when a complete palette was found.
*/
QString readAsJson();

/*
  Reports when the desktop's colors change, so the UI can follow without a
  restart. Both sources are watched: the portal announces accent and light/dark
  changes on every desktop, and kdeglobals covers the KDE scheme edits that the
  portal has no key for.
*/
class Watcher final : public QObject {
  Q_OBJECT

 public:
  explicit Watcher(QObject* parent = nullptr);

 signals:
  void changed();

 private slots:
  void onPortalSettingChanged(const QString& nameSpace, const QString& key,
                              const QDBusVariant& value);
  void onFileChanged(const QString& path);

 private:
  QFileSystemWatcher* m_files;
};

}  // namespace system_palette

#endif  // SYSTEM_PALETTE_H
