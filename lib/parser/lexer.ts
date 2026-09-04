import { SourceLocation, SourceRange } from '../types';

export enum TokenType {
  LBRACKET = 'LBRACKET', // [
  RBRACKET = 'RBRACKET', // ]
  LPAREN = 'LPAREN', // (
  RPAREN = 'RPAREN', // )
  LANGLE = 'LANGLE', // <
  RANGLE = 'RANGLE', // >
  ARROW = 'ARROW', // -> or -->
  DOTTED_ARROW = 'DOTTED_ARROW', // ..> or -.->
  BI_ARROW = 'BI_ARROW', // <-> or <-->
  BI_DOTTED_ARROW = 'BI_DOTTED_ARROW', // <..>
  LINE = 'LINE', // ---
  DOTTED_LINE = 'DOTTED_LINE', // ...
  COLON = 'COLON', // :
  TEXT = 'TEXT', // text content inside brackets or label
  COMMENT = 'COMMENT', // // or /* */ or ' or directives
  NEWLINE = 'NEWLINE', // \n or \r\n
  EOF = 'EOF',
  ILLEGAL = 'ILLEGAL',
}

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly location: SourceRange;
}

export interface LexerError {
  readonly message: string;
  readonly location: SourceRange;
}

export class Lexer {
  private readonly source: string;
  private offset = 0;
  private line = 1;
  private column = 1;
  private readonly errors: LexerError[] = [];

  constructor(source: string) {
    this.source = source;
  }

  public getErrors(): readonly LexerError[] {
    return this.errors;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    while (!this.isAtEnd()) {
      const token = this.nextToken();
      if (token) {
        tokens.push(token);
      }
    }

    const loc = this.currentLocation();
    tokens.push({
      type: TokenType.EOF,
      value: '',
      location: { start: loc, end: loc },
    });

    return tokens;
  }

