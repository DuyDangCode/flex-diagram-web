import { describe, it, expect } from 'vitest';
import { NodeState } from '../../lib/types';
import {
  getNodePorts,
  selectBestPorts,
  routeOrthogonalEdge,
} from '../../lib/layout/orthogonal_router';

describe('Orthogonal Edge Router', () => {
  const nodeA: NodeState = {
    id: 'a',
    name: 'A',
    label: 'A',
    shape: 'rectangle',
    x: 200,
    y: 100,
    width: 120,
    height: 60,
    pinned: false,
    isNew: false,
  };

  const nodeB: NodeState = {
    id: 'b',
    name: 'B',
    label: 'B',
    shape: 'rectangle',
    x: 200,
    y: 350,
    width: 120,
    height: 60,
    pinned: false,
    isNew: false,
  };

  it('computes 4 cardinal ports for a node', () => {
    const ports = getNodePorts(nodeA);
    expect(ports.top).toEqual({ x: 200, y: 70, side: 'top', normal: { x: 0, y: -1 } });
    expect(ports.bottom).toEqual({ x: 200, y: 130, side: 'bottom', normal: { x: 0, y: 1 } });
    expect(ports.left).toEqual({ x: 140, y: 100, side: 'left', normal: { x: -1, y: 0 } });
    expect(ports.right).toEqual({ x: 260, y: 100, side: 'right', normal: { x: 1, y: 0 } });
  });

  it('selects bottom -> top ports when target is below source', () => {
    const { fromPort, toPort } = selectBestPorts(nodeA, nodeB);
    expect(fromPort.side).toBe('bottom');
    expect(toPort.side).toBe('top');
  });

  it('generates 90-degree orthogonal polyline segments', () => {
    const edge = routeOrthogonalEdge('a->b', nodeA, nodeB, [nodeA, nodeB], 'REST');

    expect(edge.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(edge.label).toBe('REST');
    expect(edge.labelPosition).toBeDefined();

    // Verify all consecutive segments are strictly orthogonal (dx == 0 or dy == 0)
    for (let i = 0; i < edge.waypoints.length - 1; i++) {
      const p1 = edge.waypoints[i];
      const p2 = edge.waypoints[i + 1];
      const isOrthogonal = Math.abs(p1.x - p2.x) < 0.001 || Math.abs(p1.y - p2.y) < 0.001;
      expect(isOrthogonal).toBe(true);
    }
  });

  it('routes self-loops around the node cleanly', () => {
    const loopEdge = routeOrthogonalEdge('a->a', nodeA, nodeA, [nodeA], 'Loop');
    expect(loopEdge.sourceId).toBe('a');
    expect(loopEdge.targetId).toBe('a');
    expect(loopEdge.waypoints.length).toBe(5);

    // First waypoint is at top port (y = 70), last waypoint is at right port (x = 260)
    expect(loopEdge.waypoints[0].y).toBe(70);
    expect(loopEdge.waypoints[loopEdge.waypoints.length - 1].x).toBe(260);

    // All segments must be orthogonal
    for (let i = 0; i < loopEdge.waypoints.length - 1; i++) {
      const p1 = loopEdge.waypoints[i];
      const p2 = loopEdge.waypoints[i + 1];
      const isOrthogonal = Math.abs(p1.x - p2.x) < 0.001 || Math.abs(p1.y - p2.y) < 0.001;
      expect(isOrthogonal).toBe(true);
    }
  });

  it('applies lane shifting for parallel edges', () => {
    const edge1 = routeOrthogonalEdge('a->b#1', nodeA, nodeB, [nodeA, nodeB], undefined, 0);
    const edge2 = routeOrthogonalEdge('a->b#2', nodeA, nodeB, [nodeA, nodeB], undefined, 20);

    // Waypoints must differ due to lane offset
    expect(edge1.waypoints).not.toEqual(edge2.waypoints);
  });
});
