// CoolerControl - monitor and control your cooling and other devices
// Copyright (c) 2021-2025  Guy Boldon and contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
