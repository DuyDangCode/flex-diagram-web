import { EdgeRoute, EdgeStyle, EdgeWaypoint, NodeState, Point } from '../types';

export interface Port {
  readonly x: number;
  readonly y: number;
  readonly side: 'top' | 'bottom' | 'left' | 'right';
  readonly normal: { x: number; y: number };
}

export interface ObstacleBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const CLEARANCE = 20;

/**
 * Computes the 4 boundary connection ports for a node.
 */
export function getNodePorts(node: NodeState): {
  top: Port;
  bottom: Port;
  left: Port;
  right: Port;
} {
  const halfW = node.width / 2;
  const halfH = node.height / 2;

  return {
    top: { x: node.x, y: node.y - halfH, side: 'top', normal: { x: 0, y: -1 } },
    bottom: { x: node.x, y: node.y + halfH, side: 'bottom', normal: { x: 0, y: 1 } },
    left: { x: node.x - halfW, y: node.y, side: 'left', normal: { x: -1, y: 0 } },
    right: { x: node.x + halfW, y: node.y, side: 'right', normal: { x: 1, y: 0 } },
  };
}

/**
 * Chooses the optimal exit and entry ports between source and target nodes.
 */
export function selectBestPorts(source: NodeState, target: NodeState): { fromPort: Port; toPort: Port } {
  const sPorts = getNodePorts(source);
  const tPorts = getNodePorts(target);

  const dx = target.x - source.x;
  const dy = target.y - source.y;

  // Primary directional axis
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy > 0) {
      return { fromPort: sPorts.bottom, toPort: tPorts.top };
    } else {
      return { fromPort: sPorts.top, toPort: tPorts.bottom };
    }
  } else {
    if (dx > 0) {
      return { fromPort: sPorts.right, toPort: tPorts.left };
    } else {
      return { fromPort: sPorts.left, toPort: tPorts.right };
    }
  }
}

/**
 * Routes an edge orthogonally (Manhattan polyline) avoiding node bodies.
 */
export function routeOrthogonalEdge(
  edgeId: string,
  source: NodeState,
  target: NodeState,
  allNodes: readonly NodeState[],
  label?: string,
  laneOffset = 0,
  style: EdgeStyle = 'solid',
): EdgeRoute {
  // Case 1: Self-loop (source === target)
  if (source.id === target.id) {
    return routeSelfLoop(edgeId, source, label, laneOffset, style);
  }

  const { fromPort, toPort } = selectBestPorts(source, target);

  // Initial stub points extending out from node borders
  const startStub: Point = {
    x: fromPort.x + fromPort.normal.x * CLEARANCE,
    y: fromPort.y + fromPort.normal.y * CLEARANCE,
  };

  const endStub: Point = {
    x: toPort.x + toPort.normal.x * CLEARANCE,
    y: toPort.y + toPort.normal.y * CLEARANCE,
  };

  // Intermediate waypoints
  const waypoints: EdgeWaypoint[] = [{ x: fromPort.x, y: fromPort.y }, startStub];

  // Obstacle boxes excluding source and target
  const obstacles: ObstacleBox[] = allNodes
    .filter((n) => n.id !== source.id && n.id !== target.id)
    .map((n) => ({
      minX: n.x - n.width / 2 - 10,
      minY: n.y - n.height / 2 - 10,
      maxX: n.x + n.width / 2 + 10,
      maxY: n.y + n.height / 2 + 10,
    }));

  // Determine orthogonal path depending on connection direction
  if (fromPort.side === 'bottom' && toPort.side === 'top') {
    if (Math.abs(startStub.x - endStub.x) < 2 && laneOffset !== 0) {
      const laneX = startStub.x + laneOffset;
      waypoints.push({ x: laneX, y: startStub.y }, { x: laneX, y: endStub.y });
    } else {
      const midY = (startStub.y + endStub.y) / 2 + laneOffset;
      const adjustedMidY = adjustForObstaclesY(midY, startStub.x, endStub.x, obstacles);
      waypoints.push({ x: startStub.x, y: adjustedMidY }, { x: endStub.x, y: adjustedMidY });
    }
  } else if (fromPort.side === 'top' && toPort.side === 'bottom') {
    if (Math.abs(startStub.x - endStub.x) < 2 && laneOffset !== 0) {
      const laneX = startStub.x + laneOffset;
      waypoints.push({ x: laneX, y: startStub.y }, { x: laneX, y: endStub.y });
    } else {
      const midY = (startStub.y + endStub.y) / 2 + laneOffset;
      const adjustedMidY = adjustForObstaclesY(midY, startStub.x, endStub.x, obstacles);
      waypoints.push({ x: startStub.x, y: adjustedMidY }, { x: endStub.x, y: adjustedMidY });
    }
  } else if (fromPort.side === 'right' && toPort.side === 'left') {
    if (Math.abs(startStub.y - endStub.y) < 2 && laneOffset !== 0) {
      const laneY = startStub.y + laneOffset;
      waypoints.push({ x: startStub.x, y: laneY }, { x: endStub.x, y: laneY });
    } else {
      const midX = (startStub.x + endStub.x) / 2 + laneOffset;
      const adjustedMidX = adjustForObstaclesX(midX, startStub.y, endStub.y, obstacles);
      waypoints.push({ x: adjustedMidX, y: startStub.y }, { x: adjustedMidX, y: endStub.y });
    }
  } else if (fromPort.side === 'left' && toPort.side === 'right') {
    if (Math.abs(startStub.y - endStub.y) < 2 && laneOffset !== 0) {
      const laneY = startStub.y + laneOffset;
      waypoints.push({ x: startStub.x, y: laneY }, { x: endStub.x, y: laneY });
    } else {
      const midX = (startStub.x + endStub.x) / 2 + laneOffset;
      const adjustedMidX = adjustForObstaclesX(midX, startStub.y, endStub.y, obstacles);
      waypoints.push({ x: adjustedMidX, y: startStub.y }, { x: adjustedMidX, y: endStub.y });
    }
  } else {
    // Perpendicular or diagonal ports (e.g. right to top)
    waypoints.push({ x: endStub.x, y: startStub.y });
  }

  waypoints.push(endStub, { x: toPort.x, y: toPort.y });

  // Clean up redundant colinear points
  const simplifiedWaypoints = simplifyColinearWaypoints(waypoints);

  // Place label at midpoint of the longest segment
  const labelPosition = calculateLabelPosition(simplifiedWaypoints);

  return {
    edgeId,
    sourceId: source.id,
    targetId: target.id,
    label,
    style,
    waypoints: simplifiedWaypoints,
    labelPosition,
  };
}

