#  Coolero - monitor and control your cooling and other devices
#  Copyright (c) 2021  Guy Boldon
#  |
#  This program is free software: you can redistribute it and/or modify
#  it under the terms of the GNU General Public License as published by
#  the Free Software Foundation, either version 3 of the License, or
#  (at your option) any later version.
#  |
#  This program is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU General Public License for more details.
#  |
#  You should have received a copy of the GNU General Public License
#  along with this program.  If not, see <https://www.gnu.org/licenses/>.
# ----------------------------------------------------------------------------------------------------------------------

import logging
from typing import Dict

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import QMessageBox, QGraphicsDropShadowEffect, QCheckBox

from dialogs.dialog_style import DIALOG_STYLE
from settings import Settings, UserSettings

_LOG = logging.getLogger(__name__)


class Legacy690Dialog(QMessageBox):

    def __init__(self, device_id: int) -> None:
        super().__init__()
        self.device_id: int = device_id
        self._dialog_style = DIALOG_STYLE.format(
            _text_size=Settings.app["font"]["text_size"],
            _font_family=Settings.app["font"]["family"],
            _text_color=Settings.theme["app_color"]["text_foreground"],
            _bg_color=Settings.theme["app_color"]["bg_one"]
        )
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(20)
        shadow.setXOffset(0)
        shadow.setYOffset(0)
        shadow.setColor(QColor(0, 0, 0, 160))
        self.setGraphicsEffect(shadow)
        self.setTextFormat(Qt.TextFormat.RichText)
        self.setWindowTitle('Device Unknown')
        self.setText(
            '''
            <center><h4>User Confirmation Requested.</h4></center>
            '''
        )
        self.setInformativeText(
            f'''
            <p>There are a several devices that have the same device ID and Coolero is not able
            to determine which device is connected.</p>
            <p>For connected device #{self.device_id}, is it one of the following?<br/>
            NZXT Kraken X40, X60, X31, X41, X51 or X61</p>
            <p><i>*Choosing incorrectly may require a restart.</i></p>
            <br/>
            '''
        )
        self.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
        self.setDefaultButton(QMessageBox.No)
        self.setButtonText(QMessageBox.Yes, "Yes, it's one of the NZXT Krakens")
        self.setButtonText(QMessageBox.No, "No, it's a EVGA CLC")
        self.check_box = QCheckBox("Remember my choice")
        self.setCheckBox(self.check_box)
        self.setStyleSheet(self._dialog_style)

    def ask(self) -> bool:
        is_legacy_690_answer: int = self.exec()
        is_legacy_690: bool = (is_legacy_690_answer == QMessageBox.Yes)
        if self.check_box.isChecked():
            current_devices: Dict[int, bool] = Settings.user.value(UserSettings.LEGACY_690LC, defaultValue={})
            current_devices[self.device_id] = is_legacy_690
            Settings.user.setValue(UserSettings.LEGACY_690LC, current_devices)
        return is_legacy_690