import { describe, it, expect } from 'vitest';
import { parseDSL } from '../../lib/parser';
import { calculateNodeDimensions, computeLayout } from '../../lib/layout';
import { LayoutMetadata } from '../../lib/types';

describe('Layout Engine', () => {
  it('calculates node dimensions based on label and shape', () => {
    const rectDims = calculateNodeDimensions('Short', 'rectangle');
    expect(rectDims.width).toBe(120); // Min width
    expect(rectDims.height).toBe(60);

    const longRectDims = calculateNodeDimensions('A Very Long Service Name That Exceeds Default', 'rectangle');
    expect(longRectDims.width).toBeGreaterThan(120);
    expect(longRectDims.height).toBe(60);

    const cylDims = calculateNodeDimensions('Database', 'cylinder');
    expect(cylDims.height).toBe(70);
  });

  it('computes layout coordinates for nodes and edges', () => {
    const dsl = `
      [Client] -> [Gateway] : REST
      [Gateway] -> (Database) : Query
    `;
    const ast = parseDSL(dsl);
    const scene = computeLayout(ast);

    expect(scene.nodes).toHaveLength(3);
    expect(scene.edges).toHaveLength(2);

    // Bounding box must encompass all nodes
    expect(scene.boundingBox.maxX).toBeGreaterThan(scene.boundingBox.minX);
    expect(scene.boundingBox.maxY).toBeGreaterThan(scene.boundingBox.minY);

    for (const node of scene.nodes) {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(node.pinned).toBe(false);
      expect(node.isNew).toBe(true);
    }

    for (const edge of scene.edges) {
      expect(edge.waypoints.length).toBeGreaterThanOrEqual(2);
      if (edge.label) {
        expect(edge.labelPosition).toBeDefined();
      }
    }
  });

  it('preserves pinned node positions from layout metadata', () => {
    const dsl = `
      [Client] -> [Gateway]
      [Gateway] -> (Database)
    `;
    const ast = parseDSL(dsl);

    const metadata: LayoutMetadata = {
      version: 1,
      nodes: {
        client: { x: 500, y: 350, pinned: true },
        database: { x: 120, y: 80, pinned: false },
      },
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };

    const scene = computeLayout(ast, metadata);
    const clientNode = scene.nodes.find((n) => n.id === 'client');
    const gatewayNode = scene.nodes.find((n) => n.id === 'gateway');
    const dbNode = scene.nodes.find((n) => n.id === 'database');

    expect(clientNode?.pinned).toBe(true);
    expect(clientNode?.x).toBe(500);
    expect(clientNode?.y).toBe(350);

    // Gateway had no metadata, should be positioned by dagre
    expect(gatewayNode?.pinned).toBe(false);

    // Database was not pinned, dagre positions it
    expect(dbNode?.pinned).toBe(false);
  });

  it('produces deterministic coordinates for identical inputs', () => {
    const dsl = `
      [A] -> [B]
      [B] -> [C]
      [A] -> [C]
    `;
    const ast = parseDSL(dsl);
    const scene1 = computeLayout(ast);
    const scene2 = computeLayout(ast);

    expect(scene1.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }))).toEqual(
      scene2.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    );
  });
});
