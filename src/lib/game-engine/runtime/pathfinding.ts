/**
 * Grid path finding for 2D games (V4): Pathfinding.FindPath and NavAgent2D.
 *
 * Static colliders and solid tiles block the cells they overlap; cells closer
 * to an obstacle than the agent's radius are blocked too. A* searches eight
 * directions without cutting corners, and the result is shortened with
 * line-of-sight checks so agents walk straight where they can.
 */

export interface NavObstacle {
    kind: "box" | "circle";
    x: number;
    y: number;
    /** Half sizes of a box. */
    halfX: number;
    halfY: number;
    /** Rotation of a box around Z in radians. */
    angle: number;
    radius: number;
}

export interface NavBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface NavPoint {
    x: number;
    y: number;
}

export const NAV_LIMITS = { maxCells: 160_000, minCellSize: 0.05, nearestSearch: 12 } as const;

const SQRT2 = Math.SQRT2;
const EPS = 1e-6;

/** Min-heap of cell indices ordered by a score array. */
class Heap {
    private items = new Int32Array(64);
    size = 0;
    private readonly score: Float64Array;
    constructor(score: Float64Array) {
        this.score = score;
    }
    push(index: number) {
        if (this.size === this.items.length) {
            const grown = new Int32Array(this.items.length * 2);
            grown.set(this.items);
            this.items = grown;
        }
        const items = this.items;
        const score = this.score;
        let child = this.size;
        this.size += 1;
        const value = score[index];
        while (child > 0) {
            const parent = (child - 1) >> 1;
            if (score[items[parent]] <= value) break;
            items[child] = items[parent];
            child = parent;
        }
        items[child] = index;
    }
    pop(): number {
        const items = this.items;
        const score = this.score;
        const top = items[0];
        this.size -= 1;
        if (this.size > 0) {
            const last = items[this.size];
            const value = score[last];
            let parent = 0;
            for (;;) {
                const left = parent * 2 + 1;
                if (left >= this.size) break;
                const right = left + 1;
                const smaller = right < this.size && score[items[right]] < score[items[left]] ? right : left;
                if (score[items[smaller]] >= value) break;
                items[parent] = items[smaller];
                parent = smaller;
            }
            items[parent] = last;
        }
        return top;
    }
}

export class NavGrid {
    readonly cellSize: number;
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
    private readonly blocked: Uint8Array;
    /** Search buffers, reused between searches (a cell is fresh when its stamp is old). */
    private readonly g: Float64Array;
    private readonly f: Float64Array;
    private readonly came: Int32Array;
    private readonly stamp: Uint32Array;
    private readonly closed: Uint32Array;
    private search = 0;

    /**
     * @param anchor a point on the cell lattice (a tilemap's corner) so grid cells line up with tiles
     */
    constructor(obstacles: readonly NavObstacle[], options: { cellSize: number; radius: number; bounds: NavBounds; anchor?: NavPoint }) {
        let cell = Math.max(NAV_LIMITS.minCellSize, options.cellSize);
        const anchor = options.anchor ?? { x: 0, y: 0 };
        const span = (size: number) => Math.max(1, Math.ceil(size / cell) + 1);
        while (span(options.bounds.maxX - options.bounds.minX) * span(options.bounds.maxY - options.bounds.minY) > NAV_LIMITS.maxCells) cell *= 1.5;
        this.cellSize = cell;
        this.originX = anchor.x + Math.floor((options.bounds.minX - anchor.x) / cell) * cell;
        this.originY = anchor.y + Math.floor((options.bounds.minY - anchor.y) / cell) * cell;
        this.width = Math.max(1, Math.ceil((options.bounds.maxX - this.originX) / cell));
        this.height = Math.max(1, Math.ceil((options.bounds.maxY - this.originY) / cell));
        const total = this.width * this.height;
        this.blocked = new Uint8Array(total);
        this.g = new Float64Array(total);
        this.f = new Float64Array(total);
        this.came = new Int32Array(total);
        this.stamp = new Uint32Array(total);
        this.closed = new Uint32Array(total);
        const radius = Math.max(0, options.radius);
        for (const obstacle of obstacles) this.rasterize(obstacle, radius);
    }

    private rasterize(o: NavObstacle, radius: number) {
        const cos = Math.cos(o.angle);
        const sin = Math.sin(o.angle);
        const extentX = o.kind === "circle" ? o.radius : Math.abs(o.halfX * cos) + Math.abs(o.halfY * sin);
        const extentY = o.kind === "circle" ? o.radius : Math.abs(o.halfX * sin) + Math.abs(o.halfY * cos);
        const reach = radius;
        const x0 = Math.max(0, Math.floor((o.x - extentX - reach - this.originX) / this.cellSize));
        const x1 = Math.min(this.width - 1, Math.floor((o.x + extentX + reach - this.originX) / this.cellSize));
        const y0 = Math.max(0, Math.floor((o.y - extentY - reach - this.originY) / this.cellSize));
        const y1 = Math.min(this.height - 1, Math.floor((o.y + extentY + reach - this.originY) / this.cellSize));
        const half = this.cellSize / 2;
        for (let y = y0; y <= y1; y += 1) {
            for (let x = x0; x <= x1; x += 1) {
                const index = y * this.width + x;
                if (this.blocked[index]) continue;
                const cx = this.originX + (x + 0.5) * this.cellSize;
                const cy = this.originY + (y + 0.5) * this.cellSize;
                // The obstacle covers part of the cell, or the cell center is within the agent's radius of it.
                if (overlapsCell(o, cos, sin, cx, cy, half) || distanceTo(o, cos, sin, cx, cy) < radius - EPS) this.blocked[index] = 1;
            }
        }
    }

