import { describe, it, expect } from 'vitest';
import { parseDSL } from '../../lib/parser';
import { reconcileState } from '../../lib/reconciler';
import { LayoutMetadata } from '../../lib/types';

describe('State Reconciler', () => {
  it('preserves pinned coordinates of existing nodes', () => {
    const dsl = `
      [Client] -> [Gateway]
    `;
    const ast = parseDSL(dsl);

    const initialMetadata: LayoutMetadata = {
      version: 1,
      nodes: {
        client: { x: 300, y: 150, pinned: true },
        gateway: { x: 550, y: 150, pinned: false },
      },
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };

    const result = reconcileState(ast, initialMetadata);
    const client = result.nodes.find((n) => n.id === 'client');
    const gateway = result.nodes.find((n) => n.id === 'gateway');

    expect(client?.status).toBe('retained_pinned');
    expect(client?.x).toBe(300);
    expect(client?.y).toBe(150);
    expect(client?.pinned).toBe(true);

    expect(gateway?.status).toBe('retained_unpinned');
    expect(result.prunedNodeIds).toHaveLength(0);
  });

  it('prunes deleted nodes from layout metadata', () => {
    // AST only has Client; Gateway was removed from DSL
    const dsl = `[Client]`;
    const ast = parseDSL(dsl);

    const initialMetadata: LayoutMetadata = {
      version: 1,
      nodes: {
        client: { x: 100, y: 100, pinned: true },
        gateway: { x: 300, y: 100, pinned: true },
        database: { x: 500, y: 100, pinned: false },
      },
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };

    const result = reconcileState(ast, initialMetadata);

    expect(result.nodes).toHaveLength(1);
    expect(result.prunedNodeIds).toContain('gateway');
    expect(result.prunedNodeIds).toContain('database');
    expect(result.updatedMetadata.nodes['gateway']).toBeUndefined();
    expect(result.updatedMetadata.nodes['database']).toBeUndefined();
    expect(result.updatedMetadata.nodes['client']).toBeDefined();
  });

  it('places newly added node without overlapping existing nodes', () => {
    const dsl = `
      [Client] -> [Auth Service]
    `;
    const ast = parseDSL(dsl);

    const initialMetadata: LayoutMetadata = {
      version: 1,
      nodes: {
        client: { x: 200, y: 200, pinned: true },
      },
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };

    const result = reconcileState(ast, initialMetadata);
    const client = result.nodes.find((n) => n.id === 'client');
    const auth = result.nodes.find((n) => n.id === 'auth-service');

    expect(client?.pinned).toBe(true);
    expect(auth?.status).toBe('newly_created');
    expect(auth?.pinned).toBe(false);

    // Bounding boxes must not collide
    const halfClientW = client!.width / 2;
    const halfClientH = client!.height / 2;
    const halfAuthW = auth!.width / 2;
    const halfAuthH = auth!.height / 2;

    const noXOverlap = Math.abs(client!.x - auth!.x) >= halfClientW + halfAuthW;
    const noYOverlap = Math.abs(client!.y - auth!.y) >= halfClientH + halfAuthH;
    expect(noXOverlap || noYOverlap).toBe(true);
  });

  it('detects node rename and preserves previous coordinate position', () => {
    // User modified DSL from [Order Svc] to [Order Service]
    const dsl = `[Order Service]`;
    const ast = parseDSL(dsl);

    const initialMetadata: LayoutMetadata = {
      version: 1,
      nodes: {
        'order-svc': { x: 420, y: 310, pinned: true },
      },
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };

    const result = reconcileState(ast, initialMetadata);
    const orderSvc = result.nodes.find((n) => n.id === 'order-service');

    expect(orderSvc).toBeDefined();
    expect(orderSvc?.status).toBe('renamed');
    expect(orderSvc?.previousId).toBe('order-svc');
    expect(orderSvc?.x).toBe(420);
    expect(orderSvc?.y).toBe(310);
    expect(orderSvc?.pinned).toBe(true);

    // Old key migrated to new key in metadata
    expect(result.updatedMetadata.nodes['order-svc']).toBeUndefined();
    expect(result.updatedMetadata.nodes['order-service']).toBeDefined();
  });
});
