/**
 * Core type definitions for FlexDiagram.
 * Follows the architecture specifications in docs/ARCHITECTURE.md.
 */

export type NodeShape = 'rectangle' | 'cylinder' | 'diamond' | 'cloud';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourceLocation;
  end: SourceLocation;
}

export interface ParseError {
  message: string;
  location: SourceRange;
  severity: 'error' | 'warning';
}

// ============================================================================
// 1. AST Model (Abstract Syntax Tree emitted by Parser)
// ============================================================================

export interface DiagramNode {
  readonly id: string;
  readonly name: string;
  readonly shape: NodeShape;
  readonly location?: SourceRange;
}

export type EdgeStyle = 'solid' | 'dashed' | 'dotted';

export interface DiagramEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly label?: string;
  readonly style?: EdgeStyle;
  readonly location?: SourceRange;
}

export interface AST {
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
  readonly errors: readonly ParseError[];
}

export type ASTNode = DiagramNode;
export type ASTEdge = DiagramEdge;
export type DiagramAST = AST;

// ============================================================================
// 2. Reconciler and Layout Graph Models
// ============================================================================

export interface NodeState {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly shape: NodeShape;
  x: number;
  y: number;
  width: number;
  height: number;
  pinned: boolean;
  isNew: boolean;
}

export interface EdgeWaypoint extends Point {
  readonly isControlPoint?: boolean;
}

export interface EdgeRoute {
  readonly edgeId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly label?: string;
  readonly style?: EdgeStyle;
  readonly waypoints: readonly EdgeWaypoint[];
  readonly labelPosition?: Point;
}

export interface SceneGraph {
  readonly nodes: readonly NodeState[];
  readonly edges: readonly EdgeRoute[];
  readonly boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

// ============================================================================
// 3. Layout Metadata & Viewport State
// ============================================================================

export interface NodeLayoutOverride {
  readonly x: number;
  readonly y: number;
  readonly pinned: boolean;
  readonly customColor?: string;
}

export interface ViewportState {
  panX: number;
  panY: number;
  zoom: number;
}

export interface LayoutMetadata {
  readonly version: 1;
  readonly nodes: Record<string, NodeLayoutOverride>;
  readonly viewport: ViewportState;
}

// ============================================================================
// 4. File Serialization Container (.diag File Model)
// ============================================================================

export interface DiagFile {
  readonly filePath?: string;
  readonly dslContent: string;
  readonly metadata: LayoutMetadata;
  readonly isDirty: boolean;
}
