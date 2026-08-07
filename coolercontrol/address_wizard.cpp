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

namespace {

/// Hidden until there is something to say, and selectable so a user can paste it into
/// a bug report.
QLabel* newErrorLabel() {
  auto* label = new QLabel;
  label->setWordWrap(true);
  label->setTextInteractionFlags(Qt::TextSelectableByMouse);
  label->hide();
  return label;
}

void applyErrorLabel(QLabel* label, const QString& detail) {
  if (detail.isEmpty()) {
    label->clear();
    label->hide();
    return;
  }
  label->setText("<p><b>" %
                 uiString("wizard.lastError", QObject::tr("Last error:")).toHtmlEscaped() %
                 "</b> " % detail.toHtmlEscaped() % "</p>");
  label->show();
}

}  // namespace

IntroPage::IntroPage(QWidget* parent) : QWizardPage(parent) {
  // Assembled from parts so the shell commands stay out of translation, and so the
  // docs link can be placed wherever a language needs it.
  const auto docsLink = QStringLiteral(
                            "<a href=\"https://docs.coolercontrol.org\" "
                            "target=\"_blank\">%1</a>")
                            .arg(uiString("wizard.introDocsLink", tr("docs website")));
  // Swapped by setError: opening this from the tray is not a failure, and saying a
  // connection could not be established when one is up reads as a bug.
  m_leadLabel = new QLabel;
  m_leadLabel->setWordWrap(true);
  m_leadLabel->setTextInteractionFlags(Qt::TextSelectableByMouse);

  m_label = new QLabel(
      "<p>" %
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

  // "Could not connect" on its own leaves the user guessing between a stopped
  // service, a wrong port, and a refused certificate. Those need different fixes, so
  // the transport's own reason is worth the one line it costs.
  m_errorLabel = newErrorLabel();

  auto* layout = new QVBoxLayout;
  layout->addWidget(m_errorLabel);
  layout->addWidget(m_leadLabel);
  layout->addWidget(m_label);
  setLayout(layout);
}

void IntroPage::setError(const QString& detail) const {
  applyErrorLabel(m_errorLabel, detail);
  if (detail.isEmpty()) {
    m_leadLabel->setText("<p>" %
                         uiString("wizard.introPurpose",
                                  tr("These settings control how the desktop app connects to the "
                                     "CoolerControl daemon.")) %
                         "</p>");
    return;
  }
  m_leadLabel->setText(
      "<p>" %
      uiString("wizard.introFailed",
               tr("A connection to the CoolerControl Daemon could not be established.")) %
      "<br/>" %
      uiString("wizard.introCheckService",
               tr("Please make sure that the systemd service is running and available.")) %
      "</p>");
}

AddressPage::AddressPage(QWidget* parent) : QWizardPage(parent) {
  setTitle(uiString("wizard.addressTitle", tr("Daemon Address - Desktop Application")));
  setSubTitle(uiString("wizard.addressSubtitle", tr("Adjust the address fields as necessary.")));

  auto* savedLabel = new QLabel(uiString("wizard.savedLabel", tr("Saved connection:")));
  m_savedCombo = new QComboBox;
  savedLabel->setBuddy(m_savedCombo);
  connect(m_savedCombo, &QComboBox::currentIndexChanged, [this](const int index) {
    if (m_populating || index < 0) {
      return;
    }
    const auto list = connections::all();
    if (index < list.size()) {
      showConnection(list.at(index));
    } else {
      // The trailing "New connection" row. Nothing is saved until Apply.
      m_nameLineEdit->clear();
      resetAddressInputValues();
    }
    refreshRemoveButton();
  });

  m_removeButton = new QPushButton(uiString("wizard.removeConnection", tr("Remove")));
  m_removeButton->setToolTip(
      uiString("wizard.removeConnectionTooltip", tr("Forget the selected daemon.")));
  connect(m_removeButton, &QPushButton::clicked, [this]() {
    const auto index = m_savedCombo->currentIndex();
    auto list = connections::all();
    if (index < 0 || index >= list.size() || list.size() < 2) {
      return;  // the last one cannot go: the app always needs somewhere to connect
    }
    QMessageBox dialog;
    dialog.setIcon(QMessageBox::Question);
    const auto title = uiString("wizard.removeConnection", tr("Remove"));
    dialog.setWindowTitle(title);
    dialog.setText(title);
    dialog.setInformativeText(
        uiString("wizard.removeConnectionBody", tr("Stop offering this daemon in the tray?")) %
        "\n\n" % connections::displayName(list.at(index)));
    const auto removeButton = dialog.addButton(title, QMessageBox::AcceptRole);
    dialog.addButton(uiString("cert.cancel", tr("Cancel")), QMessageBox::RejectRole);
    dialog.setDefaultButton(nullptr);
    dialog.exec();
    if (dialog.clickedButton() != removeButton) {
      return;
    }
    list.removeAt(index);
    connections::saveAll(list);
    reload();
  });

  auto* nameLabel = new QLabel(uiString("wizard.nameLabel", tr("Name:")));
  m_nameLineEdit = new QLineEdit;
  nameLabel->setBuddy(m_nameLineEdit);
  m_nameLineEdit->setToolTip(
      uiString("wizard.nameTooltip", tr("Optional label for this daemon. Blank shows host:port.")));
  registerField("name", m_nameLineEdit);

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

  m_errorLabel = newErrorLabel();

  auto* layout = new QGridLayout;
  auto* spacer = new QSpacerItem(1, 20, QSizePolicy::Expanding, QSizePolicy::Minimum);
  auto* savedButtons = new QHBoxLayout;
  savedButtons->addWidget(m_savedCombo, 1);
  savedButtons->addWidget(m_removeButton);
  layout->addWidget(m_errorLabel, 0, 0, 1, 2);
  layout->addWidget(savedLabel, 1, 0);
  layout->addLayout(savedButtons, 1, 1);
  layout->addWidget(nameLabel, 2, 0);
  layout->addWidget(m_nameLineEdit, 2, 1);
  layout->addWidget(addressLabel, 3, 0);
  layout->addWidget(m_addressLineEdit, 3, 1);
  layout->addWidget(portLabel, 4, 0);
  layout->addWidget(m_portLineEdit, 4, 1);
  layout->addWidget(m_sslCheckbox, 5, 0, 1, 2);
  layout->addWidget(m_strictTlsCheckbox, 6, 0, 1, 2);
  layout->addItem(spacer, 7, 0, 1, 2);
  layout->addWidget(m_defaultButton, 8, 0, 1, 1);
  layout->addWidget(m_forgetCertsButton, 8, 1, 1, 1);
  setLayout(layout);

  reload();
}

void AddressPage::showConnection(const connections::Connection& connection) const {
  m_nameLineEdit->setText(connection.name);
  m_addressLineEdit->setText(connection.host);
  m_portLineEdit->setText(QString::number(connection.port));
  m_sslCheckbox->setChecked(connection.sslEnabled);
  m_strictTlsCheckbox->setChecked(connection.tlsStrict);
}

connections::Connection AddressPage::editedConnection() const {
  connections::Connection edited;
  edited.name = m_nameLineEdit->text();
  edited.host = m_addressLineEdit->text();
  edited.port = m_portLineEdit->text().toInt();
  edited.sslEnabled = m_sslCheckbox->isChecked();
  edited.tlsStrict = m_strictTlsCheckbox->isChecked();
  return edited;
}

connections::Connection AddressPage::commit() const {
  auto list = connections::all();
  const auto edited = editedConnection();
  // Past the end of the saved rows means the "New connection" row was selected.
  if (const auto index = m_savedCombo->currentIndex(); index >= 0 && index < list.size()) {
    list[index] = edited;
  } else {
    list.append(edited);
  }
  connections::saveAll(list);
  return edited;
}

void AddressPage::refreshRemoveButton() const {
  // Only a saved row can go, never the last one, and never the daemon in use: removing
  // that would leave the app connected to something no longer on the list.
  const auto index = m_savedCombo->currentIndex();
  const auto saved = connections::all().size();
  m_removeButton->setEnabled(saved > 1 && index >= 0 && index < saved &&
                             index != connections::currentIndex());
}

void AddressPage::reload() const {
  const auto list = connections::all();
  const auto live = connections::currentIndex();
  m_populating = true;
  m_savedCombo->clear();
  for (const auto& connection : list) {
    m_savedCombo->addItem(connections::displayName(connection));
  }
  // Selecting this blanks the fields; Apply is what actually saves it.
  m_savedCombo->addItem(uiString("wizard.newConnection", tr("New connection…")));
  // Falls back to the first row when the live daemon is not saved, which only happens
  // if the file was hand-edited.
  const auto selected = live >= 0 ? live : 0;
  m_savedCombo->setCurrentIndex(selected);
  m_populating = false;
  if (selected < list.size()) {
    showConnection(list.at(selected));
  } else {
    showConnection(connections::current());
  }
  refreshRemoveButton();
  refreshForgetCertsButton();
}

void AddressPage::resetAddressInputValues() const {
  // The name is left alone: it is the user's label for this row, not an address field.
  m_addressLineEdit->setText(DEFAULT_DAEMON_ADDRESS.data());
  m_portLineEdit->setText(QString::number(DEFAULT_DAEMON_PORT));
  m_sslCheckbox->setChecked(DEFAULT_DAEMON_SSL_ENABLED);
  m_strictTlsCheckbox->setChecked(false);
}

void AddressPage::setError(const QString& detail) const { applyErrorLabel(m_errorLabel, detail); }

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
