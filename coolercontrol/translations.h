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

#ifndef TRANSLATIONS_H
#define TRANSLATIONS_H

#include <QString>

/*
  The Qt app renders dialogs and the tray menu itself but has no translation pipeline,
  so those strings would be English-only while the SPA ships twelve locales. Rather than
  maintain a second Linguist catalogue that translators would have to keep in sync, the
  SPA pushes the strings this app needs in the active locale and they are cached here.

  Caching is not an optimization: once the renderer is discarded to the tray there is
  nobody left to ask, and the connection wizard specifically runs when the UI could not
  load at all.
*/

/// Replaces the cached strings with `translationsJson`, a flat key to string map.
/// Ignores an empty payload rather than dropping what is already cached.
void cacheUiStrings(const QString& translationsJson);

/// Cached string for `key`, or `fallback` when the UI has not pushed one yet. That
/// happens on first launch, after a settings reset, and whenever the daemon is
/// unreachable, so every call site needs a sensible English fallback.
QString uiString(const QString& key, const QString& fallback);

#endif  // TRANSLATIONS_H
