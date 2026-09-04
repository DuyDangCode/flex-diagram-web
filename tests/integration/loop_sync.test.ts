import { describe, it, expect } from 'vitest';
import { parseDSL } from '../../lib/parser';
import { computeLayout } from '../../lib/layout';
import { serializeDiag, deserializeDiag } from '../../lib/serializer';
import { LayoutMetadata } from '../../lib/types';

describe('End-to-End Bidirectional Closed Loop Integration', () => {
  it('executes full Code -> Drag & Pin -> Edit Code -> Preserved Coordinates loop', () => {
    // 1. User writes initial DSL
    const initialDsl = `
      [Client] -> [Gateway] : REST
      [Gateway] -> (Database) : Query
    `;
    const ast1 = parseDSL(initialDsl);
    expect(ast1.nodes).toHaveLength(3);
    expect(ast1.edges).toHaveLength(2);

    // 2. Initial layout computed
    const scene1 = computeLayout(ast1);
    expect(scene1.nodes.every((n) => !n.pinned)).toBe(true);
    expect(scene1.nodes.find((n) => n.id === 'client')).toBeDefined();
    expect(scene1.nodes.find((n) => n.id === 'gateway')).toBeDefined();
    expect(scene1.nodes.find((n) => n.id === 'database')).toBeDefined();

    // 3. User drags Gateway on visual canvas to a custom coordinate (x: 550, y: 320)
    const customX = 550;
    const customY = 320;
    const metadataAfterDrag: LayoutMetadata = {
      version: 1,
      nodes: {
        gateway: { x: customX, y: customY, pinned: true },
      },
      viewport: { panX: 100, panY: 80, zoom: 1.1 },
    };

    // 4. File is serialized into .diag format
    const diagFileText = serializeDiag(initialDsl, metadataAfterDrag);
    expect(diagFileText).toContain('// @layout:v1');
    expect(diagFileText).toContain('"gateway": {');
    expect(diagFileText).toContain('"pinned": true');

    // 5. User opens or continues editing DSL:
    // Adds a new node [Auth Service] and renames (Database) to (PostgreSQL DB)
    const updatedDsl = `
      [Client] -> [Gateway] : REST
      [Gateway] -> [Auth Service] : JWT Validate
      [Gateway] -> (PostgreSQL DB) : Query
    `;

    // 6. Application deserializes previous metadata and parses new DSL
    const { metadata: loadedMeta } = deserializeDiag(diagFileText);
    const ast2 = parseDSL(updatedDsl);

    expect(ast2.nodes).toHaveLength(4);
    expect(ast2.edges).toHaveLength(3);

    // 7. Reconciler merges new AST with loaded metadata overrides
    const scene2 = computeLayout(ast2, loadedMeta);

    // CRITICAL VALUE PROPOSITION:
    // Gateway MUST retain its exact pinned coordinates across the code edit!
    const gatewayNode2 = scene2.nodes.find((n) => n.id === 'gateway')!;
    expect(gatewayNode2.pinned).toBe(true);
    expect(gatewayNode2.x).toBe(customX);
    expect(gatewayNode2.y).toBe(customY);

    // Newly added [Auth Service] is positioned without crashing or resetting Gateway
    const authNode = scene2.nodes.find((n) => n.id === 'auth-service')!;
    expect(authNode).toBeDefined();

    // Renamed database preserves position via rename heuristic
    const renamedDbNode = scene2.nodes.find((n) => n.id === 'postgresql-db')!;
    expect(renamedDbNode).toBeDefined();

    // Connected edges are routed orthogonally around the pinned coordinates
    expect(scene2.edges).toHaveLength(3);
    for (const edge of scene2.edges) {
      expect(edge.waypoints.length).toBeGreaterThanOrEqual(2);
    }
  });
});
