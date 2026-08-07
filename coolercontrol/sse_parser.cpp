/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2021-2025  Guy Boldon and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

#include "sse_parser.h"

#include <QStringList>

namespace {

// Strips the single optional space after a field's colon, per the spec.
QString fieldValue(const QString& line, const qsizetype colonIndex) {
  auto value = line.mid(colonIndex + 1);
  if (value.startsWith(' ')) {
    value.remove(0, 1);
  }
  return value;
}

void parseFrame(const QString& frame, const SseParser::EventHandler& onEvent) {
  QString name;
  QStringList dataLines;
  for (const auto& line : frame.split('\n')) {
    if (line.isEmpty() || line.startsWith(':')) {
      continue;  // A comment, which is what a keep-alive tick is.
    }
    const auto colonIndex = line.indexOf(':');
    if (colonIndex < 0) {
      continue;  // A bare field name carries no value we use.
    }
    const auto field = line.left(colonIndex);
    if (field == "event") {
      name = fieldValue(line, colonIndex);
    } else if (field == "data") {
      dataLines.append(fieldValue(line, colonIndex));
    }
    // id and retry are not used by this client.
  }
  if (dataLines.isEmpty()) {
    return;
  }
  onEvent(name, dataLines.join('\n'));
}

}  // namespace

void SseParser::feed(const QByteArray& chunk, const EventHandler& onEvent) {
  m_buffer.append(chunk);
  // Normalize the line endings so one terminator search covers both forms.
  m_buffer.replace("\r\n", "\n");
  qsizetype terminator = m_buffer.indexOf("\n\n");
  while (terminator >= 0) {
    const auto frame = QString::fromUtf8(m_buffer.left(terminator));
    m_buffer.remove(0, terminator + 2);
    parseFrame(frame, onEvent);
    terminator = m_buffer.indexOf("\n\n");
  }
}
