import { AST, LayoutMetadata, NodeShape } from '../types';
import { calculateNodeDimensions } from '../layout/layout_engine';

export type NodeReconciliationStatus =
  | 'retained_pinned'
  | 'retained_unpinned'
  | 'newly_created'
  | 'renamed';

export interface ReconciledNode {
  readonly id: string;
  readonly name: string;
  readonly shape: NodeShape;
  readonly status: NodeReconciliationStatus;
  readonly previousId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pinned: boolean;
}

export interface ReconcilerResult {
  readonly nodes: readonly ReconciledNode[];
  readonly prunedNodeIds: readonly string[];
  readonly updatedMetadata: LayoutMetadata;
}

/**
 * Reconciles incoming AST nodes with stored LayoutMetadata:
 * 1. Preserves exact coordinates for pinned nodes.
 * 2. Prunes orphaned node records no longer in the AST.
 * 3. Heuristically detects renames between deleted and new nodes.
 * 4. Places newly declared nodes into open free space adjacent to neighbors.
 */
export function reconcileState(
  ast: AST,
  currentMetadata: LayoutMetadata,
  dagrePositions?: Map<string, { x: number; y: number }>,
): ReconcilerResult {
  const metadataNodes = currentMetadata.nodes;
  const astNodeIds = new Set(ast.nodes.map((n) => n.id));
  const metadataNodeIds = Object.keys(metadataNodes);

  // Identify deleted (orphaned) node IDs
  const deletedNodeIds = metadataNodeIds.filter((id) => !astNodeIds.has(id));
  const prunedNodeIds: string[] = [];

  // Identify candidate new nodes
  const newNodes = ast.nodes.filter((n) => !metadataNodes[n.id]);

  // Rename Detection Heuristic:
  // Map newly introduced nodes to deleted metadata entries if names are very similar
  const renameMap = new Map<string, string>(); // newId -> oldId
  const remainingDeletedIds = new Set(deletedNodeIds);

  for (const newNode of newNodes) {
    let bestMatchId: string | null = null;
    let highestSim = 0.55; // Threshold

    for (const oldId of remainingDeletedIds) {
      const sim = calculateSimilarity(newNode.id, oldId);
      if (sim > highestSim) {
        highestSim = sim;
        bestMatchId = oldId;
      }
    }

    if (bestMatchId) {
      renameMap.set(newNode.id, bestMatchId);
      remainingDeletedIds.delete(bestMatchId);
    }
  }

  // Any remaining deleted node IDs are officially pruned
  for (const oldId of remainingDeletedIds) {
    prunedNodeIds.push(oldId);
  }

  const reconciledNodes: ReconciledNode[] = [];
  const updatedNodesMetadata = { ...metadataNodes };

  // Remove pruned IDs from metadata
  for (const oldId of prunedNodeIds) {
    delete updatedNodesMetadata[oldId];
  }

  // Build connection graph for neighbor-based placement
  const neighborsMap = new Map<string, Set<string>>();
  for (const edge of ast.edges) {
    if (!neighborsMap.has(edge.sourceId)) neighborsMap.set(edge.sourceId, new Set());
    if (!neighborsMap.has(edge.targetId)) neighborsMap.set(edge.targetId, new Set());
    neighborsMap.get(edge.sourceId)!.add(edge.targetId);
    neighborsMap.get(edge.targetId)!.add(edge.sourceId);
  }

  // Process existing & renamed nodes first to establish occupied bounding boxes
  const occupiedBoxes: { x: number; y: number; width: number; height: number }[] = [];

  for (const astNode of ast.nodes) {
    const dims = calculateNodeDimensions(astNode.name, astNode.shape);
    const renamedFrom = renameMap.get(astNode.id);
    const metaRecord = renamedFrom ? metadataNodes[renamedFrom] : metadataNodes[astNode.id];

    if (metaRecord) {
      // Existing or Renamed node
      const status: NodeReconciliationStatus = renamedFrom
        ? 'renamed'
        : metaRecord.pinned
          ? 'retained_pinned'
          : 'retained_unpinned';

      const x = metaRecord.x;
      const y = metaRecord.y;
      const pinned = metaRecord.pinned;

      reconciledNodes.push({
        id: astNode.id,
        name: astNode.name,
        shape: astNode.shape,
        status,
        previousId: renamedFrom,
        x,
        y,
        width: dims.width,
        height: dims.height,
        pinned,
      });

      occupiedBoxes.push({ x, y, width: dims.width, height: dims.height });

      // If renamed, update metadata with the new key and delete old key
      if (renamedFrom) {
        updatedNodesMetadata[astNode.id] = { ...metaRecord };
        delete updatedNodesMetadata[renamedFrom];
      }
    }
  }

  // Now process truly new nodes
  for (const astNode of ast.nodes) {
    if (reconciledNodes.some((rn) => rn.id === astNode.id)) continue;

    const dims = calculateNodeDimensions(astNode.name, astNode.shape);
    const dagrePos = dagrePositions?.get(astNode.id);

    let placedPos: { x: number; y: number };

    if (dagrePos && !collidesWithAny(dagrePos.x, dagrePos.y, dims.width, dims.height, occupiedBoxes)) {
      // Dagre position is collision-free
      placedPos = dagrePos;
    } else {
      // Find free space adjacent to connected neighbor, or in open canvas space
      const connectedNeighbors = Array.from(neighborsMap.get(astNode.id) || []);
      const placedNeighbor = reconciledNodes.find((rn) => connectedNeighbors.includes(rn.id));

      if (placedNeighbor) {
        placedPos = findFreeSpaceNear(placedNeighbor, dims, occupiedBoxes);
      } else {
        placedPos = findFreeSpaceGrid(dims, occupiedBoxes);
      }
    }

    reconciledNodes.push({
      id: astNode.id,
      name: astNode.name,
      shape: astNode.shape,
      status: 'newly_created',
      x: placedPos.x,
      y: placedPos.y,
      width: dims.width,
      height: dims.height,
      pinned: false,
    });

    occupiedBoxes.push({
      x: placedPos.x,
      y: placedPos.y,
      width: dims.width,
      height: dims.height,
    });
  }

  return {
    nodes: reconciledNodes,
    prunedNodeIds,
    updatedMetadata: {
      ...currentMetadata,
      nodes: updatedNodesMetadata,
    },
  };
}

