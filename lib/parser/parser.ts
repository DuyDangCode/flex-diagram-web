import { AST, DiagramEdge, DiagramNode, NodeShape, ParseError } from '../types';
import { generateStableId } from '../reconciler/stable_id';
import { Lexer, Token, TokenType } from './lexer';
import { createParseError } from './errors';

export class Parser {
  private tokens: Token[] = [];
  private current = 0;
  private readonly errors: ParseError[] = [];
  private readonly nodesMap = new Map<string, DiagramNode>();
  private readonly edges: DiagramEdge[] = [];
  private edgeCounter = new Map<string, number>();

  public parse(source: string): AST {
    this.tokens = [];
    this.current = 0;
    this.errors.length = 0;
    this.nodesMap.clear();
    this.edges.length = 0;
    this.edgeCounter.clear();

    const lexer = new Lexer(source);
    this.tokens = lexer.tokenize();

    // Ingest lexer errors
    for (const lexErr of lexer.getErrors()) {
      this.errors.push(createParseError(lexErr.message, lexErr.location, 'error'));
    }

    while (!this.isAtEnd()) {
      this.skipNewlinesAndComments();
      if (this.isAtEnd()) break;

      this.parseStatement();
    }

    return {
      nodes: Array.from(this.nodesMap.values()),
      edges: [...this.edges],
      errors: [...this.errors],
    };
  }

  private parseStatement(): void {
    const nodeToken = this.peek();

    if (!this.isNodeToken(nodeToken.type)) {
      // Encountered unexpected token at start of statement
      this.errors.push(
        createParseError(
          `Unexpected token '${nodeToken.value}'. Expected node declaration such as [Node] or (Database).`,
          nodeToken.location,
        ),
      );
      this.synchronize();
      return;
    }

    let prevNode = this.parseNode();
    if (!prevNode) {
      this.synchronize();
      return;
    }

    // Now check if an arrow follows
    while (
      this.match(
        TokenType.ARROW,
        TokenType.DOTTED_ARROW,
        TokenType.BI_ARROW,
        TokenType.BI_DOTTED_ARROW,
        TokenType.LINE,
        TokenType.DOTTED_LINE,
      )
    ) {
      const arrowToken = this.previous();
      let edgeStyle: 'solid' | 'dashed' | 'dotted' = 'solid';
      if (
        arrowToken.type === TokenType.DOTTED_ARROW ||
        arrowToken.type === TokenType.BI_DOTTED_ARROW ||
        arrowToken.type === TokenType.DOTTED_LINE
      ) {
        edgeStyle = 'dotted';
      }

      // Check next node
      const nextNodeToken = this.peek();
      if (!this.isNodeToken(nextNodeToken.type)) {
        this.errors.push(
          createParseError(
            `Expected target node after '${arrowToken.value}', but found '${nextNodeToken.value || 'end of line'}'.`,
            nextNodeToken.location,
          ),
        );
        this.synchronize();
        return;
      }

      const targetNode = this.parseNode();
      if (!targetNode) {
        this.synchronize();
        return;
      }

      // Check for optional edge label: ': label'
      let label: string | undefined;
      if (this.match(TokenType.COLON)) {
        label = this.parseEdgeLabel();
      }

      // Create edge
      const baseEdgeId = `${prevNode.id}->${targetNode.id}`;
      const count = (this.edgeCounter.get(baseEdgeId) || 0) + 1;
      this.edgeCounter.set(baseEdgeId, count);
      const edgeId = count === 1 ? baseEdgeId : `${baseEdgeId}#${count}`;

      this.edges.push({
        id: edgeId,
        sourceId: prevNode.id,
        targetId: targetNode.id,
        label,
        style: edgeStyle,
        location: {
          start: arrowToken.location.start,
          end: targetNode.location?.end ?? arrowToken.location.end,
        },
      });

      prevNode = targetNode;
    }

    // Check optional label if someone wrote [Node] : Label (treat as warning or label)
    if (this.match(TokenType.COLON)) {
      this.parseEdgeLabel();
    }

    // Statement must end with a NEWLINE, EOF, or COMMENT
    if (!this.isAtEnd() && !this.check(TokenType.NEWLINE) && !this.check(TokenType.COMMENT)) {
      const unexp = this.peek();
      this.errors.push(
        createParseError(
          `Unexpected trailing token '${unexp.value}'. Expected newline or arrow.`,
          unexp.location,
        ),
      );
      this.synchronize();
    } else {
      this.skipNewlinesAndComments();
    }
  }

  private parseNode(): DiagramNode | null {
    const token = this.advance();
    let shape: NodeShape = 'rectangle';
    if (token.type === TokenType.LPAREN) {
      shape = 'cylinder';
    } else if (token.type === TokenType.LANGLE) {
      shape = 'diamond';
    }

    const name = token.value;
    if (!name || name.trim().length === 0) {
      this.errors.push(
        createParseError('Node name cannot be empty', token.location, 'error'),
      );
      return null;
    }

    const id = generateStableId(name);
    const existing = this.nodesMap.get(id);

    if (existing) {
      // If previously declared as default rectangle, but now declared with explicit shape, upgrade shape
      if (existing.shape === 'rectangle' && shape !== 'rectangle') {
        const updatedNode: DiagramNode = {
          ...existing,
          shape,
        };
        this.nodesMap.set(id, updatedNode);
        return updatedNode;
      }
      return existing;
    }

    const newNode: DiagramNode = {
      id,
      name,
      shape,
      location: token.location,
    };
    this.nodesMap.set(id, newNode);
    return newNode;
  }

  private parseEdgeLabel(): string {
    let label = '';
    // Consume tokens on this line until NEWLINE, COMMENT, or EOF
    while (!this.isAtEnd() && !this.check(TokenType.NEWLINE) && !this.check(TokenType.COMMENT)) {
      const tok = this.advance();
      if (label.length > 0) {
        label += ' ';
      }
      label += tok.value;
    }
    return label.trim();
  }

  private isNodeToken(type: TokenType): boolean {
    return (
      type === TokenType.LBRACKET ||
      type === TokenType.LPAREN ||
      type === TokenType.LANGLE
    );
  }

  private skipNewlinesAndComments(): void {
    while (!this.isAtEnd()) {
      if (this.peek().type === TokenType.NEWLINE || this.peek().type === TokenType.COMMENT) {
        this.advance();
      } else {
        break;
      }
    }
  }

  private synchronize(): void {
    while (!this.isAtEnd()) {
      if (this.peek().type === TokenType.NEWLINE) {
        this.advance();
        return;
      }
      this.advance();
    }
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current] || {
      type: TokenType.EOF,
      value: '',
      location: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    };
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }
}

export function parseDSL(source: string): AST {
  const parser = new Parser();
  return parser.parse(source);
}
