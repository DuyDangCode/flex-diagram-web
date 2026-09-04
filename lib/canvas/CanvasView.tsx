import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { SceneGraph, ViewportState } from '../types';
import { DARK_THEME, LIGHT_THEME, Renderer2D } from './renderer_2d';
import { screenToWorld, zoomAtPoint } from './viewport';
import { findNodeAtPoint, findNodesInRect } from './hit_test';
import { routeOrthogonalEdge } from '../layout/orthogonal_router';
import { calculateAlignmentSnap, AlignmentGuide } from './alignment';

export interface MovedNode {
  id: string;
  x: number;
  y: number;
  pinned: boolean;
}

export interface CanvasViewProps {
  scene: SceneGraph;
  viewport: ViewportState;
  selectedNodeIds?: ReadonlySet<string>;
  onViewportChange: (viewport: ViewportState) => void;
  onNodeMoved?: (id: string, x: number, y: number, pinned: boolean) => void;
  onNodesMoved?: (nodes: MovedNode[]) => void;
  onSelectionChange?: (selectedIds: ReadonlySet<string>) => void;
  snapToGridEnabled?: boolean;
  defaultMode?: 'pan' | 'select';
  theme?: 'dark' | 'light';
  showGrid?: boolean;
  onToggleGrid?: () => void;
}

interface DragState {
  type: 'node' | 'pan' | 'marquee';
  startX: number;
  startY: number;
  hasMoved?: boolean;
  // Node group drag initial coordinates
  initialNodePositions?: Map<string, { x: number; y: number }>;
  // Canvas pan initial coordinates
  panInitialX?: number;
  panInitialY?: number;
  // Marquee selection bounds in world space
  marqueeStartWorld?: { x: number; y: number };
}