    inside(x: number, y: number) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    isBlocked(x: number, y: number) {
        return !this.inside(x, y) || this.blocked[y * this.width + x] === 1;
    }

    /** Cell of a world point, clamped to the grid. */
    cellOf(point: NavPoint): { x: number; y: number } {
        return {
            x: Math.min(this.width - 1, Math.max(0, Math.floor((point.x - this.originX) / this.cellSize))),
            y: Math.min(this.height - 1, Math.max(0, Math.floor((point.y - this.originY) / this.cellSize))),
        };
    }

    center(x: number, y: number): NavPoint {
        return { x: this.originX + (x + 0.5) * this.cellSize, y: this.originY + (y + 0.5) * this.cellSize };
    }

    /** Outside the grid there are no obstacles. */
    isWalkable(point: NavPoint) {
        const x = Math.floor((point.x - this.originX) / this.cellSize);
        const y = Math.floor((point.y - this.originY) / this.cellSize);
        return !this.inside(x, y) || this.blocked[y * this.width + x] === 0;
    }

    /** The closest free cell (ring by ring), or null when everything nearby is blocked. */
    nearestFree(cell: { x: number; y: number }): { x: number; y: number } | null {
        if (!this.isBlocked(cell.x, cell.y)) return cell;
        for (let ring = 1; ring <= NAV_LIMITS.nearestSearch; ring += 1) {
            let best: { x: number; y: number } | null = null;
            let bestDistance = Infinity;
            for (let dy = -ring; dy <= ring; dy += 1) {
                for (let dx = -ring; dx <= ring; dx += 1) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                    const x = cell.x + dx;
                    const y = cell.y + dy;
                    if (this.isBlocked(x, y)) continue;
                    const distance = dx * dx + dy * dy;
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        best = { x, y };
                    }
                }
            }
            if (best) return best;
        }
        return null;
    }

    /**
     * A* from one world point to another: the corner points (the first is `from`), or null when the
     * goal can't be reached. With `partial` an unreachable goal gives the way to the closest reachable cell.
     */
    findPath(from: NavPoint, to: NavPoint, partial = false): { points: NavPoint[]; complete: boolean } | null {
        const startCell = this.nearestFree(this.cellOf(from));
        const goalCell = this.nearestFree(this.cellOf(to));
        if (!startCell || !goalCell) return null;
        const width = this.width;
        const height = this.height;
        const blocked = this.blocked;
        const start = startCell.y * width + startCell.x;
        const goal = goalCell.y * width + goalCell.x;
        const { g, f, came, stamp, closed } = this;
        const search = (this.search = (this.search + 1) >>> 0) || (this.search = 1);
        const heuristic = (cx: number, cy: number) => {
            const dx = Math.abs(cx - goalCell.x);
            const dy = Math.abs(cy - goalCell.y);
            return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx;
        };
        stamp[start] = search;
        g[start] = 0;
        f[start] = heuristic(startCell.x, startCell.y);
        came[start] = -1;
        const open = new Heap(f);
        open.push(start);
        let closest = start;
        let closestH = f[start];
        let found = false;
        const free = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && blocked[y * width + x] === 0;
        while (open.size) {
            const current = open.pop();
            if (closed[current] === search) continue;
            if (current === goal) {
                found = true;
                break;
            }
            closed[current] = search;
            const cx = current % width;
            const cy = (current - cx) / width;
            const h = f[current] - g[current];
            if (h < closestH) {
                closestH = h;
                closest = current;
            }
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    if (!dx && !dy) continue;
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (!free(nx, ny)) continue;
                    // No corner cutting: a diagonal step needs both side cells free.
                    if (dx && dy && (!free(cx + dx, cy) || !free(cx, cy + dy))) continue;
                    const next = ny * width + nx;
                    if (closed[next] === search) continue;
                    const cost = g[current] + (dx && dy ? SQRT2 : 1);
                    if (stamp[next] === search && cost >= g[next]) continue;
                    stamp[next] = search;
                    g[next] = cost;
                    f[next] = cost + heuristic(nx, ny);
                    came[next] = current;
                    open.push(next);
                }
            }
        }
        if (!found && !partial) return null;
        const end = found ? goal : closest;
        const cells: number[] = [];
        for (let cursor = end; cursor !== -1; cursor = came[cursor]) cells.push(cursor);
        cells.reverse();
        const corners = this.shorten(cells);
        const points = corners.map((index) => this.center(index % width, Math.floor(index / width)));
        points[0] = { x: from.x, y: from.y };
        if (found && this.isWalkable(to) && this.lineOfSight(points.length > 1 ? points[points.length - 2] : points[0], to)) {
            points[points.length - 1] = { x: to.x, y: to.y };
        }
        if (points.length === 1 && found) points.push({ x: to.x, y: to.y });
        return { points, complete: found };
    }

    /** Keeps only the cells where the path has to turn (string pulling with line of sight). */
    private shorten(cells: number[]): number[] {
        if (cells.length <= 2) return cells;
        const width = this.width;
        // Straight runs can't hold a shortcut's end, so only the cells where the direction changes are candidates.
        const turns = [cells[0]];
        for (let index = 1; index < cells.length - 1; index += 1) {
            if (cells[index] - cells[index - 1] !== cells[index + 1] - cells[index]) turns.push(cells[index]);
        }
        turns.push(cells[cells.length - 1]);
        const point = (index: number) => this.center(index % width, Math.floor(index / width));
        const output = [turns[0]];
        let anchor = 0;
        for (let index = 2; index < turns.length; index += 1) {
            if (!this.lineOfSight(point(turns[anchor]), point(turns[index]))) {
                output.push(turns[index - 1]);
                anchor = index - 1;
            }
        }
        output.push(turns[turns.length - 1]);
        return output;
    }

    /** Whether the straight segment only crosses free cells (both sides are checked at exact corners). */
    lineOfSight(a: NavPoint, b: NavPoint): boolean {
        const size = this.cellSize;
        let x = Math.floor((a.x - this.originX) / size);
        let y = Math.floor((a.y - this.originY) / size);
        const endX = Math.floor((b.x - this.originX) / size);
        const endY = Math.floor((b.y - this.originY) / size);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const stepX = Math.sign(dx);
        const stepY = Math.sign(dy);
        const blocked = (cx: number, cy: number) => this.inside(cx, cy) && this.blocked[cy * this.width + cx] === 1;
        if (blocked(x, y)) return false;
        // Amanatides–Woo grid walk; t runs from 0 (a) to 1 (b).
        const tDeltaX = stepX ? Math.abs(size / dx) : Infinity;
        const tDeltaY = stepY ? Math.abs(size / dy) : Infinity;
        let tMaxX = stepX ? (this.originX + (stepX > 0 ? x + 1 : x) * size - a.x) / dx : Infinity;
        let tMaxY = stepY ? (this.originY + (stepY > 0 ? y + 1 : y) * size - a.y) / dy : Infinity;
        for (let guard = this.width + this.height + 8; guard > 0; guard -= 1) {
            if ((x === endX && y === endY) || (tMaxX > 1 && tMaxY > 1)) return true;
            if (Math.abs(tMaxX - tMaxY) < 1e-9) {
                // Through a corner: both neighbors must be free.
                if (blocked(x + stepX, y) || blocked(x, y + stepY)) return false;
                x += stepX;
                y += stepY;
                tMaxX += tDeltaX;
                tMaxY += tDeltaY;
            } else if (tMaxX < tMaxY) {
                x += stepX;
                tMaxX += tDeltaX;
            } else {
                y += stepY;
                tMaxY += tDeltaY;
            }
            if (blocked(x, y)) return false;
        }
        return true;
    }
}

