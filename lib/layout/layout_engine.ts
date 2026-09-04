import dagre from '@dagrejs/dagre';
import { AST, EdgeRoute, LayoutMetadata, NodeShape, NodeState, SceneGraph } from '../types';
import { reconcileState } from '../reconciler/reconciler';
import { routeOrthogonalEdge } from './orthogonal_router';

export interface LayoutOptions {
  rankDir?: 'TB' | 'LR' | 'BT' | 'RL';
  nodeSep?: number;
  rankSep?: number;
}

export function calculateNodeDimensions(name: string, shape: NodeShape): { width: number; height: number } {
  // Approximate text width: 8.5px per character + 36px padding
  const textWidth = Math.ceil(name.length * 8.5) + 36;
  const width = Math.max(120, textWidth);
  const height = shape === 'cylinder' ? 70 : 60;
  return { width, height };
}

export function computeLayout(
  ast: AST,
  metadata?: LayoutMetadata,
  options: LayoutOptions = {},
): SceneGraph {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: options.rankDir ?? 'TB',
    nodesep: options.nodeSep ?? 60,
    ranksep: options.rankSep ?? 60,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of ast.nodes) {
    const dims = calculateNodeDimensions(node.name, node.shape);
    g.setNode(node.id, {
      label: node.name,
      width: dims.width,
      height: dims.height,
    });
  }

  for (const edge of ast.edges) {
    if (g.hasNode(edge.sourceId) && g.hasNode(edge.targetId)) {
      g.setEdge(edge.sourceId, edge.targetId);
    }
  }

  // Run initial Dagre layout computation
  dagre.layout(g);

  // Collect dagre computed positions
  const dagrePositions = new Map<string, { x: number; y: number }>();
  for (const node of ast.nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      dagrePositions.set(node.id, { x: dagreNode.x, y: dagreNode.y });
    }
  }

  // Use State Reconciler to resolve pinned nodes, renames, and free space for new nodes
  const defaultMeta: LayoutMetadata = metadata || {
    version: 1,
    nodes: {},
    viewport: { panX: 50, panY: 50, zoom: 1 },
  };

  const reconciliation = reconcileState(ast, defaultMeta, dagrePositions);
  const resolvedNodes: NodeState[] = reconciliation.nodes.map((rn) => ({
    id: rn.id,
    name: rn.name,
    label: rn.name,
    shape: rn.shape,
    x: rn.x,
    y: rn.y,
    width: rn.width,
    height: rn.height,
    pinned: rn.pinned,
    isNew: rn.status === 'newly_created',
  }));

  // Node lookup for edge routing
  const nodeMap = new Map<string, NodeState>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of resolvedNodes) {
    nodeMap.set(n.id, n);
    const halfW = n.width / 2;
    const halfH = n.height / 2;
    minX = Math.min(minX, n.x - halfW);
    minY = Math.min(minY, n.y - halfH);
    maxX = Math.max(maxX, n.x + halfW);
    maxY = Math.max(maxY, n.y + halfH);
  }

  // Edge lane tracking for parallel edges
  const pairCounts = new Map<string, number>();
  const resolvedEdges: EdgeRoute[] = [];

  for (const edge of ast.edges) {
    const sourceNode = nodeMap.get(edge.sourceId);
    const targetNode = nodeMap.get(edge.targetId);

    if (!sourceNode || !targetNode) continue;

    // Normal pair key to track parallel / bidirectional edges
    const pairKey = [edge.sourceId, edge.targetId].sort().join('::');
    const existingIndex = pairCounts.get(pairKey) || 0;
    pairCounts.set(pairKey, existingIndex + 1);

    // Alternate lane offset: 0, 14, -14, 28, -28...
    const laneOffset = existingIndex === 0
      ? 0
      : (existingIndex % 2 === 1 ? 1 : -1) * Math.ceil(existingIndex / 2) * 14;

    const routedEdge = routeOrthogonalEdge(
      edge.id,
      sourceNode,
      targetNode,
      resolvedNodes,
      edge.label,
      laneOffset,
      edge.style ?? 'solid',
    );

    resolvedEdges.push(routedEdge);
  }

  if (resolvedNodes.length === 0) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  return {
    nodes: resolvedNodes,
    edges: resolvedEdges,
    boundingBox: { minX, minY, maxX, maxY },
  };
}
