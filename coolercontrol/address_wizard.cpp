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

#include "address_wizard.h"

#include <QCheckBox>
#include <QDebug>
#include <QIntValidator>
#include <QLineEdit>
#include <QMessageBox>
#include <QRegularExpression>
#include <QRegularExpressionValidator>
#include <QStringBuilder>
#include <QVBoxLayout>

#include "constants.h"
#include "tls_trust.h"
#include "translations.h"

IntroPage::IntroPage(QWidget* parent) : QWizardPage(parent) {
  // Assembled from parts so the shell commands stay out of translation, and so the
  // docs link can be placed wherever a language needs it.
  const auto docsLink = QStringLiteral(
                            "<a href=\"https://docs.coolercontrol.org\" "
                            "target=\"_blank\">%1</a>")
                            .arg(uiString("wizard.introDocsLink", tr("docs website")));
  m_label = new QLabel(
      "<p>" %
      uiString("wizard.introFailed",
               tr("A connection to the CoolerControl Daemon could not be established.")) %
      "<br/>" %
      uiString("wizard.introCheckService",
               tr("Please make sure that the systemd service is running and available.")) %
      "</p><p>" %
      uiString("wizard.introDocs", tr("Check the %1 for installation instructions."))
          .arg(docsLink) %
      "</p><p>" %
      uiString("wizard.introCommands",
               tr("Some helpful commands to enable and verify the daemon status:")) %
      "</p>"
      "<p><code>"
      "sudo systemctl enable --now coolercontrold<br />"
      "sudo systemctl status coolercontrold<br />"
      "</code></p><p>" %
      uiString("wizard.introCustomAddress",
               tr("If you have configured a non-standard address to connect to the daemon, "
                  "you can set it in the following steps:")) %
      "</p>");
  m_label->setWordWrap(true);
  m_label->setOpenExternalLinks(true);
  m_label->setTextInteractionFlags(Qt::TextSelectableByMouse | Qt::LinksAccessibleByMouse);

  auto* layout = new QVBoxLayout;
  layout->addWidget(m_label);
  setLayout(layout);
}

