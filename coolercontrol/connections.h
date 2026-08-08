// SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

#ifndef CONNECTIONS_H
#define CONNECTIONS_H

#include <QList>
#include <QString>

#include "constants.h"

/*
  The daemons this app knows about. One is live at a time.

  Which one is live is deliberately not stored here. It stays in the flat
  daemonAddress/daemonPort/daemonSSLEnabled/tlsStrict keys the rest of the app already
  reads, and currentIndex() is simply the saved entry addressing that daemon. So every
  getDaemonUrl() caller is untouched, there is no index to repair when the list is
  reordered or shortened, and an older build still reads the flat keys and works.

  Entries are identified by host:port, the same identity tls_trust and the tray's pinned
  sensors already key on. That is why a duplicate host:port is refused: two entries would
  otherwise share one machine's pins, sensors and token.
*/
namespace connections {

struct Connection {
  QString name;  // empty means "show host:port"
  QString host;
  int port{DEFAULT_DAEMON_PORT};
  bool sslEnabled{DEFAULT_DAEMON_SSL_ENABLED};
  bool tlsStrict{false};
};

/// Whether both address the same daemon the same way. Names are not compared: renaming
/// an entry must not cost a reconnect.
bool sameConnection(const Connection& lhs, const Connection& rhs);

/// Saved list, in user order. Never empty once ensureMigrated() has run.
QList<Connection> all();

/// Replaces the whole list. Drops entries with no host and any duplicate host:port.
void saveAll(const QList<Connection>& list);

/// Appends, or replaces the entry addressing the same host:port. Keeps the invariant
/// that the live daemon is always one of the saved ones.
void upsert(const Connection& connection);

/// The connection currently live.
Connection current();

/// Index into all() of the live connection, or -1 when it is not saved.
int currentIndex();

/// Points the flat keys at this connection. The caller owns the reload.
void setCurrent(const Connection& connection);

/// The name, or "host:port" when unnamed.
QString displayName(const Connection& connection);

/// Folds the flat keys into a one-entry list on first run. Idempotent, and must run
/// before anything reads the list.
void ensureMigrated();

}  // namespace connections

#endif  // CONNECTIONS_H
