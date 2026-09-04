import { EdgeRoute, NodeState, SceneGraph, ViewportState } from '../types';

export interface RenderTheme {
  canvasBg: string;
  gridDotColor: string;
  nodeBg: string;
  nodeBorder: string;
  nodeText: string;
  nodePinnedBadge: string;
  nodeSelectedBorder: string;
  nodeCylinderCap: string;
  edgeLine: string;
  edgeText: string;
  edgeBadgeBg: string;
}

export const DARK_THEME: RenderTheme = {
  canvasBg: '#0e0f12',
  gridDotColor: '#20242f',
  nodeBg: '#1a1d26',
  nodeBorder: '#3e4456',
  nodeText: '#f1f5f9',
  nodePinnedBadge: '#f59e0b',
  nodeSelectedBorder: '#3b82f6',
  nodeCylinderCap: '#222733',
  edgeLine: '#64748b',
  edgeText: '#cbd5e1',
  edgeBadgeBg: '#1e293b',
};

export const LIGHT_THEME: RenderTheme = {
  canvasBg: '#ffffff',
  gridDotColor: '#cbd5e1',
  nodeBg: '#f8fafc',
  nodeBorder: '#94a3b8',
  nodeText: '#0f172a',
  nodePinnedBadge: '#f59e0b',
  nodeSelectedBorder: '#2563eb',
  nodeCylinderCap: '#e2e8f0',
  edgeLine: '#475569',
  edgeText: '#1e293b',
  edgeBadgeBg: '#e2e8f0',
};

export const DEFAULT_THEME: RenderTheme = DARK_THEME;

export class Renderer2D {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly theme: RenderTheme;

  constructor(ctx: CanvasRenderingContext2D, theme: RenderTheme = DEFAULT_THEME) {
    this.ctx = ctx;
    this.theme = theme;
  }

  public render(
    scene: SceneGraph,
    viewport: ViewportState,
    selectedNodeIds?: ReadonlySet<string> | string | null,
    alignmentGuides?: readonly { type: 'x' | 'y'; position: number; from: number; to: number }[],
    selectionMarquee?: { minX: number; minY: number; maxX: number; maxY: number } | null,
    showGrid = true,
  ): void {
    const ctx = this.ctx;
    const canvas = ctx.canvas;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    // Clear entire screen
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.theme.canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Apply viewport transform (Pan & Zoom)
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);

    // 1. Draw Background Grid (if enabled)
    if (showGrid) {
      this.renderGrid(viewport, canvas.width / dpr, canvas.height / dpr);
    }

    // 2. Draw Edges
    for (const edge of scene.edges) {
      this.renderEdge(edge);
    }

    // 3. Draw Edge Labels
    for (const edge of scene.edges) {
      if (edge.label && edge.labelPosition) {
        this.renderEdgeLabel(edge.label, edge.labelPosition);
      }
    }

    // 4. Draw Nodes
    const isNodeSelected = (id: string) => {
      if (!selectedNodeIds) return false;
      if (typeof selectedNodeIds === 'string') return id === selectedNodeIds;
      if (selectedNodeIds instanceof Set) return selectedNodeIds.has(id);
      return false;
    };

    for (const node of scene.nodes) {
      this.renderNode(node, isNodeSelected(node.id));
    }

    // 5. Draw Alignment Guides
    if (alignmentGuides && alignmentGuides.length > 0) {
      this.renderAlignmentGuides(alignmentGuides);
    }

    // 6. Draw Marquee Selection Box
    if (selectionMarquee) {
      this.renderMarquee(selectionMarquee);
    }

