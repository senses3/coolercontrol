// SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

#ifndef TLS_TRUST_H
#define TLS_TRUST_H

#include <QList>
#include <QPair>
#include <QSslCertificate>
#include <QString>

/*
  Whether to trust the daemon's TLS certificate.

  The daemon ships a self-signed certificate, so a plain "reject anything unsigned by a
  CA" rule would break every default install. The policy instead splits by where the
  daemon is:

    * loopback: accept silently. Nothing is on the wire to intercept, and this is what
      almost every desktop install is.
    * remote, certificate already pinned: accept silently.
    * remote, not yet pinned: ask once, then pin. Trust on first use, the same bargain
      ssh makes, and the only one that protects a self-signed setup without a CA.
    * remote, pinned certificate no longer matches: ask again, with different wording.
      This is the case that actually matters, so it must never pass silently.

  Strict mode (off by default) skips all of that and requires a certificate that
  validates normally.
*/
namespace tls_trust {

enum class Decision {
  Accept,       ///< Trusted: loopback, a matching pin, or a valid chain.
  Reject,       ///< Strict mode, or the user declined.
  AskFirstUse,  ///< Remote and unpinned; confirm, then pin.
  AskChanged,   ///< Remote, pinned, and the certificate changed.
};

/// Canonical "host:port" key for one daemon, IPv6 literals bracketed. Pins use it, and
/// so does anything else that caches state belonging to a single daemon.
QString hostPort(const QString& host, int port);

bool isLoopback(const QString& host);

bool strictModeEnabled();

/// Lowercase hex SHA-256 of the leaf certificate, grouped for reading aloud.
QString fingerprint(const QSslCertificate& certificate);

/// Pin recorded for `host:port`, or an empty string when there is none.
QString storedPin(const QString& host, int port);

void storePin(const QString& host, int port, const QString& fingerprint);

/// Every pin, as ("host:port", fingerprint), so the user can see what they trusted.
QList<QPair<QString, QString>> allPins();

void forgetAllPins();

/// `chainIsValid` is what the transport already concluded, so a properly signed
/// certificate short-circuits everything below it.
Decision decide(const QString& host, int port, const QSslCertificate& leaf, bool chainIsValid);

}  // namespace tls_trust

#endif  // TLS_TRUST_H