  private nextToken(): Token | null {
    this.skipWhitespaceExceptNewline();

    if (this.isAtEnd()) {
      return null;
    }

    const startLoc = this.currentLocation();
    const ch = this.peek();

    // Check for newlines
    if (ch === '\n') {
      this.advance();
      return {
        type: TokenType.NEWLINE,
        value: '\n',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }
    if (ch === '\r') {
      this.advance();
      if (this.peek() === '\n') {
        this.advance();
      }
      return {
        type: TokenType.NEWLINE,
        value: '\n',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Single-line or multi-line comment (C/JS style)
    if (ch === '/' && this.peekNext() === '/') {
      return this.consumeSingleLineComment(startLoc);
    }
    if (ch === '/' && this.peekNext() === '*') {
      return this.consumeMultiLineComment(startLoc);
    }

    // PlantUML single-line comment: '
    if (ch === '\'') {
      return this.consumeSingleLineComment(startLoc);
    }

    // Directives: @startuml, @enduml, !theme, !include, etc.
    if (ch === '@' || ch === '!') {
      return this.consumeSingleLineComment(startLoc);
    }

    // PlantUML / diagram header directives: skinparam, title, footer, header
    if (
      this.matchKeywordIgnoreCase('skinparam') ||
      this.matchKeywordIgnoreCase('title') ||
      this.matchKeywordIgnoreCase('footer') ||
      this.matchKeywordIgnoreCase('header')
    ) {
      return this.consumeSingleLineComment(startLoc);
    }

    // Node brackets and delimiters
    if (ch === '[') {
      return this.consumeEnclosed(startLoc, '[', ']');
    }
    if (ch === '(') {
      return this.consumeEnclosed(startLoc, '(', ')');
    }

    // Bidirectional dotted arrow: <..>
    if (ch === '<' && this.peekNext() === '.' && this.peekAt(2) === '.' && this.peekAt(3) === '>') {
      this.advance();
      this.advance();
      this.advance();
      this.advance();
      return {
        type: TokenType.BI_DOTTED_ARROW,
        value: '<..>',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Bidirectional long solid arrow: <-->
    if (ch === '<' && this.peekNext() === '-' && this.peekAt(2) === '-' && this.peekAt(3) === '>') {
      this.advance();
      this.advance();
      this.advance();
      this.advance();
      return {
        type: TokenType.BI_ARROW,
        value: '<-->',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Bidirectional solid arrow: <->
    if (ch === '<' && this.peekNext() === '-' && this.peekAt(2) === '>') {
      this.advance(); // <
      this.advance(); // -
      this.advance(); // >
      return {
        type: TokenType.BI_ARROW,
        value: '<->',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }
    if (ch === '<') {
      return this.consumeEnclosed(startLoc, '<', '>');
    }

    // Dotted arrow: ..>
    if (ch === '.' && this.peekNext() === '.' && this.peekAt(2) === '>') {
      this.advance();
      this.advance();
      this.advance();
      return {
        type: TokenType.DOTTED_ARROW,
        value: '..>',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Dashed arrow: -.->
    if (ch === '-' && this.peekNext() === '.' && this.peekAt(2) === '-' && this.peekAt(3) === '>') {
      this.advance();
      this.advance();
      this.advance();
      this.advance();
      return {
        type: TokenType.DOTTED_ARROW,
        value: '-.->',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Dotted line: ...
    if (ch === '.' && this.peekNext() === '.' && this.peekAt(2) === '.') {
      this.advance();
      this.advance();
      this.advance();
      return {
        type: TokenType.DOTTED_LINE,
        value: '...',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Long solid arrow: -->
    if (ch === '-' && this.peekNext() === '-' && this.peekAt(2) === '>') {
      this.advance();
      this.advance();
      this.advance();
      return {
        type: TokenType.ARROW,
        value: '-->',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Directed arrow: ->
    if (ch === '-' && this.peekNext() === '>') {
      this.advance();
      this.advance();
      return {
        type: TokenType.ARROW,
        value: '->',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Undirected line: ---
    if (ch === '-' && this.peekNext() === '-' && this.peekAt(2) === '-') {
      this.advance();
      this.advance();
      this.advance();
      return {
        type: TokenType.LINE,
        value: '---',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Label colon: :
    if (ch === ':') {
      this.advance();
      return {
        type: TokenType.COLON,
        value: ':',
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    // Unenclosed text (such as edge label or identifier)
    return this.consumeText(startLoc);
  }

  private consumeEnclosed(
    startLoc: SourceLocation,
    openChar: string,
    closeChar: string,
  ): Token {
    this.advance(); // consume openChar
    let text = '';

    while (!this.isAtEnd() && this.peek() !== closeChar && this.peek() !== '\n' && this.peek() !== '\r') {
      if (this.peek() === '\\' && this.peekNext() === closeChar) {
        this.advance(); // skip escape
      }
      text += this.advance();
    }

    if (this.peek() === closeChar) {
      this.advance(); // consume closeChar
    } else {
      this.errors.push({
        message: `Unterminated shape: missing closing '${closeChar}'`,
        location: { start: startLoc, end: this.currentLocation() },
      });
    }

    const value = text.trim();
    return {
      type: openChar === '[' ? TokenType.LBRACKET : openChar === '(' ? TokenType.LPAREN : TokenType.LANGLE,
      value,
      location: { start: startLoc, end: this.currentLocation() },
    };
  }

  private consumeSingleLineComment(startLoc: SourceLocation): Token {
    this.advance(); // /
    this.advance(); // /
    let comment = '';
    while (!this.isAtEnd() && this.peek() !== '\n' && this.peek() !== '\r') {
      comment += this.advance();
    }
    return {
      type: TokenType.COMMENT,
      value: comment,
      location: { start: startLoc, end: this.currentLocation() },
    };
  }

  private consumeMultiLineComment(startLoc: SourceLocation): Token {
    this.advance(); // /
    this.advance(); // *
    let comment = '';
    let closed = false;

    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance();
        this.advance();
        closed = true;
        break;
      }
      comment += this.advance();
    }

    if (!closed) {
      this.errors.push({
        message: 'Unterminated multi-line comment: missing */',
        location: { start: startLoc, end: this.currentLocation() },
      });
    }

    return {
      type: TokenType.COMMENT,
      value: comment,
      location: { start: startLoc, end: this.currentLocation() },
    };
  }

  private matchKeywordIgnoreCase(keyword: string): boolean {
    const len = keyword.length;
    if (this.offset + len > this.source.length) return false;
    const sub = this.source.substring(this.offset, this.offset + len);
    if (sub.toLowerCase() === keyword.toLowerCase()) {
      const nextCh = this.source[this.offset + len];
      if (!nextCh || /\s/.test(nextCh) || nextCh === ':' || nextCh === ';') {
        return true;
      }
    }
    return false;
  }

  private consumeText(startLoc: SourceLocation): Token {
    let text = '';
    while (
      !this.isAtEnd() &&
      this.peek() !== '\n' &&
      this.peek() !== '\r' &&
      this.peek() !== '[' &&
      this.peek() !== '(' &&
      this.peek() !== '<' &&
      this.peek() !== ':' &&
      this.peek() !== '\'' &&
      this.peek() !== '@' &&
      this.peek() !== '!' &&
      !(this.peek() === '-' && (this.peekNext() === '>' || this.peekNext() === '-')) &&
      !(this.peek() === '.' && this.peekNext() === '.') &&
      !(this.peek() === '/' && (this.peekNext() === '/' || this.peekNext() === '*'))
    ) {
      text += this.advance();
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      // Single unexpected character
      const unexp = this.advance();
      return {
        type: TokenType.ILLEGAL,
        value: unexp,
        location: { start: startLoc, end: this.currentLocation() },
      };
    }

    return {
      type: TokenType.TEXT,
      value: trimmed,
      location: { start: startLoc, end: this.currentLocation() },
    };
  }

  private skipWhitespaceExceptNewline(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t') {
        this.advance();
      } else {
        break;
      }
    }
  }

  private currentLocation(): SourceLocation {
    return {
      line: this.line,
      column: this.column,
      offset: this.offset,
    };
  }

  private isAtEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private peek(): string {
    return this.source[this.offset] ?? '';
  }

  private peekNext(): string {
    return this.source[this.offset + 1] ?? '';
  }

  private peekAt(n: number): string {
    return this.source[this.offset + n] ?? '';
  }

  private advance(): string {
    const ch = this.source[this.offset++];
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }
}
