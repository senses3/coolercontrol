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
