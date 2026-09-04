import { Point, ViewportState } from '../types';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4.0;

export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: ViewportState,
): Point {
  return {
    x: (screenX - viewport.panX) / viewport.zoom,
    y: (screenY - viewport.panY) / viewport.zoom,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  viewport: ViewportState,
): Point {
  return {
    x: worldX * viewport.zoom + viewport.panX,
    y: worldY * viewport.zoom + viewport.panY,
  };
}

export function zoomAtPoint(
  viewport: ViewportState,
  screenX: number,
  screenY: number,
  zoomDelta: number,
): ViewportState {
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * zoomDelta));
  if (newZoom === viewport.zoom) return viewport;

  // Zoom centered on screenX, screenY
  const panX = screenX - ((screenX - viewport.panX) * (newZoom / viewport.zoom));
  const panY = screenY - ((screenY - viewport.panY) * (newZoom / viewport.zoom));

  return {
    panX,
    panY,
    zoom: newZoom,
  };
}

export function panViewport(
  viewport: ViewportState,
  dx: number,
  dy: number,
): ViewportState {
  return {
    ...viewport,
    panX: viewport.panX + dx,
    panY: viewport.panY + dy,
  };
}