    ctx.restore();
  }

  private renderAlignmentGuides(
    guides: readonly { type: 'x' | 'y'; position: number; from: number; to: number }[],
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#38bdf8'; // Sky blue guide line
    ctx.lineWidth = 1;

    for (const g of guides) {
      ctx.beginPath();
      if (g.type === 'x') {
        ctx.moveTo(g.position, g.from);
        ctx.lineTo(g.position, g.to);
      } else {
        ctx.moveTo(g.from, g.position);
        ctx.lineTo(g.to, g.position);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderMarquee(box: { minX: number; minY: number; maxX: number; maxY: number }): void {
    const ctx = this.ctx;
    const x = Math.min(box.minX, box.maxX);
    const y = Math.min(box.minY, box.maxY);
    const w = Math.abs(box.maxX - box.minX);
    const h = Math.abs(box.maxY - box.minY);

    ctx.save();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    ctx.fillRect(x, y, w, h);

    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  private renderGrid(viewport: ViewportState, viewWidth: number, viewHeight: number): void {
    const ctx = this.ctx;
    const gridSize = 24;

    // Calculate visible world bounds
    const startX = Math.floor((-viewport.panX / viewport.zoom) / gridSize) * gridSize - gridSize;
    const startY = Math.floor((-viewport.panY / viewport.zoom) / gridSize) * gridSize - gridSize;
    const endX = startX + (viewWidth / viewport.zoom) + gridSize * 2;
    const endY = startY + (viewHeight / viewport.zoom) + gridSize * 2;

    ctx.fillStyle = this.theme.gridDotColor;
    const dotRadius = Math.max(1, 1.2 / viewport.zoom);

    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private renderNode(node: NodeState, isSelected: boolean): void {
    const ctx = this.ctx;
    const halfW = node.width / 2;
    const halfH = node.height / 2;
    const x = node.x - halfW;
    const y = node.y - halfH;

    ctx.save();

    // Node drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    if (node.shape === 'cylinder') {
      this.renderCylinder(x, y, node.width, node.height, isSelected);
    } else if (node.shape === 'diamond') {
      this.renderDiamond(node.x, node.y, node.width, node.height, isSelected);
    } else {
      // Default: Rounded Rectangle
      this.renderRoundedRect(x, y, node.width, node.height, isSelected);
    }

    ctx.restore();

    // Draw Node Text
    ctx.save();
    ctx.fillStyle = this.theme.nodeText;
    ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, node.x, node.y);
    ctx.restore();

    // Pin indicator badge
    if (node.pinned) {
      this.renderPinBadge(node.x + halfW - 12, node.y - halfH + 12);
    }
  }

  private renderRoundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    isSelected: boolean,
  ): void {
    const ctx = this.ctx;
    const radius = 8;

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = this.theme.nodeBg;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeStyle = isSelected ? this.theme.nodeSelectedBorder : this.theme.nodeBorder;
    ctx.stroke();
  }

  private renderCylinder(
    x: number,
    y: number,
    w: number,
    h: number,
    isSelected: boolean,
  ): void {
    const ctx = this.ctx;
    const ry = 12; // Ellipse vertical radius
    const rx = w / 2;
    const cx = x + rx;

    // Body + Bottom Cap
    ctx.beginPath();
    ctx.ellipse(cx, y + ry, rx, ry, 0, Math.PI, 0, false);
    ctx.lineTo(x + w, y + h - ry);
    ctx.ellipse(cx, y + h - ry, rx, ry, 0, 0, Math.PI, false);
    ctx.lineTo(x, y + ry);
    ctx.closePath();

    ctx.fillStyle = this.theme.nodeBg;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeStyle = isSelected ? this.theme.nodeSelectedBorder : this.theme.nodeBorder;
    ctx.stroke();

    // Top Cap Ellipse
    ctx.beginPath();
    ctx.ellipse(cx, y + ry, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = this.theme.nodeCylinderCap || this.theme.nodeBg;
    ctx.fill();
    ctx.stroke();
  }

  private renderDiamond(
    cx: number,
    cy: number,
    w: number,
    h: number,
    isSelected: boolean,
  ): void {
    const ctx = this.ctx;
    const halfW = w / 2;
    const halfH = h / 2;

    ctx.beginPath();
    ctx.moveTo(cx, cy - halfH);
    ctx.lineTo(cx + halfW, cy);
    ctx.lineTo(cx, cy + halfH);
    ctx.lineTo(cx - halfW, cy);
    ctx.closePath();

    ctx.fillStyle = this.theme.nodeBg;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeStyle = isSelected ? this.theme.nodeSelectedBorder : this.theme.nodeBorder;
    ctx.stroke();
  }

  private renderPinBadge(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = this.theme.nodePinnedBadge;
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private renderEdge(edge: EdgeRoute): void {
    const ctx = this.ctx;
    const waypoints = edge.waypoints;
    if (waypoints.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y);

    for (let i = 1; i < waypoints.length; i++) {
      ctx.lineTo(waypoints[i].x, waypoints[i].y);
    }

    if (edge.style === 'dotted') {
      ctx.setLineDash([4, 4]);
    } else if (edge.style === 'dashed') {
      ctx.setLineDash([8, 5]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = this.theme.edgeLine;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Render Arrowhead on the last waypoint
    const last = waypoints[waypoints.length - 1];
    const prev = waypoints[waypoints.length - 2];
    this.renderArrowhead(prev.x, prev.y, last.x, last.y);

    ctx.restore();
  }

  private renderArrowhead(fromX: number, fromY: number, toX: number, toY: number): void {
    const ctx = this.ctx;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const arrowLength = 9;
    const arrowWidth = 5;

    ctx.save();
    ctx.translate(toX, toY);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-arrowLength, -arrowWidth);
    ctx.lineTo(-arrowLength, arrowWidth);
    ctx.closePath();

    ctx.fillStyle = this.theme.edgeLine;
    ctx.fill();
    ctx.restore();
  }

  private renderEdgeLabel(label: string, pos: { x: number; y: number }): void {
    const ctx = this.ctx;
    ctx.save();

    ctx.font = '500 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const metrics = ctx.measureText(label);
    const padX = 8;
    const padY = 3;
    const badgeW = metrics.width + padX * 2;
    const badgeH = 12 + padY * 2;

    // Label pill background
    ctx.beginPath();
    ctx.roundRect(pos.x - badgeW / 2, pos.y - badgeH / 2, badgeW, badgeH, 4);
    ctx.fillStyle = this.theme.edgeBadgeBg;
    ctx.fill();
    ctx.strokeStyle = this.theme.edgeLine;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = this.theme.edgeText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pos.x, pos.y);

    ctx.restore();
  }
}
