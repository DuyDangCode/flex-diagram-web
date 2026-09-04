import { NodeState, Point } from '../types';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function findNodeAtPoint(
  nodes: readonly NodeState[],
  point: Point,
): NodeState | null {
  // Iterate in reverse order so top-most nodes are hit first
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const halfW = node.width / 2;
    const halfH = node.height / 2;

    if (
      point.x >= node.x - halfW &&
      point.x <= node.x + halfW &&
      point.y >= node.y - halfH &&
      point.y <= node.y + halfH
    ) {
      return node;
    }
  }
  return null;
}

export function findNodesInRect(
  nodes: readonly NodeState[],
  rect: BoundingBox,
): NodeState[] {
  const normMinX = Math.min(rect.minX, rect.maxX);
  const normMaxX = Math.max(rect.minX, rect.maxX);
  const normMinY = Math.min(rect.minY, rect.maxY);
  const normMaxY = Math.max(rect.minY, rect.maxY);

  return nodes.filter((node) => {
    const nodeMinX = node.x - node.width / 2;
    const nodeMaxX = node.x + node.width / 2;
    const nodeMinY = node.y - node.height / 2;
    const nodeMaxY = node.y + node.height / 2;

    // Check intersection with selection box
    return (
      nodeMinX <= normMaxX &&
      nodeMaxX >= normMinX &&
      nodeMinY <= normMaxY &&
      nodeMaxY >= normMinY
    );
  });
}
