#  Coolero - monitor and control your cooling and other devices
#  Copyright (c) 2022  Guy Boldon
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

from dataclasses import dataclass, field
from typing import Optional, List

from PySide6.QtWidgets import QWidget, QSlider, QCheckBox

from view.widgets.color_button.color_button import ColorButton


@dataclass
class LightingModeWidgets:
    channel_btn_id: str
    mode: QWidget
    speed: Optional[QSlider] = None
    mode_speeds: List[str] = field(default_factory=list)
    backwards: Optional[QCheckBox] = None
    active_colors: int = 0
    color_buttons: List[ColorButton] = field(default_factory=list)