/**
 * Checks if a proposed node position collides with any already placed node
 * within a margin threshold.
 */
function collidesWithAny(
  x: number,
  y: number,
  w: number,
  h: number,
  occupied: { x: number; y: number; width: number; height: number }[],
  margin = 35,
): boolean {
  for (const box of occupied) {
    const overlapX = Math.abs(x - box.x) < (w + box.width) / 2 + margin;
    const overlapY = Math.abs(y - box.y) < (h + box.height) / 2 + margin;
    if (overlapX && overlapY) return true;
  }
  return false;
}

/**
 * Finds free space near a neighbor node in directional steps.
 */
function findFreeSpaceNear(
  neighbor: { x: number; y: number; width: number; height: number },
  dims: { width: number; height: number },
  occupied: { x: number; y: number; width: number; height: number }[],
): { x: number; y: number } {
  const stepX = (neighbor.width + dims.width) / 2 + 50;
  const stepY = (neighbor.height + dims.height) / 2 + 50;

  // Candidate offsets in priority: Right, Bottom, Left, Top, Diagonals
  const candidates = [
    { x: neighbor.x + stepX, y: neighbor.y },
    { x: neighbor.x, y: neighbor.y + stepY },
    { x: neighbor.x - stepX, y: neighbor.y },
    { x: neighbor.x, y: neighbor.y - stepY },
    { x: neighbor.x + stepX, y: neighbor.y + stepY },
    { x: neighbor.x - stepX, y: neighbor.y + stepY },
    { x: neighbor.x + stepX, y: neighbor.y - stepY },
    { x: neighbor.x - stepX, y: neighbor.y - stepY },
  ];

  for (const cand of candidates) {
    if (!collidesWithAny(cand.x, cand.y, dims.width, dims.height, occupied)) {
      return cand;
    }
  }

  // Fallback to searching grid space further out
  return findFreeSpaceGrid(dims, occupied);
}

/**
 * Finds open space on an absolute coordinate grid starting from (100, 100).
 */
function findFreeSpaceGrid(
  dims: { width: number; height: number },
  occupied: { x: number; y: number; width: number; height: number }[],
): { x: number; y: number } {
  const startX = 100;
  const startY = 100;
  const gridStepX = 180;
  const gridStepY = 120;

  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 10; c++) {
      const candidateX = startX + c * gridStepX;
      const candidateY = startY + r * gridStepY;
      if (!collidesWithAny(candidateX, candidateY, dims.width, dims.height, occupied)) {
        return { x: candidateX, y: candidateY };
      }
    }
  }

  return { x: startX + 500, y: startY + 500 };
}

/**
 * Computes simple Bigram similarity between two string identifiers (0 to 1).
 */
function calculateSimilarity(strA: string, strB: string): number {
  if (strA === strB) return 1.0;
  if (!strA || !strB) return 0.0;

  const a = strA.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = strB.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (a === b) return 1.0;

  if (a.length < 2 || b.length < 2) {
    return a.includes(b) || b.includes(a) ? 0.7 : 0.0;
  }

  const getBigrams = (s: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.slice(i, i + 2));
    }
    return bigrams;
  };

  const bgA = getBigrams(a);
  const bgB = getBigrams(b);
  let intersection = 0;

  for (const bg of bgA) {
    if (bgB.has(bg)) intersection++;
  }

  return (2.0 * intersection) / (bgA.size + bgB.size);
}
