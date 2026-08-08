// SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

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
