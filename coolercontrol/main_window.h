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

#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QCloseEvent>
#include <QMainWindow>
#include <QMenu>
#include <QNetworkAccessManager>
#include <QPainter>
#include <QSystemTrayIcon>
#include <QWebChannel>
#include <QWebEngineCertificateError>
#include <QWebEngineProfile>
#include <QWebEngineView>

#include "address_wizard.h"
#include "ipc.h"

// forward declaration:
class IPC;

class MainWindow final : public QMainWindow {
  Q_OBJECT

 public:
  explicit MainWindow(QWidget* parent = nullptr);

  void handleStartInTray();

  // Escape hatch for --no-discard, so a bad interaction on some desktop has a
  // workaround that does not require a rebuild.
  void setDiscardEnabled(bool enabled);

  static void delay(int millisecondsWait);

  void setActiveMode(const QString& modeUID) const;

 public slots:
  void forceQuit();

  void forceRefresh() const;

  void reestablishDaemonConnection() const;

  void tryDaemonConnection();

  void startWatchingSSE() const;

  void setZoomFactor(double zoomFactor) const;

  void setTrayMenuModes(const QString& modesJson) const;

  void acknowledgeDaemonErrors() const;

  // Set by the UI over IPC: whether any enabled, active, unsilenced alert exists.
  void setAlertsActive(bool active) const;

 signals:
  void forceQuitSignal();

  void forceRefreshSignal();

  void daemonConnectionLost() const;

  void watchForSSE() const;

  void dropConnections() const;

  void setZoomFactorSignal(double zoomFactor) const;

  void setTrayMenuModesSignal(const QString& modesJson) const;

  void acknowledgeDaemonErrorsSignal() const;

  void setAlertsActiveSignal(bool active) const;

 protected:
  void closeEvent(QCloseEvent* event) override;

  void hideEvent(QHideEvent* event) override;

  void showEvent(QShowEvent* event) override;

 private:
  QWebEngineView* m_view;
  QWebEngineProfile* m_profile;
  QWebEnginePage* m_page;
  QWebChannel* m_channel;
  IPC* m_ipc;
  QSystemTrayIcon* m_sysTrayIcon;
  QMenu* m_trayIconMenu;
  QMenu* m_modesTrayMenu;
  QAction* m_quitAction;
  QAction* m_addressAction;
  QAction* m_showAction;
  QWizard* m_wizard;
  QNetworkAccessManager* m_manager;
  QTimer* m_retryTimer;
  // Delays the discard so a quick hide/show toggle never pays a page reload.
  QTimer* m_discardTimer;
  bool m_discardEnabled{true};
  // Set when the daemon reconnects while hidden. A discarded page reloads on its own
  // when reactivated, so the refresh is deferred to the next show instead of
  // resurrecting a renderer nobody is looking at.
  mutable bool m_reloadOnShow{false};
  mutable bool m_forceQuit{false};
  mutable bool m_startup{true};
  mutable bool m_webLoadFinished{false};
  mutable bool m_loginWindowShown{false};
  mutable bool m_uiLoadingStopped{false};
  mutable bool m_changeAddress{false};
  mutable bool m_daemonHasErrors{false};
  mutable bool m_daemonHasWarnings{false};
  // Pushed from the UI over IPC; the UI is the source of truth for alert state.
  mutable bool m_uiAlertsActive{false};
  int m_uiLoadRetryCount{0};
  static constexpr int MAX_UI_LOAD_RETRIES = 3;

  // This is empty when there is currently no active mode:
  mutable QString m_activeModeUID{QString()};

  // Bearer token this app owns, so the tray keeps working without a live renderer.
  // Empty until provisioned from a valid session; cleared on 401.
  mutable QByteArray m_accessToken{QByteArray()};

  void initWizard();

  void initSystemTray();

  void initWebUI();

  void initDelay() const;

  static QUrl getDaemonUrl(bool forceHttp = false);

  static QUrl getEndpointUrl(const QString& endpoint, bool forceHttp = false);

  // Every request this app originates goes through here, so the tray keeps working
  // when the renderer (and with it the session cookie's owner) is gone.
  void applyAuth(QNetworkRequest& request) const;

  void loadAccessToken() const;

  // Mints a write-capable token off the current session. Write access is required
  // because the tray's Modes submenu POSTs /modes-active/{uid}.
  void provisionAccessToken() const;

  void clearAccessToken() const;

  // Removes a token this app previously owned but no longer holds. Session-only route,
  // so it runs from the provision path where the cookie is known good.
  void deleteAccessToken(const QString& tokenId) const;

  void displayAddressWizard() const;

  // Tears down the renderer process while the window is in the tray. The page object
  // survives and reloads itself on reactivation.
  void discardPage() const;

  void restorePage() const;

  void setTrayActionToShow() const;

  void setTrayActionToHide() const;

  void requestDaemonErrors() const;

  void requestAllModes() const;

  void requestActiveMode() const;

  void watchDaemonEvents() const;

  void handleLogEvent(const QString& log) const;

  void handleModeEvent(const QString& data) const;

  void handleNotificationEvent(const QString& data) const;

  void showVersionMismatchDialog(const QString& daemonVersion) const;

  static void notifyDaemonConnectionError();

  static void notifyDaemonErrors();

  static void notifyDaemonDisconnected();

  static void notifyDaemonConnectionRestored();

  static QIcon createIconWithNotificationBadge(const QIcon& baseIcon, bool redColor);

  void applyTrayIconNotificationBadge(bool forceBadge = false) const;
};
#endif  // MAINWINDOW_H