/** Whether an obstacle overlaps the square cell (center cx, cy; half size h) — SAT for boxes. */
function overlapsCell(o: NavObstacle, cos: number, sin: number, cx: number, cy: number, h: number): boolean {
    if (o.kind === "circle") {
        const nx = Math.max(cx - h, Math.min(o.x, cx + h));
        const ny = Math.max(cy - h, Math.min(o.y, cy + h));
        return (nx - o.x) ** 2 + (ny - o.y) ** 2 < o.radius * o.radius - EPS;
    }
    const dx = o.x - cx;
    const dy = o.y - cy;
    // Cell axes.
    const extentX = Math.abs(o.halfX * cos) + Math.abs(o.halfY * sin);
    const extentY = Math.abs(o.halfX * sin) + Math.abs(o.halfY * cos);
    if (Math.abs(dx) >= h + extentX - EPS || Math.abs(dy) >= h + extentY - EPS) return false;
    // Box axes.
    const cellOnX = h * (Math.abs(cos) + Math.abs(sin));
    if (Math.abs(dx * cos + dy * sin) >= o.halfX + cellOnX - EPS) return false;
    if (Math.abs(-dx * sin + dy * cos) >= o.halfY + cellOnX - EPS) return false;
    return true;
}

/** Distance from a point to the obstacle's surface (0 inside). */
function distanceTo(o: NavObstacle, cos: number, sin: number, px: number, py: number): number {
    if (o.kind === "circle") return Math.max(0, Math.hypot(px - o.x, py - o.y) - o.radius);
    const rx = px - o.x;
    const ry = py - o.y;
    const lx = rx * cos + ry * sin;
    const ly = -rx * sin + ry * cos;
    const ox = Math.max(0, Math.abs(lx) - o.halfX);
    const oy = Math.max(0, Math.abs(ly) - o.halfY);
    return Math.hypot(ox, oy);
}

/** Total length of a path. */
export function pathLength(points: readonly NavPoint[]): number {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    return total;
}
