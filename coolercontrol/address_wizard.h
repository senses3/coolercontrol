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

#ifndef ADDRESSWIZARD_H
#define ADDRESSWIZARD_H

#include <QCheckBox>
#include <QComboBox>
#include <QLabel>
#include <QLineEdit>
#include <QList>
#include <QPushButton>
#include <QSettings>
#include <QWizardPage>

#include "connections.h"

class IntroPage final : public QWizardPage {
  Q_OBJECT

 public:
  explicit IntroPage(QWidget* parent = nullptr);

  /// The concrete reason the last attempt failed. Empty hides the line again.
  void setError(const QString& detail) const;

 private:
  QLabel* m_leadLabel;
  QLabel* m_label;
  QLabel* m_errorLabel;
};

class AddressPage final : public QWizardPage {
  Q_OBJECT

 public:
  explicit AddressPage(QWidget* parent = nullptr);

  /// Re-reads the saved list and the live connection into every widget. The page is
  /// built once with the window, so without this it shows whatever was configured at
  /// startup rather than what is configured now.
  void reload() const;

  /// Folds the visible fields into the selected entry, saves the list, and returns the
  /// connection that should now be live. Editing an entry's address edits that entry
  /// rather than adding a second one.
  [[nodiscard]] connections::Connection commit() const;

  void resetAddressInputValues() const;

  // Lists what is currently trusted and, on confirmation, drops every pin.
  void forgetTrustedCertificates() const;

  void refreshForgetCertsButton() const;

  /// Same as IntroPage's: the wizard reopens on whichever page was last shown, so the
  /// reason has to be on both or it is invisible exactly when it matters.
  void setError(const QString& detail) const;

 private:
  QLabel* m_errorLabel;
  // Picks which saved connection the fields below are editing. Selecting one does not
  // switch to it: Apply does, so the error-recovery flow keeps its single confirm step.
  QComboBox* m_savedCombo;
  QPushButton* m_removeButton;
  QLineEdit* m_nameLineEdit;
  QLineEdit* m_addressLineEdit;
  QLineEdit* m_portLineEdit;
  QCheckBox* m_sslCheckbox;
  QCheckBox* m_strictTlsCheckbox;
  QPushButton* m_defaultButton;
  QPushButton* m_forgetCertsButton;

  // Guards the combo's own handler while reload() repopulates it.
  mutable bool m_populating{false};

  /// Writes the fields from a saved entry, or from the defaults for a new one.
  void showConnection(const connections::Connection& connection) const;

  /// The connection the visible fields currently describe.
  [[nodiscard]] connections::Connection editedConnection() const;

  void refreshRemoveButton() const;
};
#endif  // ADDRESSWIZARD_H
