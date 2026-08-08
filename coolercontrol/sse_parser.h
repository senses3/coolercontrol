// SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

#ifndef SSE_PARSER_H
#define SSE_PARSER_H

#include <QByteArray>
#include <QString>
#include <functional>

/*
  Incremental text/event-stream frame parser.

  readyRead() hands us whatever bytes have arrived, which is not necessarily one
  whole frame: a frame can be split across reads, and several can arrive in one.
  Buffering until the blank-line terminator is what makes a multiplexed stream
  readable, since every frame there may carry a different event name.
*/
class SseParser {
 public:
  using EventHandler = std::function<void(const QString& name, const QString& data)>;

  // Feeds a chunk and invokes the handler once per complete frame. Comment-only
  // frames (keep-alive ticks) and frames without data are dropped.
  void feed(const QByteArray& chunk, const EventHandler& onEvent);

 private:
  QByteArray m_buffer;
};

#endif  // SSE_PARSER_H
