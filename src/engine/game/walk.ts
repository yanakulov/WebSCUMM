import type { WalkBox } from '../room.ts';

export interface Point { x: number; y: number }

function project({ x, y }: Point, [ax, ay]: [number, number], [bx, by]: [number, number]): Point {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
  return { x: ax + t * dx, y: ay + t * dy };
}

const distance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function locateBox(boxes: WalkBox[], point: Point) {
  let nearest = point, index = -1, best = Infinity;
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (box.flags & 0x80) continue;
    const candidate = closestOnBox(box, point);
    const d = distance(point, candidate);
    if (d < best) { best = d; nearest = candidate; index = i; }
    if (!d) break;
  }
  return { point: nearest, box: index + 1 };
}

function closestOnBox(box: WalkBox, point: Point) {
  if (insideBox(box, point)) return point;
  let nearest = point, best = Infinity;
  for (const [i, a] of box.points.entries()) {
    const candidate = project(point, a, box.points[(i + 1) % box.points.length]);
    const d = distance(point, candidate);
    if (d < best) { best = d; nearest = candidate; }
  }
  return nearest;
}

function insideBox(box: WalkBox, { x, y }: Point) {
  const cross = box.points.map(([ax, ay], i) => {
    const [bx, by] = box.points[(i + 1) % box.points.length];
    return (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  });
  return cross.some(value => value !== 0) && (cross.every(value => value >= 0) || cross.every(value => value <= 0));
}

function nextBox(matrix: Uint8Array, from: number, to: number) {
  let row = matrix[0] === 255 ? -1 : 0;
  for (let i = 0; i < matrix.length;) {
    if (matrix[i] === 255) { if (row === from) return 0; row++; i++; continue; }
    if (i + 2 >= matrix.length) return 0;
    if (row === from && to >= matrix[i] && to <= matrix[i + 1]) return matrix[i + 2] === 255 ? 0 : matrix[i + 2];
    i += 3;
  }
  return 0;
}

export function walkPath(boxes: WalkBox[], matrix: Uint8Array | undefined, source: Point, destination: Point): Point[] {
  const start = locateBox(boxes, source), end = locateBox(boxes, destination);
  if (!matrix || !start.box || start.box === end.box) return [end.point];

  const route = [];
  let from = start.box;
  const visited = new Set<number>();
  while (from !== end.box && !visited.has(from)) {
    visited.add(from);
    const to = nextBox(matrix, from, end.box);
    if (!to || to > boxes.length || (boxes[to - 1].flags & 0x80)) return route;
    const current = boxes[from - 1], next = boxes[to - 1];
    // Project toward the goal, then onto the adjacent box. This also handles line-shaped boxes.
    const goal = closestOnBox(next, end.point);
    const exit = closestOnBox(current, goal);
    route.push(exit, closestOnBox(next, exit));
    from = to;
  }
  return from === end.box ? [...route, end.point] : route;
}
