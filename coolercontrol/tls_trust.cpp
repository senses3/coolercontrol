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

#include "tls_trust.h"

#include <QCryptographicHash>
#include <QHostAddress>
#include <QSettings>
#include <QStringBuilder>

#include "constants.h"

namespace tls_trust {

namespace {

/// Pins are keyed by host and port, so moving the daemon to another machine is a new
/// decision rather than a silently reused one.
QString pinKey(const QString& host, const int port) {
  return QString(SETTING_GROUP_TLS_PINS.data()) % "/" % host.toLower() % ":" %
         QString::number(port);
}

}  // namespace

bool isLoopback(const QString& host) {
  const auto lowered = host.toLower();
  if (lowered == QLatin1String("localhost")) {
    return true;
  }
  const QHostAddress address(host);
  return !address.isNull() && address.isLoopback();
}

bool strictModeEnabled() {
  const QSettings settings;
  return settings.value(SETTING_TLS_STRICT.data(), false).toBool();
}

QString fingerprint(const QSslCertificate& certificate) {
  if (certificate.isNull()) {
    return {};
  }
  const auto digest = certificate.digest(QCryptographicHash::Sha256).toHex();
  // Grouped into byte pairs so a user can compare it against the daemon's output
  // without losing their place.
  QString grouped;
  for (int i = 0; i < digest.size(); i += 2) {
    if (i > 0) {
      grouped += ':';
    }
    grouped += QString::fromLatin1(digest.mid(i, 2));
  }
  return grouped;
}

QString storedPin(const QString& host, const int port) {
  const QSettings settings;
  return settings.value(pinKey(host, port)).toString();
}

void storePin(const QString& host, const int port, const QString& fingerprint) {
  QSettings settings;
  settings.setValue(pinKey(host, port), fingerprint);
  settings.sync();
}

Decision decide(const QString& host, const int port, const QSslCertificate& leaf,
                const bool chainIsValid) {
  if (chainIsValid) {
    return Decision::Accept;  // a normally valid certificate needs no special case
  }
  if (strictModeEnabled()) {
    return Decision::Reject;
  }
  if (isLoopback(host)) {
    return Decision::Accept;
  }
  const auto current = fingerprint(leaf);
  if (current.isEmpty()) {
    return Decision::Reject;  // nothing to pin against
  }
  const auto pinned = storedPin(host, port);
  if (pinned.isEmpty()) {
    return Decision::AskFirstUse;
  }
  return pinned == current ? Decision::Accept : Decision::AskChanged;
}

}  // namespace tls_trust
