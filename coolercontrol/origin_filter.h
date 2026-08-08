// SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

#ifndef ORIGIN_FILTER_H
#define ORIGIN_FILTER_H

#include <QMutex>
#include <QUrl>
#include <QWebEngineUrlRequestInterceptor>

/*
  Confines the web engine to the configured daemon.

  This app embeds a browser, and its address is user-configurable, so a mistyped or
  malicious address would otherwise be rendered like any web page: scripts, remote
  fonts, outbound requests and all. The daemon serves a strict CSP, but that only
  applies once you are actually talking to the daemon; it does nothing for a host that
  is not one.

  So requests are allowed only to the configured origin, plus the local schemes Qt and
  the SPA legitimately need. External links are unaffected: they never reach here,
  because newWindowRequested hands them to the system browser instead.
*/
class OriginFilter final : public QWebEngineUrlRequestInterceptor {
 public:
  explicit OriginFilter(QObject* parent = nullptr);

  /// Called from the UI thread whenever the daemon address changes.
  void setDaemonUrl(const QUrl& url);

  void interceptRequest(QWebEngineUrlRequestInfo& info) override;

 private:
  // interceptRequest may run off the UI thread, so the origin it compares against is
  // guarded rather than read straight from QSettings.
  mutable QMutex m_mutex;
  QString m_scheme;
  QString m_host;
  int m_port{-1};

  bool isAllowed(const QUrl& url) const;
};

#endif  // ORIGIN_FILTER_H
