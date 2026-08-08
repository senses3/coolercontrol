// SPDX-FileCopyrightText: 2025 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

#ifndef NOTIFIER_H
#define NOTIFIER_H

#include <QString>

namespace Notifier {

/// Sends a desktop notification via D-Bus (freedesktop Notifications spec).
/// icon: 1=triggered, 2=resolved, 3=error, 4=info, 5=shutdown, 0=fallback.
void send(const QString& summary, const QString& body, int icon, bool audio = false,
          int urgency = 1);

}  // namespace Notifier

#endif  // NOTIFIER_H
