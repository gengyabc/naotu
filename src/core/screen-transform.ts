export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export function worldToScreen(point: { x: number; y: number }, transform: ViewTransform): { x: number; y: number } {
  return { x: point.x * transform.k + transform.x, y: point.y * transform.k + transform.y };
}

export function screenToWorld(point: { x: number; y: number }, transform: ViewTransform): { x: number; y: number } {
  return { x: (point.x - transform.x) / transform.k, y: (point.y - transform.y) / transform.k };
}
