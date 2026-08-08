// SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

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
