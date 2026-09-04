import { AST, DiagramEdge, DiagramNode, ParseError } from '../types';

export function createEmptyAST(): AST {
  return {
    nodes: [],
    edges: [],
    errors: [],
  };
}

export function createAST(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  errors: readonly ParseError[],
): AST {
  return {
    nodes,
    edges,
    errors,
  };
}
