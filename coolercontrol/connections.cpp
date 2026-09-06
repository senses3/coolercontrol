// SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

#include "connections.h"

#include <QDebug>
#include <QSet>
#include <QSettings>

#include "tls_trust.h"

namespace connections {

namespace {

constexpr auto KEY_NAME = "name";
constexpr auto KEY_HOST = "host";
constexpr auto KEY_PORT = "port";
constexpr auto KEY_SSL = "ssl";
constexpr auto KEY_STRICT_TLS = "strictTls";

QString endpoint(const Connection& connection) {
  return tls_trust::hostPort(connection.host, connection.port);
}

}  // namespace

bool sameConnection(const Connection& lhs, const Connection& rhs) {
  return endpoint(lhs) == endpoint(rhs) && lhs.sslEnabled == rhs.sslEnabled &&
         lhs.tlsStrict == rhs.tlsStrict;
}

QList<Connection> all() {
  QSettings settings;
  QList<Connection> list;
  const auto size = settings.beginReadArray(SETTING_GROUP_CONNECTIONS.data());
  list.reserve(size);
  for (auto i = 0; i < size; ++i) {
    settings.setArrayIndex(i);
    Connection connection;
    connection.name = settings.value(KEY_NAME).toString();
    connection.host = settings.value(KEY_HOST).toString();
    connection.port = settings.value(KEY_PORT, DEFAULT_DAEMON_PORT).toInt();
    connection.sslEnabled = settings.value(KEY_SSL, DEFAULT_DAEMON_SSL_ENABLED).toBool();
    connection.tlsStrict = settings.value(KEY_STRICT_TLS, false).toBool();
    if (connection.host.isEmpty()) {
      continue;  // hand-edited away: offering a row that cannot connect helps nobody
    }
    list.append(connection);
  }
  settings.endArray();
  return list;
}

void saveAll(const QList<Connection>& list) {
  QList<Connection> unique;
  QSet<QString> seen;
  unique.reserve(list.size());
  for (const auto& connection : list) {
    if (connection.host.isEmpty()) {
      continue;
    }
    if (const auto key = endpoint(connection); !seen.contains(key)) {
      seen.insert(key);
      unique.append(connection);
    }
  }
  QSettings settings;
  // beginWriteArray only rewrites the size, so a shorter list would leave the tail
  // entries behind. The group holds nothing else, so removing it wholesale is safe.
  settings.remove(SETTING_GROUP_CONNECTIONS.data());
  settings.beginWriteArray(SETTING_GROUP_CONNECTIONS.data(), unique.size());
  for (auto i = 0; i < unique.size(); ++i) {
    settings.setArrayIndex(i);
    settings.setValue(KEY_NAME, unique.at(i).name);
    settings.setValue(KEY_HOST, unique.at(i).host);
    settings.setValue(KEY_PORT, unique.at(i).port);
    settings.setValue(KEY_SSL, unique.at(i).sslEnabled);
    settings.setValue(KEY_STRICT_TLS, unique.at(i).tlsStrict);
  }
  settings.endArray();
  settings.sync();
}

void upsert(const Connection& connection) {
  if (connection.host.isEmpty()) {
    return;
  }
  auto list = all();
  const auto key = endpoint(connection);
  for (auto i = 0; i < list.size(); ++i) {
    if (endpoint(list.at(i)) == key) {
      list[i] = connection;
      saveAll(list);
      return;
    }
  }
  list.append(connection);
  saveAll(list);
}

Connection current() {
  const QSettings settings;
  Connection connection;
  connection.host =
      settings.value(SETTING_DAEMON_ADDRESS.data(), DEFAULT_DAEMON_ADDRESS.data()).toString();
  connection.port = settings.value(SETTING_DAEMON_PORT.data(), DEFAULT_DAEMON_PORT).toInt();
  connection.sslEnabled =
      settings.value(SETTING_DAEMON_SSL_ENABLED.data(), DEFAULT_DAEMON_SSL_ENABLED).toBool();
  connection.tlsStrict = settings.value(SETTING_TLS_STRICT.data(), false).toBool();
  return connection;
}

int currentIndex() {
  const auto live = endpoint(current());
  const auto list = all();
  for (auto i = 0; i < list.size(); ++i) {
    if (endpoint(list.at(i)) == live) {
      return i;
    }
  }
  return -1;
}

void setCurrent(const Connection& connection) {
  QSettings settings;
  settings.setValue(SETTING_DAEMON_ADDRESS.data(), connection.host);
  settings.setValue(SETTING_DAEMON_PORT.data(), connection.port);
  settings.setValue(SETTING_DAEMON_SSL_ENABLED.data(), connection.sslEnabled);
  settings.setValue(SETTING_TLS_STRICT.data(), connection.tlsStrict);
  settings.sync();  // callers reload immediately and read these back
}

QString displayName(const Connection& connection) {
  const auto trimmed = connection.name.trimmed();
  return trimmed.isEmpty() ? endpoint(connection) : trimmed;
}

void ensureMigrated() {
  if (!all().isEmpty()) {
    return;
  }
  // Either a fresh install, where the defaults give a sensible localhost row, or an
  // upgrade, where the flat keys are the one daemon this app has been talking to.
  saveAll({current()});
  qInfo() << "Created the saved daemon connection list.";
}

}  // namespace connections
