import { describe, it, expect } from 'vitest';
import { HistoryManager } from '../../lib/history';
import { snapToGrid, calculateAlignmentSnap } from '../../lib/canvas/alignment';
import { findNodesInRect } from '../../lib/canvas/hit_test';
import { panViewport } from '../../lib/canvas/viewport';
import { DARK_THEME, LIGHT_THEME, Renderer2D } from '../../lib/canvas/renderer_2d';
import { NodeState, SceneGraph } from '../../lib/types';

describe('HistoryManager (Undo/Redo)', () => {
  it('handles push, undo, and redo correctly', () => {
    const history = new HistoryManager(10);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    const state1 = { fileContent: 'content-1', viewport: { panX: 0, panY: 0, zoom: 1 } };
    const state2 = { fileContent: 'content-2', viewport: { panX: 10, panY: 10, zoom: 1 } };
    const state3 = { fileContent: 'content-3', viewport: { panX: 20, panY: 20, zoom: 1 } };

    history.push(state1);
    history.push(state2);
    expect(history.canUndo()).toBe(true);

    const undo1 = history.undo(state3);
    expect(undo1?.fileContent).toBe('content-2');
    expect(history.canRedo()).toBe(true);

    const redo1 = history.redo(state2);
    expect(redo1?.fileContent).toBe('content-3');
  });

  it('respects maximum history stack capacity', () => {
    const history = new HistoryManager(3);
    for (let i = 1; i <= 5; i++) {
      history.push({ fileContent: `step-${i}`, viewport: { panX: 0, panY: 0, zoom: 1 } });
    }

    // Since max capacity is 3, only the last 3 items should remain
    const u1 = history.undo({ fileContent: 'current', viewport: { panX: 0, panY: 0, zoom: 1 } });
    expect(u1?.fileContent).toBe('step-5');
    const u2 = history.undo({ fileContent: 'u1', viewport: { panX: 0, panY: 0, zoom: 1 } });
    expect(u2?.fileContent).toBe('step-4');
    const u3 = history.undo({ fileContent: 'u2', viewport: { panX: 0, panY: 0, zoom: 1 } });
    expect(u3?.fileContent).toBe('step-3');
    expect(history.canUndo()).toBe(false);
  });
});

describe('Snap to Grid and Alignment Guides', () => {
  it('snaps numbers to grid', () => {
    expect(snapToGrid(11, 10)).toBe(10);
    expect(snapToGrid(16, 10)).toBe(20);
    expect(snapToGrid(0, 10)).toBe(0);
  });

  it('detects center-to-center alignment guides', () => {
    const stationary: NodeState = {
      id: 'a',
      name: 'A',
      label: 'A',
      shape: 'rectangle',
      x: 300,
      y: 200,
      width: 120,
      height: 60,
      pinned: true,
      isNew: false,
    };

    // Candidate node is near center-x (x = 302 vs 300)
    const dragged: NodeState = {
      id: 'b',
      name: 'B',
      label: 'B',
      shape: 'rectangle',
      x: 302,
      y: 400,
      width: 120,
      height: 60,
      pinned: false,
      isNew: false,
    };

    const snap = calculateAlignmentSnap([dragged], [stationary], 6);
    expect(snap.x).toBe(300); // Snapped to 300!
    expect(snap.guides.length).toBeGreaterThanOrEqual(1);
    expect(snap.guides[0].type).toBe('x');
    expect(snap.guides[0].position).toBe(300);
  });
});

describe('Marquee Box Selection', () => {
  const nodes: NodeState[] = [
    { id: '1', name: 'N1', label: 'N1', shape: 'rectangle', x: 100, y: 100, width: 80, height: 40, pinned: false, isNew: false },
    { id: '2', name: 'N2', label: 'N2', shape: 'rectangle', x: 250, y: 100, width: 80, height: 40, pinned: false, isNew: false },
    { id: '3', name: 'N3', label: 'N3', shape: 'rectangle', x: 500, y: 400, width: 80, height: 40, pinned: false, isNew: false },
  ];

  it('selects nodes intersecting the marquee rectangle', () => {
    const rect = { minX: 50, minY: 50, maxX: 350, maxY: 150 };
    const selected = findNodesInRect(nodes, rect);

    expect(selected).toHaveLength(2);
    expect(selected.map((n) => n.id)).toEqual(['1', '2']);
  });

  it('returns empty array when marquee misses all nodes', () => {
    const rect = { minX: 1000, minY: 1000, maxX: 1200, maxY: 1200 };
    const selected = findNodesInRect(nodes, rect);
    expect(selected).toHaveLength(0);
  });
});

describe('Panel View Panning & Viewport Navigation', () => {
  it('moves the panel view coordinates smoothly when panning', () => {
    const initialViewport = { panX: 60, panY: 60, zoom: 1 };
    const moved = panViewport(initialViewport, 45, -20);

    expect(moved.panX).toBe(105);
    expect(moved.panY).toBe(40);
    expect(moved.zoom).toBe(1);
  });

  it('preserves zoom ratio during panel view panning', () => {
    const zoomedViewport = { panX: 100, panY: 200, zoom: 2.5 };
    const moved = panViewport(zoomedViewport, -50, 100);

    expect(moved.panX).toBe(50);
    expect(moved.panY).toBe(300);
    expect(moved.zoom).toBe(2.5);
  });
});

describe('Themes & Grid Visibility Options', () => {
  it('defines valid DARK_THEME and LIGHT_THEME with appropriate contrast', () => {
    expect(DARK_THEME.canvasBg).toBe('#0e0f12');
    expect(DARK_THEME.nodeCylinderCap).toBe('#222733');
    expect(LIGHT_THEME.canvasBg).toBe('#ffffff');
    expect(LIGHT_THEME.nodeText).toBe('#0f172a');
    expect(LIGHT_THEME.nodeBg).toBe('#f8fafc');
    expect(LIGHT_THEME.nodeCylinderCap).toBe('#e2e8f0'); // Not black/dark in light mode!
  });

  it('renders canvas with showGrid enabled and disabled', () => {
    const scene: SceneGraph = {
      nodes: [{ id: '1', name: 'N', label: 'N', shape: 'rectangle', x: 100, y: 100, width: 80, height: 40, pinned: false, isNew: false }],
      edges: [],
      boundingBox: { minX: 0, minY: 0, maxX: 200, maxY: 200 },
    };
    const viewport = { panX: 0, panY: 0, zoom: 1 };

    const arcCalls: unknown[][] = [];
    const ctx = {
      canvas: { width: 800, height: 600 },
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      scale: () => {},
      translate: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: (...args: unknown[]) => arcCalls.push(args),
      fill: () => {},
      stroke: () => {},
      closePath: () => {},
      roundRect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 10 }),
    } as unknown as CanvasRenderingContext2D;

    // With grid enabled
    const renderer = new Renderer2D(ctx, LIGHT_THEME);
    renderer.render(scene, viewport, null, [], null, true);
    const gridDotsWithGrid = arcCalls.length;
    expect(gridDotsWithGrid).toBeGreaterThan(0);

    // With grid disabled
    arcCalls.length = 0;
    renderer.render(scene, viewport, null, [], null, false);
    const gridDotsWithoutGrid = arcCalls.length;
    expect(gridDotsWithoutGrid).toBe(0);
  });
});