/**
 * Handles dedicated routing for self-loops [A] -> [A].
 */
function routeSelfLoop(
  edgeId: string,
  node: NodeState,
  label?: string,
  laneOffset = 0,
  style: EdgeStyle = 'solid',
): EdgeRoute {
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const offset = 28 + Math.abs(laneOffset);

  const waypoints: EdgeWaypoint[] = [
    { x: node.x, y: node.y - halfH }, // Top exit
    { x: node.x, y: node.y - halfH - offset }, // Up
    { x: node.x + halfW + offset, y: node.y - halfH - offset }, // Right
    { x: node.x + halfW + offset, y: node.y }, // Down
    { x: node.x + halfW, y: node.y }, // Right entry
  ];

  const labelPosition: Point = {
    x: node.x + halfW + offset,
    y: node.y - halfH - offset / 2,
  };

  return {
    edgeId,
    sourceId: node.id,
    targetId: node.id,
    label,
    style,
    waypoints,
    labelPosition,
  };
}

/**
 * Adjusts horizontal split coordinate if intersecting an obstacle.
 */
function adjustForObstaclesY(
  candidateY: number,
  x1: number,
  x2: number,
  obstacles: readonly ObstacleBox[],
): number {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);

  for (const obs of obstacles) {
    if (candidateY >= obs.minY && candidateY <= obs.maxY) {
      if (maxX >= obs.minX && minX <= obs.maxX) {
        // Intersects obstacle: shift above or below obstacle with clearance
        return obs.minY - 15;
      }
    }
  }
  return candidateY;
}

/**
 * Adjusts vertical split coordinate if intersecting an obstacle.
 */
function adjustForObstaclesX(
  candidateX: number,
  y1: number,
  y2: number,
  obstacles: readonly ObstacleBox[],
): number {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  for (const obs of obstacles) {
    if (candidateX >= obs.minX && candidateX <= obs.maxX) {
      if (maxY >= obs.minY && minY <= obs.maxY) {
        // Intersects obstacle: shift left or right
        return obs.maxX + 15;
      }
    }
  }
  return candidateX;
}

/**
 * Merges consecutive colinear segments to keep polyline minimal.
 */
function simplifyColinearWaypoints(points: EdgeWaypoint[]): EdgeWaypoint[] {
  if (points.length <= 2) return points;

  const result: EdgeWaypoint[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const isColinearX = prev.x === curr.x && curr.x === next.x;
    const isColinearY = prev.y === curr.y && curr.y === next.y;

    if (!isColinearX && !isColinearY) {
      result.push(curr);
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

/**
 * Calculates label position at the midpoint of the longest polyline segment.
 */
function calculateLabelPosition(waypoints: readonly EdgeWaypoint[]): Point | undefined {
  if (waypoints.length < 2) return undefined;

  let longestLen = -1;
  let bestPoint: Point = waypoints[0];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    if (len > longestLen) {
      longestLen = len;
      bestPoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };
    }
  }

  return bestPoint;
}
