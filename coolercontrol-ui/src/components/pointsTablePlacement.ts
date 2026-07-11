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

export type TablePosition = 'top-left' | 'bottom-right'

// Recommends the corner the points table should occupy so it doesn't sit over
// the curve points: if any point falls under (or within a margin of) the table
// in its current corner, returns the opposite corner, otherwise the current one.
// It reads the table's actual rendered box, so it works for any editor
// regardless of that editor's corner offsets. Meant to run once on initial draw.
export function pointsTableClearPosition(
    // vue-echarts instance (loosely typed); exposes convertToPixel + $el.
    controlGraph: any,
    pointsTable: HTMLElement | null,
    current: TablePosition,
    points: Array<{ value: Array<number> }>,
    remPx: number,
): TablePosition {
    const canvas: HTMLCanvasElement | null | undefined = controlGraph?.$el?.querySelector('canvas')
    if (
        typeof controlGraph?.convertToPixel !== 'function' ||
        pointsTable == null ||
        canvas == null
    ) {
        return current
    }
    const canvasRect = canvas.getBoundingClientRect()
    const table = pointsTable.getBoundingClientRect()
    // A point cannot be dragged under the table (it intercepts pointer events),
    // so treat one that gets near it as an overlap and move out of the way.
    const margin = 3 * remPx
    for (const point of points) {
        const px: Array<number> | undefined = controlGraph.convertToPixel('grid', point.value)
        if (px == null) continue
        const x = canvasRect.left + px[0]
        const y = canvasRect.top + px[1]
        if (
            x >= table.left - margin &&
            x <= table.right + margin &&
            y >= table.top - margin &&
            y <= table.bottom + margin
        ) {
            return current === 'top-left' ? 'bottom-right' : 'top-left'
        }
    }
    return current
}