export const CanvasView: React.FC<CanvasViewProps> = ({
  scene,
  viewport,
  selectedNodeIds: controlledSelectedIds,
  onViewportChange,
  onNodeMoved,
  onNodesMoved,
  onSelectionChange,
  snapToGridEnabled = true,
  defaultMode = 'pan',
  theme = 'dark',
  showGrid: controlledShowGrid,
  onToggleGrid,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const isSpacePressedRef = useRef<boolean>(false);
  const [toolMode, setToolMode] = useState<'pan' | 'select'>(defaultMode);
  const [internalShowGrid, setInternalShowGrid] = useState<boolean>(true);
  const isGridActive = controlledShowGrid !== undefined ? controlledShowGrid : internalShowGrid;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'TEXTAREA' || targetTag === 'INPUT') return;

      if (e.code === 'Space') {
        isSpacePressedRef.current = true;
        if (canvasRef.current && !dragStateRef.current) {
          canvasRef.current.style.cursor = 'grab';
        }
      } else if (e.key.toLowerCase() === 'h') {
        setToolMode('pan');
        if (canvasRef.current && !dragStateRef.current) {
          canvasRef.current.style.cursor = 'grab';
        }
      } else if (e.key.toLowerCase() === 'v') {
        setToolMode('select');
        if (canvasRef.current && !dragStateRef.current) {
          canvasRef.current.style.cursor = 'default';
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        if (canvasRef.current && !dragStateRef.current) {
          canvasRef.current.style.cursor = toolMode === 'pan' ? 'grab' : 'default';
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [toolMode]);

  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const selectedNodeIds = useMemo(() => {
    return controlledSelectedIds !== undefined ? controlledSelectedIds : internalSelectedIds;
  }, [controlledSelectedIds, internalSelectedIds]);

  const updateSelection = useCallback(
    (newSelection: Set<string>) => {
      setInternalSelectedIds(newSelection);
      onSelectionChange?.(newSelection);
    },
    [onSelectionChange],
  );

  const [draggedPositions, setDraggedPositions] = useState<Map<string, { x: number; y: number }> | null>(null);
  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);
  const [marqueeBox, setMarqueeBox] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);

  // Compute effective scene incorporating current live node positions & dynamic edge re-routing
  const effectiveScene: SceneGraph = useMemo(() => {
    if (!draggedPositions || draggedPositions.size === 0) return scene;

    const updatedNodes = scene.nodes.map((n) => {
      const livePos = draggedPositions.get(n.id);
      return livePos ? { ...n, x: livePos.x, y: livePos.y } : n;
    });

    const nodeMap = new Map(updatedNodes.map((n) => [n.id, n]));
    const updatedEdges = scene.edges.map((edge) => {
      if (draggedPositions.has(edge.sourceId) || draggedPositions.has(edge.targetId)) {
        const s = nodeMap.get(edge.sourceId);
        const t = nodeMap.get(edge.targetId);
        if (s && t) {
          return routeOrthogonalEdge(edge.edgeId, s, t, updatedNodes, edge.label, 0, edge.style);
        }
      }
      return edge;
    });

    return {
      ...scene,
      nodes: updatedNodes,
      edges: updatedEdges,
    };
  }, [scene, draggedPositions]);

  // Render loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const effectiveTheme = theme === 'light' ? LIGHT_THEME : DARK_THEME;
    const renderer = new Renderer2D(ctx, effectiveTheme);
    renderer.render(effectiveScene, viewport, selectedNodeIds, activeGuides, marqueeBox, isGridActive);
  }, [effectiveScene, viewport, selectedNodeIds, activeGuides, marqueeBox, theme, isGridActive]);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      renderCanvas();
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [renderCanvas]);

  // Resize canvas to match container DPI
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      renderCanvas();
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }
    return () => observer.disconnect();
  }, [renderCanvas]);

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = screenToWorld(screenX, screenY, viewport);

    const hitNode = findNodeAtPoint(effectiveScene.nodes, worldPoint);

    const isPanTrigger =
      e.button === 1 || // Middle mouse click
      (e.button === 0 && e.altKey) || // Alt + Left mouse
      (e.button === 0 && isSpacePressedRef.current) || // Space + Left mouse
      (e.button === 0 && toolMode === 'pan' && !hitNode && !e.shiftKey); // Left click & hold on canvas panel!

    const isMarqueeTrigger =
      (e.button === 0 && !hitNode && toolMode === 'select' && !isSpacePressedRef.current) ||
      (e.button === 0 && !hitNode && e.shiftKey); // Shift + Left drag on background

    if (isPanTrigger) {
      if (canvas) canvas.style.cursor = 'grabbing';
      dragStateRef.current = {
        type: 'pan',
        startX: screenX,
        startY: screenY,
        hasMoved: false,
        panInitialX: viewport.panX,
        panInitialY: viewport.panY,
      };
    } else if (isMarqueeTrigger) {
      if (canvas) canvas.style.cursor = 'crosshair';
      if (!e.shiftKey) {
        updateSelection(new Set());
      }
      dragStateRef.current = {
        type: 'marquee',
        startX: screenX,
        startY: screenY,
        hasMoved: false,
        marqueeStartWorld: worldPoint,
      };
      setMarqueeBox(null);
    } else if (e.button === 0 && hitNode) {
      if (canvas) canvas.style.cursor = 'grabbing';
      // Clicked on a node
      let nextSelected: Set<string>;

      if (e.shiftKey) {
        // Shift-click: toggle node in/out of selection
        nextSelected = new Set(selectedNodeIds);
        if (nextSelected.has(hitNode.id)) {
          nextSelected.delete(hitNode.id);
        } else {
          nextSelected.add(hitNode.id);
        }
      } else {
        // Normal click: if already in multi-selection, keep group; otherwise select only this node
        if (selectedNodeIds.has(hitNode.id) && selectedNodeIds.size > 1) {
          nextSelected = new Set(selectedNodeIds);
        } else {
          nextSelected = new Set([hitNode.id]);
        }
      }

      updateSelection(nextSelected);

      // Initialize group dragging positions
      const initialPositions = new Map<string, { x: number; y: number }>();
      for (const node of effectiveScene.nodes) {
        if (nextSelected.has(node.id)) {
          initialPositions.set(node.id, { x: node.x, y: node.y });
        }
      }

      dragStateRef.current = {
        type: 'node',
        startX: screenX,
        startY: screenY,
        hasMoved: false,
        initialNodePositions: initialPositions,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const drag = dragStateRef.current;
    if (!drag) {
      // Hover cursor management
      const worldPoint = screenToWorld(screenX, screenY, viewport);
      const hitNode = findNodeAtPoint(effectiveScene.nodes, worldPoint);
      if (hitNode) {
        canvas.style.cursor = 'pointer';
      } else if (toolMode === 'pan' || isSpacePressedRef.current) {
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'crosshair';
      }
      return;
    }

    if (drag.type === 'pan' && drag.panInitialX !== undefined && drag.panInitialY !== undefined) {
      const dx = screenX - drag.startX;
      const dy = screenY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        drag.hasMoved = true;
      }
      onViewportChange({
        ...viewport,
        panX: drag.panInitialX + dx,
        panY: drag.panInitialY + dy,
      });
    } else if (drag.type === 'marquee' && drag.marqueeStartWorld) {
      const currentWorld = screenToWorld(screenX, screenY, viewport);
      const box = {
        minX: Math.min(drag.marqueeStartWorld.x, currentWorld.x),
        minY: Math.min(drag.marqueeStartWorld.y, currentWorld.y),
        maxX: Math.max(drag.marqueeStartWorld.x, currentWorld.x),
        maxY: Math.max(drag.marqueeStartWorld.y, currentWorld.y),
      };
      setMarqueeBox(box);

      // Dynamically highlight nodes intersecting marquee
      const insideNodes = findNodesInRect(scene.nodes, box);
      const selected = new Set(insideNodes.map((n) => n.id));
      updateSelection(selected);
    } else if (drag.type === 'node' && drag.initialNodePositions) {
      const rawDx = (screenX - drag.startX) / viewport.zoom;
      const rawDy = (screenY - drag.startY) / viewport.zoom;

      // Prepare candidate positions
      const nextPositions = new Map<string, { x: number; y: number }>();
      const draggedNodeStates: typeof scene.nodes[0][] = [];
      const stationaryNodes: typeof scene.nodes[0][] = [];

      for (const node of scene.nodes) {
        const init = drag.initialNodePositions.get(node.id);
        if (init) {
          draggedNodeStates.push({
            ...node,
            x: init.x + rawDx,
            y: init.y + rawDy,
          });
        } else {
          stationaryNodes.push(node);
        }
      }

      let snapDx = rawDx;
      let snapDy = rawDy;
      let guides: AlignmentGuide[] = [];

      if (snapToGridEnabled && draggedNodeStates.length > 0) {
        const snap = calculateAlignmentSnap(draggedNodeStates, stationaryNodes);
        const refInitial = drag.initialNodePositions.get(draggedNodeStates[0].id);
        if (refInitial) {
          snapDx = snap.x - refInitial.x;
          snapDy = snap.y - refInitial.y;
          guides = snap.guides;
        }
      }

      setActiveGuides(guides);

      for (const [id, init] of drag.initialNodePositions.entries()) {
        nextPositions.set(id, {
          x: Math.round(init.x + snapDx),
          y: Math.round(init.y + snapDy),
        });
      }

      setDraggedPositions(nextPositions);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;

    if (drag && drag.type === 'node' && draggedPositions && draggedPositions.size > 0) {
      // Commit pinned positions for all moved nodes
      const movedList: MovedNode[] = [];
      for (const [id, pos] of draggedPositions.entries()) {
        movedList.push({ id, x: pos.x, y: pos.y, pinned: true });
        onNodeMoved?.(id, pos.x, pos.y, true);
      }
      onNodesMoved?.(movedList);
    }

    if (drag && drag.type === 'pan' && !drag.hasMoved && !e.shiftKey) {
      // Clicked on empty canvas without dragging -> clear selection
      updateSelection(new Set());
    }

    dragStateRef.current = null;
    setDraggedPositions(null);
    setActiveGuides([]);
    setMarqueeBox(null);

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (canvas) {
      canvas.style.cursor = toolMode === 'pan' || isSpacePressedRef.current ? 'grab' : 'default';
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newViewport = zoomAtPoint(viewport, screenX, screenY, zoomFactor);
    onViewportChange(newViewport);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: toolMode === 'pan' ? 'grab' : 'default',
          touchAction: 'none',
        }}
      />

      {/* Floating Canvas Tool HUD */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(26, 27, 32, 0.92)',
          backdropFilter: 'blur(8px)',
          border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #2e3340',
          borderRadius: 8,
          padding: 5,
          boxShadow: theme === 'light' ? '0 4px 16px rgba(0,0,0,0.1)' : '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        {/* Tool Mode Toggles */}
        <div
          style={{
            display: 'flex',
            background: theme === 'light' ? '#f1f5f9' : '#181a20',
            borderRadius: 5,
            padding: 2,
            gap: 2,
          }}
        >
          <button
            onClick={() => {
              setToolMode('pan');
              if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
            }}
            style={{
              ...getDynamicButtonStyle(theme === 'light'),
              width: 'auto',
              padding: '0 8px',
              fontSize: 12,
              background: toolMode === 'pan' ? '#3b82f6' : 'transparent',
              color: toolMode === 'pan' ? '#ffffff' : theme === 'light' ? '#64748b' : '#9aa2b1',
              border: 'none',
            }}
            title="Pan Mode (H / Click & hold left mouse to move panel)"
          >
            ✋ Pan
          </button>
          <button
            onClick={() => {
              setToolMode('select');
              if (canvasRef.current) canvasRef.current.style.cursor = 'default';
            }}
            style={{
              ...getDynamicButtonStyle(theme === 'light'),
              width: 'auto',
              padding: '0 8px',
              fontSize: 12,
              background: toolMode === 'select' ? '#3b82f6' : 'transparent',
              color: toolMode === 'select' ? '#ffffff' : theme === 'light' ? '#64748b' : '#9aa2b1',
              border: 'none',
            }}
            title="Marquee Select Mode (V / Drag box to select nodes)"
          >
            ↖ Select
          </button>
        </div>

        <div
          style={{
            width: 1,
            height: 18,
            background: theme === 'light' ? '#cbd5e1' : '#2e3340',
            margin: '0 2px',
          }}
        />

        {/* Grid Toggle Button */}
        <button
          onClick={() => (onToggleGrid ? onToggleGrid() : setInternalShowGrid((g) => !g))}
          style={{
            ...getDynamicButtonStyle(theme === 'light'),
            width: 'auto',
            padding: '0 8px',
            fontSize: 11,
            background: isGridActive
              ? theme === 'light'
                ? '#dbeafe'
                : '#1e3a8a'
              : theme === 'light'
                ? '#f8fafc'
                : '#24262e',
            color: isGridActive
              ? theme === 'light'
                ? '#1d4ed8'
                : '#60a5fa'
              : theme === 'light'
                ? '#64748b'
                : '#9aa2b1',
            borderColor: isGridActive
              ? theme === 'light'
                ? '#93c5fd'
                : '#3b82f6'
              : theme === 'light'
                ? '#cbd5e1'
                : '#3e4456',
          }}
          title={isGridActive ? 'Grid is ON (Click to turn off)' : 'Grid is OFF (Click to turn on)'}
        >
          {isGridActive ? '▦ Grid' : '⬚ Grid'}
        </button>

        <div
          style={{
            width: 1,
            height: 18,
            background: theme === 'light' ? '#cbd5e1' : '#2e3340',
            margin: '0 2px',
          }}
        />

        <button
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const cx = canvas.clientWidth / 2;
            const cy = canvas.clientHeight / 2;
            onViewportChange(zoomAtPoint(viewport, cx, cy, 1.2));
          }}
          style={getDynamicButtonStyle(theme === 'light')}
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const cx = canvas.clientWidth / 2;
            const cy = canvas.clientHeight / 2;
            onViewportChange(zoomAtPoint(viewport, cx, cy, 0.8));
          }}
          style={getDynamicButtonStyle(theme === 'light')}
          title="Zoom Out"
        >
          -
        </button>
        <button
          onClick={() => {
            onViewportChange({ panX: 60, panY: 60, zoom: 1 });
          }}
          style={{
            ...getDynamicButtonStyle(theme === 'light'),
            width: 'auto',
            padding: '0 8px',
            fontSize: 11,
          }}
          title="Reset View to 100%"
        >
          Reset ({Math.round(viewport.zoom * 100)}%)
        </button>
      </div>
    </div>
  );
};

const getDynamicButtonStyle = (isLight: boolean): React.CSSProperties => ({
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: isLight ? '#f8fafc' : '#24262e',
  color: isLight ? '#0f172a' : '#f0f3f6',
  border: isLight ? '1px solid #cbd5e1' : '1px solid #3e4456',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 'bold',
});