AddressPage::AddressPage(QWidget* parent) : QWizardPage(parent) {
  setTitle(uiString("wizard.addressTitle", tr("Daemon Address - Desktop Application")));
  setSubTitle(uiString("wizard.addressSubtitle", tr("Adjust the address fields as necessary.")));

  auto* addressLabel = new QLabel(uiString("wizard.hostLabel", tr("Host address:")));
  m_addressLineEdit = new QLineEdit;
  addressLabel->setBuddy(m_addressLineEdit);
  m_addressLineEdit->setToolTip(
      uiString("wizard.hostTooltip",
               tr("The IPv4, IPv6 address or hostname to use to communicate with the daemon.")));
  m_addressLineEdit->setValidator(
      new QRegularExpressionValidator(QRegularExpression("[0-9a-zA-Z.-]+")));
  registerField("address", m_addressLineEdit);

  auto* portLabel = new QLabel(uiString("wizard.portLabel", tr("Port:")));
  m_portLineEdit = new QLineEdit;
  portLabel->setBuddy(m_portLineEdit);
  m_portLineEdit->setToolTip(
      uiString("wizard.portTooltip", tr("The port number to use to communicate with the daemon.")));
  m_portLineEdit->setValidator(new QIntValidator(80, 65535, m_portLineEdit));
  registerField("port", m_portLineEdit);

  m_sslCheckbox = new QCheckBox("SSL/TLS");
  m_sslCheckbox->setToolTip(uiString("wizard.sslTooltip", tr("Enable or disable SSL/TLS (HTTPS)")));

  // Off by default: the daemon ships a self-signed certificate, so requiring a valid
  // chain would break the default install. Remote daemons are still protected, by
  // pinning the certificate the first time the user confirms it.
  m_strictTlsCheckbox = new QCheckBox(uiString("wizard.strictTls", tr("Validate certificate")));
  m_strictTlsCheckbox->setToolTip(
      uiString("wizard.strictTlsTooltip",
               tr("Require a certificate that validates normally. Leave off to use the daemon's "
                  "self-signed certificate, which is trusted on first use for remote daemons.")));
  registerField("strictTls", m_strictTlsCheckbox);
  registerField("ssl", m_sslCheckbox);

  m_defaultButton = new QPushButton(uiString("wizard.defaults", tr("Defaults")));
  m_defaultButton->setToolTip(
      uiString("wizard.defaultsTooltip", tr("Reset the daemon address to default values")));
  connect(m_defaultButton, &QPushButton::clicked, [this]() { resetAddressInputValues(); });

  // Certificates for remote daemons are trusted on first use and then remembered. This
  // is the only way to take that back without hand-editing the config file.
  m_forgetCertsButton =
      new QPushButton(uiString("wizard.forgetCerts", tr("Forget Trusted Certificates")));
  m_forgetCertsButton->setToolTip(
      uiString("wizard.forgetCertsTooltip",
               tr("Remove the remote daemon certificates this app has been told to trust.")));
  connect(m_forgetCertsButton, &QPushButton::clicked, [this]() { forgetTrustedCertificates(); });

  auto* layout = new QGridLayout;
  auto* spacer = new QSpacerItem(1, 20, QSizePolicy::Expanding, QSizePolicy::Minimum);
  layout->addWidget(addressLabel, 0, 0);
  layout->addWidget(m_addressLineEdit, 0, 1);
  layout->addWidget(portLabel, 1, 0);
  layout->addWidget(m_portLineEdit, 1, 1);
  layout->addWidget(m_sslCheckbox, 2, 0, 1, 2);
  layout->addWidget(m_strictTlsCheckbox, 3, 0, 1, 2);
  layout->addItem(spacer, 4, 0, 1, 2);
  layout->addWidget(m_defaultButton, 5, 0, 1, 1);
  layout->addWidget(m_forgetCertsButton, 5, 1, 1, 1);
  setLayout(layout);

  const QSettings settings;
  m_addressLineEdit->setText(
      settings.value(SETTING_DAEMON_ADDRESS.data(), DEFAULT_DAEMON_ADDRESS.data()).toString());
  m_portLineEdit->setText(
      QString::number(settings.value(SETTING_DAEMON_PORT.data(), DEFAULT_DAEMON_PORT).toInt()));
  m_sslCheckbox->setChecked(
      settings.value(SETTING_DAEMON_SSL_ENABLED.data(), DEFAULT_DAEMON_SSL_ENABLED).toBool());
  m_strictTlsCheckbox->setChecked(settings.value(SETTING_TLS_STRICT.data(), false).toBool());
  refreshForgetCertsButton();
}

void AddressPage::resetAddressInputValues() const {
  m_addressLineEdit->setText(DEFAULT_DAEMON_ADDRESS.data());
  m_portLineEdit->setText(QString::number(DEFAULT_DAEMON_PORT));
  m_sslCheckbox->setChecked(DEFAULT_DAEMON_SSL_ENABLED);
  m_strictTlsCheckbox->setChecked(false);
}

void AddressPage::refreshForgetCertsButton() const {
  const auto pins = tls_trust::allPins();
  // Nothing to forget on a purely local setup, which is most installs.
  m_forgetCertsButton->setEnabled(!pins.isEmpty());
}

void AddressPage::forgetTrustedCertificates() const {
  const auto pins = tls_trust::allPins();
  if (pins.isEmpty()) {
    return;
  }
  QStringList lines;
  lines.reserve(pins.size());
  for (const auto& [hostPort, fingerprint] : pins) {
    lines << hostPort % "\n    " % fingerprint;
  }
  QMessageBox dialog;
  dialog.setIcon(QMessageBox::Question);
  const auto title = uiString("wizard.forgetCerts", tr("Forget Trusted Certificates"));
  dialog.setWindowTitle(title);
  dialog.setText(title);
  dialog.setInformativeText(
      uiString("wizard.forgetCertsBody",
               tr("These daemon certificates are currently trusted. Forgetting them means "
                  "you will be asked to confirm the next time you connect.")) %
      "\n\n" % lines.join(QStringLiteral("\n")));
  const auto forgetButton = dialog.addButton(title, QMessageBox::AcceptRole);
  dialog.addButton(uiString("cert.cancel", tr("Cancel")), QMessageBox::RejectRole);
  dialog.setDefaultButton(nullptr);
  dialog.exec();
  if (dialog.clickedButton() != forgetButton) {
    return;
  }
  tls_trust::forgetAllPins();
  refreshForgetCertsButton();
  qInfo() << "Forgot" << pins.size() << "trusted daemon certificate(s).";
}
