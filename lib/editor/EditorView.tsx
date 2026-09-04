import React, { useRef, useMemo } from 'react';
import { ParseError } from '../types';

export interface EditorViewProps {
  value: string;
  onChange: (value: string) => void;
  errors?: readonly ParseError[];
}

export const EditorView: React.FC<EditorViewProps> = ({ value, onChange, errors = [] }) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const errorLineMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const err of errors) {
      map.set(err.location.start.line, err.message);
    }
    return map;
  }, [errors]);

  const lines = useMemo(() => {
    return value.split('\n');
  }, [value]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const gutter = e.currentTarget.previousElementSibling;
    if (gutter) {
      gutter.scrollTop = e.currentTarget.scrollTop;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Line Numbers & Error Gutter */}
        <div
          style={{
            width: 44,
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-color)',
            userSelect: 'none',
            paddingTop: 16,
            paddingBottom: 16,
            textAlign: 'right',
            paddingRight: 10,
            fontSize: 13,
            lineHeight: 1.6,
            fontFamily: 'monospace',
            color: '#64748b',
            overflowY: 'hidden',
          }}
        >
          {lines.map((_, i) => {
            const lineNum = i + 1;
            const hasError = errorLineMap.has(lineNum);
            return (
              <div
                key={lineNum}
                style={{
                  height: '1.6em',
                  color: hasError ? '#ef4444' : undefined,
                  fontWeight: hasError ? 'bold' : 'normal',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 3,
                }}
                title={hasError ? errorLineMap.get(lineNum) : undefined}
              >
                {hasError && <span style={{ color: '#ef4444', fontSize: 10 }}>●</span>}
                <span>{lineNum}</span>
              </div>
            );
          })}
        </div>

        {/* Textarea Input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          spellCheck={false}
          style={{
            flex: 1,
            height: '100%',
            padding: 16,
            background: 'transparent',
            color: 'var(--text-primary)',
            border: 'none',
            outline: 'none',
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
            fontSize: 13,
            lineHeight: 1.6,
            resize: 'none',
            whiteSpace: 'pre',
            tabSize: 2,
          }}
          placeholder="Write diagram syntax here..."
        />
      </div>

      {/* Diagnostics Bar */}
      {errors.length > 0 && (
        <div
          style={{
            background: '#3e1313',
            borderTop: '1px solid #7f1d1d',
            color: '#fca5a5',
            padding: '8px 14px',
            fontSize: 12,
            maxHeight: 100,
            overflowY: 'auto',
          }}
        >
          <strong>Syntax Diagnostics:</strong>
          {errors.map((err, i) => (
            <div key={i} style={{ marginTop: 2 }}>
              Line {err.location.start.line}, Col {err.location.start.column}: {err.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
