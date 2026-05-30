import { Point } from '../types';

/**
 * Calculates the bounding box of a polygon.
 */
export function getBoundingBox(poly: Point[]) {
  if (poly.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = poly.map(p => p.x);
  const ys = poly.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    center: {
      x: minX + (maxX - minX) / 2,
      y: minY + (maxY - minY) / 2
    }
  };
}

/**
 * Calculates the arithmetic centroid of a polygon.
 */
export function getCentroid(poly: Point[]): Point {
  if (poly.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / poly.length, y: sy / poly.length };
}

/**
 * Signed area of a polygon. Used to detect winding order.
 */
export function getPolygonArea(poly: Point[]): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area * 0.5;
}

/**
 * Returns a new polygon oriented counter-clockwise.
 */
export function ensureCCW(poly: Point[]): Point[] {
  if (poly.length < 3) return poly;
  const area = getPolygonArea(poly);
  if (area < 0) {
    return [...poly].reverse();
  }
  return poly;
}

interface Line {
  p1: Point;
  p2: Point;
}

/**
 * Intersection of two infinite lines.
 */
function intersectLines(l1: Line, l2: Line): Point | null {
  const x1 = l1.p1.x, y1 = l1.p1.y;
  const x2 = l1.p2.x, y2 = l1.p2.y;
  const x3 = l2.p1.x, y3 = l2.p1.y;
  const x4 = l2.p2.x, y4 = l2.p2.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-6) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1),
  };
}

/**
 * Clean duplicate close vertices.
 */
export function cleanDuplicates(poly: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of poly) {
    if (result.some(existing => Math.hypot(existing.x - p.x, existing.y - p.y) < 1e-3)) {
      continue;
    }
    result.push(p);
  }
  return result;
}

/**
 * Splits a convex polygon with a line AB.
 * Returns two separate child polygons.
 */
export function splitPolygon(poly: Point[], A: Point, B: Point): [Point[], Point[]] {
  const ccwPoly = ensureCCW(cleanDuplicates(poly));
  const n = ccwPoly.length;
  if (n < 3) return [[...poly], []];

  // Side test helper: cross product from line AB to point P
  // side > 0 if P is to the left of vector AB, side < 0 if to the right
  const getSide = (P: Point) => (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x);

  const leftVerts: Point[] = [];
  const rightVerts: Point[] = [];
  const sides = ccwPoly.map(p => getSide(p));

  for (let i = 0; i < n; i++) {
    const p1 = ccwPoly[i];
    const p2 = ccwPoly[(i + 1) % n];
    const s1 = sides[i];
    const s2 = sides[(i + 1) % n];

    // Node is on the left / boundary
    if (s1 >= -1e-4) leftVerts.push(p1);
    // Node is on the right / boundary
    if (s1 <= 1e-4) rightVerts.push(p1);

    // If edge crosses the line
    const s1Sign = Math.abs(s1) < 1e-4 ? 0 : Math.sign(s1);
    const s2Sign = Math.abs(s2) < 1e-4 ? 0 : Math.sign(s2);

    if (s1Sign !== 0 && s2Sign !== 0 && s1Sign !== s2Sign) {
      // Find intersection
      const d1 = s1;
      const d2 = s2;
      const t = d1 / (d1 - d2);
      const I = {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
      };
      leftVerts.push(I);
      rightVerts.push(I);
    }
  }

  const pLeft = ensureCCW(cleanDuplicates(leftVerts));
  const pRight = ensureCCW(cleanDuplicates(rightVerts));

  // If one of the split result is empty or degenerate, return original and empty
  if (pLeft.length < 3 || pRight.length < 3) {
    return [[...poly], []];
  }

  return [pLeft, pRight];
}

/**
 * Insets a convex polygon inwards by a gap distance.
 * Implements a flawless parallel edge-offset algorithm with a secure centroid fallback.
 */
export function insetPolygon(poly: Point[], d: number): Point[] {
  if (d <= 0 || poly.length < 3) return poly;

  const ccwPoly = ensureCCW(poly);
  const n = ccwPoly.length;
  const shiftedLines: Line[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = ccwPoly[i];
    const p2 = ccwPoly[(i + 1) % n];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) continue;

    // Normal pointing left (inwards for CCW polygon)
    const nx = -dy / len;
    const ny = dx / len;

    shiftedLines.push({
      p1: { x: p1.x + nx * d, y: p1.y + ny * d },
      p2: { x: p2.x + nx * d, y: p2.y + ny * d },
    });
  }

  if (shiftedLines.length < 3) return poly;

  const insetVerts: Point[] = [];
  const m = shiftedLines.length;

  for (let i = 0; i < m; i++) {
    const l1 = shiftedLines[(i - 1 + m) % m];
    const l2 = shiftedLines[i];
    const pt = intersectLines(l1, l2);
    if (pt) {
      insetVerts.push(pt);
    } else {
      // Parallel backup
      insetVerts.push(l2.p1);
    }
  }

  // Safety Verification: Ensure the inset polygon is still valid
  const originalArea = Math.abs(getPolygonArea(ccwPoly));
  const newArea = getPolygonArea(insetVerts);

  // If area shrank too much, or inverted/self-intersected, fallback to centroid-based shrink
  if (newArea < 100 || (newArea * originalArea < 0)) {
    const polyCentroid = getCentroid(ccwPoly);
    return ccwPoly.map(p => {
      const dx = p.x - polyCentroid.x;
      const dy = p.y - polyCentroid.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return p;
      // Shrink relative to shape size
      const factor = Math.max(0.05, (len - d) / len);
      return {
        x: polyCentroid.x + dx * factor,
        y: polyCentroid.y + dy * factor
      };
    });
  }

  return cleanDuplicates(insetVerts);
}

/**
 * Creates SVG points string from vertices.
 */
export function getSvgPointsString(poly: Point[]): string {
  return poly.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
