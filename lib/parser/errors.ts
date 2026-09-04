import { ParseError, SourceRange } from '../types';

export function createParseError(
  message: string,
  location: SourceRange,
  severity: 'error' | 'warning' = 'error',
): ParseError {
  return {
    message,
    location,
    severity,
  };
}

export function formatDiagnostic(error: ParseError): string {
  const { line, column } = error.location.start;
  const prefix = error.severity === 'error' ? 'Error' : 'Warning';
  return `[${prefix}] at line ${line}, col ${column}: ${error.message}`;
}
