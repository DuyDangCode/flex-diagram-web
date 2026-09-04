import { NodeState } from '../types';

export interface AlignmentGuide {
  type: 'x' | 'y';
  position: number;
  from: number;
  to: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: AlignmentGuide[];
}

export const DEFAULT_GRID_SIZE = 12;
export const SNAP_THRESHOLD = 6;

/**
 * Snaps a coordinate value to the nearest grid step.
 */
export function snapToGrid(value: number, gridSize = DEFAULT_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Calculates smart alignment guides and snap offsets for dragged nodes
 * relative to other stationary nodes on the canvas.
 */
export function calculateAlignmentSnap(
  draggedNodes: readonly NodeState[],
  stationaryNodes: readonly NodeState[],
  threshold = SNAP_THRESHOLD,
): SnapResult {
  if (draggedNodes.length === 0) {
    return { x: 0, y: 0, guides: [] };
  }

  // Primary reference node is the first dragged node
  const refNode = draggedNodes[0];
  const refHalfW = refNode.width / 2;
  const refHalfH = refNode.height / 2;

  let bestSnapX = refNode.x;
  let bestDistX = threshold + 1;
  let guideX: AlignmentGuide | null = null;

  let bestSnapY = refNode.y;
  let bestDistY = threshold + 1;
  let guideY: AlignmentGuide | null = null;

  for (const other of stationaryNodes) {
    const otherHalfW = other.width / 2;
    const otherHalfH = other.height / 2;

    // --- Horizontal (X) Alignments ---
    // 1. Center-to-Center
    const distCenter = Math.abs(refNode.x - other.x);
    if (distCenter < bestDistX) {
      bestDistX = distCenter;
      bestSnapX = other.x;
      guideX = {
        type: 'x',
        position: other.x,
        from: Math.min(refNode.y, other.y) - 50,
        to: Math.max(refNode.y, other.y) + 50,
      };
    }

    // 2. Left-to-Left
    const refLeft = refNode.x - refHalfW;
    const otherLeft = other.x - otherHalfW;
    const distLeft = Math.abs(refLeft - otherLeft);
    if (distLeft < bestDistX) {
      bestDistX = distLeft;
      bestSnapX = otherLeft + refHalfW;
      guideX = {
        type: 'x',
        position: otherLeft,
        from: Math.min(refNode.y, other.y) - 50,
        to: Math.max(refNode.y, other.y) + 50,
      };
    }

    // 3. Right-to-Right
    const refRight = refNode.x + refHalfW;
    const otherRight = other.x + otherHalfW;
    const distRight = Math.abs(refRight - otherRight);
    if (distRight < bestDistX) {
      bestDistX = distRight;
      bestSnapX = otherRight - refHalfW;
      guideX = {
        type: 'x',
        position: otherRight,
        from: Math.min(refNode.y, other.y) - 50,
        to: Math.max(refNode.y, other.y) + 50,
      };
    }

    // --- Vertical (Y) Alignments ---
    // 1. Center-to-Center
    const distCenterY = Math.abs(refNode.y - other.y);
    if (distCenterY < bestDistY) {
      bestDistY = distCenterY;
      bestSnapY = other.y;
      guideY = {
        type: 'y',
        position: other.y,
        from: Math.min(refNode.x, other.x) - 50,
        to: Math.max(refNode.x, other.x) + 50,
      };
    }

    // 2. Top-to-Top
    const refTop = refNode.y - refHalfH;
    const otherTop = other.y - otherHalfH;
    const distTop = Math.abs(refTop - otherTop);
    if (distTop < bestDistY) {
      bestDistY = distTop;
      bestSnapY = otherTop + refHalfH;
      guideY = {
        type: 'y',
        position: otherTop,
        from: Math.min(refNode.x, other.x) - 50,
        to: Math.max(refNode.x, other.x) + 50,
      };
    }

    // 3. Bottom-to-Bottom
    const refBottom = refNode.y + refHalfH;
    const otherBottom = other.y + otherHalfH;
    const distBottom = Math.abs(refBottom - otherBottom);
    if (distBottom < bestDistY) {
      bestDistY = distBottom;
      bestSnapY = otherBottom - refHalfH;
      guideY = {
        type: 'y',
        position: otherBottom,
        from: Math.min(refNode.x, other.x) - 50,
        to: Math.max(refNode.x, other.x) + 50,
      };
    }
  }

  const guides: AlignmentGuide[] = [];
  if (guideX && bestDistX <= threshold) guides.push(guideX);
  if (guideY && bestDistY <= threshold) guides.push(guideY);

  return {
    x: bestDistX <= threshold ? bestSnapX : refNode.x,
    y: bestDistY <= threshold ? bestSnapY : refNode.y,
    guides,
  };
}
