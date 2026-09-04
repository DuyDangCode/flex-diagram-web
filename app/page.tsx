'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { parseDSL } from '@/lib/parser';
import { computeLayout } from '@/lib/layout';
import { CanvasView, MovedNode } from '@/lib/canvas';
import { EditorView } from '@/lib/editor';
import { serializeDiag, deserializeDiag } from '@/lib/serializer';
import { exportToSvg, exportToPngDataUrl, exportToPdf, triggerDownload } from '@/lib/export';
import { HistoryManager } from '@/lib/history';
import { LayoutMetadata, SceneGraph, ViewportState } from '@/lib/types';

interface TemplateOption {
  name: string;
  description: string;
  dsl: string;
}

const TEMPLATES: TemplateOption[] = [
  {
    name: 'Microservices Flow',
    description: 'Cloudflare CDN, API Gateway, Auth, Orders, and Databases',
    dsl: `// Microservices Architecture
[Client App] -> [Cloudflare CDN] : HTTPS / WAF
[Cloudflare CDN] -> [API Gateway] : Reverse Proxy
[API Gateway] -> [Auth Service] : JWT Validation
[API Gateway] -> [Order Service] : Create Order (gRPC)
[Order Service] -> [Inventory Service] : Check Stock
[Order Service] -> (PostgreSQL Master DB) : SQL Write
[Order Service] ..> (PostgreSQL Read Replica) : Cache Miss (SQL Read)
[Order Service] -> (Redis Cache) : Session / Cache
[Order Service] -.-> [Notification Worker] : Event Stream
[Notification Worker] -> (Kafka Queue) : Async Job`,
  },
  {
    name: 'Kafka Stream Pipeline',
    description: 'IoT ingestion, Flink stream processing, TimescaleDB, and alerts',
    dsl: `// Kafka Stream & Real-time Analytics Pipeline
[IoT Sensor Fleet] -> [Edge Gateway] : MQTT Telemetry
[Edge Gateway] -> [Kafka Ingestion Cluster] : High-throughput Ingest
[Kafka Ingestion Cluster] -> [Stream Processor (Flink)] : Partitioned Stream
[Stream Processor (Flink)] -> (TimescaleDB Metrics) : Write Time Series
[Stream Processor (Flink)] -> [Anomaly Alerting Engine] : Real-time Triggers
[Anomaly Alerting Engine] -> [Ops Notification Svc] : Webhook / Alert
[Stream Processor (Flink)] -> (S3 Data Lake) : Parquet Batch Sink`,
  },
  {
    name: 'Logic Decision Flow',
    description: 'Branching logic, rate limiting, and decision nodes',
    dsl: `// Logic Decision & Routing Flow
[Inbound Traffic] -> [WAF & Rate Limiter] : HTTP Request
[WAF & Rate Limiter] -> <Rate Limit Exceeded?> : Evaluate Quota
<Rate Limit Exceeded?> -> [429 Too Many Requests] : Yes (Drop)
<Rate Limit Exceeded?> -> [API Gateway] : No (Proceed)
[API Gateway] -> <User Authenticated?> : Check Token
<User Authenticated?> -> [401 Unauthorized] : Invalid / Expired
<User Authenticated?> -> [Core Business Services] : Valid Session`,
  },
  {
    name: 'PlantUML Compatibility',
    description: 'PlantUML @startuml directives, skinparams, and dashed arrows',
    dsl: `@startuml
!theme plain
skinparam componentStyle rectangle

' --- 1. Edge & Reverse Proxy ---
[Web Client] -> [Cloudflare CDN] : HTTPS / WAF
[Cloudflare CDN] -> [API Gateway] : Reverse Proxy
[API Gateway] -> [OAuth2 Service] : JWT Verification

' --- 2. Microservices & Persistence ---
[API Gateway] -> [Order Service] : Create Order (gRPC)
[Order Service] -> [Redis Cluster] : Check Idempotency
[Order Service] -> (PostgreSQL Master DB) : SQL Write

' --- 3. Async Streams & Read Replicas ---
[Order Service] ..> (PostgreSQL Read Replica) : Cache Miss (SQL Read)
[API Gateway] -.-> [Notification Worker] : Event Stream
@enduml`,
  },
];

const DEFAULT_METADATA: LayoutMetadata = {
  version: 1,
  nodes: {},
  viewport: { panX: 60, panY: 60, zoom: 1 },
};

export default function FlexDiagramApp() {
  const [fileContent, setFileContent] = useState<string>(TEMPLATES[0].dsl);
  const [dslText, setDslText] = useState<string>(TEMPLATES[0].dsl);
  const [metadata, setMetadata] = useState<LayoutMetadata>(DEFAULT_METADATA);
  const [viewport, setViewport] = useState<ViewportState>({ panX: 60, panY: 60, zoom: 1 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(new Set());

  // UI state
  const [viewMode, setViewMode] = useState<'split' | 'code' | 'canvas'>('split');
  const [splitPercent, setSplitPercent] = useState<number>(40); // 40% editor, 60% canvas
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>(TEMPLATES[0].name);

  // Undo / Redo history
  const historyRef = useRef<HistoryManager>(new HistoryManager(50));
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  // Dragging divider state
  const isResizingRef = useRef<boolean>(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  // Hidden file input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Export menu container ref for outside click
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  // Debounce ref for editor changes
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update history button state helper
  const updateHistoryState = useCallback(() => {
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, []);

  // Compute AST from DSL
  const ast = useMemo(() => {
    return parseDSL(dslText);
  }, [dslText]);

  // Compute Scene Graph from AST + Metadata
  const scene = useMemo<SceneGraph>(() => {
    return computeLayout(ast, metadata);
  }, [ast, metadata]);

  // Refs to always access latest state in callbacks without recreating them
  const fileContentRef = useRef<string>(fileContent);
  const dslTextRef = useRef<string>(dslText);
  const metadataRef = useRef<LayoutMetadata>(metadata);
  const viewportRef = useRef<ViewportState>(viewport);

  useEffect(() => {
    fileContentRef.current = fileContent;
    dslTextRef.current = dslText;
    metadataRef.current = metadata;
    viewportRef.current = viewport;
  });

  // Push current state to history
  const pushHistory = useCallback(
    (content: string, vp: ViewportState) => {
      historyRef.current.push({ fileContent: content, viewport: vp });
      updateHistoryState();
    },
    [updateHistoryState],
  );

  // Handle Undo
  const handleUndo = useCallback(() => {
    const current = { fileContent: fileContentRef.current, viewport: viewportRef.current };
    const prev = historyRef.current.undo(current);
    if (!prev) return;

    const { dslContent: newDsl, metadata: newMeta } = deserializeDiag(prev.fileContent);
    setFileContent(prev.fileContent);
    setDslText(newDsl);
    setMetadata(newMeta);
    setViewport(prev.viewport);
    updateHistoryState();
  }, [updateHistoryState]);

  // Handle Redo
  const handleRedo = useCallback(() => {
    const current = { fileContent: fileContentRef.current, viewport: viewportRef.current };
    const next = historyRef.current.redo(current);
    if (!next) return;

    const { dslContent: newDsl, metadata: newMeta } = deserializeDiag(next.fileContent);
    setFileContent(next.fileContent);
    setDslText(newDsl);
    setMetadata(newMeta);
    setViewport(next.viewport);
    updateHistoryState();
  }, [updateHistoryState]);

  // Save / Download .diag file
  const handleSaveFile = useCallback(() => {
    const fullContent = serializeDiag(dslTextRef.current, {
      ...metadataRef.current,
      viewport: viewportRef.current,
    });
    const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'diagram.diag');
    URL.revokeObjectURL(url);
  }, []);

  // Synchronize document data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Handle outside clicks for export menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Handle keyboard shortcuts (Undo, Redo, Save, Open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isInput = targetTag === 'INPUT';

      if (isInput) return;

      const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        handleRedo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveFile();
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleSaveFile]);

  // Handle Code Editor text changes with debounce
  const handleEditorChange = useCallback(
    (newText: string) => {
      setFileContent(newText);
      const { dslContent: extractedDsl, metadata: extractedMeta } = deserializeDiag(newText);
      setDslText(extractedDsl);
      if (Object.keys(extractedMeta.nodes).length > 0) {
        setMetadata(extractedMeta);
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        pushHistory(newText, viewport);
      }, 300);
    },
    [viewport, pushHistory],
  );

  // Handle canvas node movement (Drag & Drop Pinning)
  const handleNodesMoved = useCallback(
    (movedNodes: MovedNode[]) => {
      if (movedNodes.length === 0) return;

      setMetadata((prevMeta) => {
        const nextNodes = { ...prevMeta.nodes };
        for (const mn of movedNodes) {
          nextNodes[mn.id] = {
            x: mn.x,
            y: mn.y,
            pinned: mn.pinned,
          };
        }

        const nextMetadata: LayoutMetadata = {
          ...prevMeta,
          nodes: nextNodes,
          viewport,
        };

        // Serialize back into the .diag file content (preserving DSL code at top)
        const newFileContent = serializeDiag(dslText, nextMetadata);
        setFileContent(newFileContent);
        pushHistory(newFileContent, viewport);

        return nextMetadata;
      });
    },
    [dslText, viewport, pushHistory],
  );

  // Handle Template Selection
  const handleSelectTemplate = useCallback(
    (templateName: string) => {
      const tmpl = TEMPLATES.find((t) => t.name === templateName);
      if (!tmpl) return;

      setSelectedTemplateName(templateName);
      const cleanMeta: LayoutMetadata = {
        version: 1,
        nodes: {},
        viewport: { panX: 60, panY: 60, zoom: 1 },
      };
      setFileContent(tmpl.dsl);
      setDslText(tmpl.dsl);
      setMetadata(cleanMeta);
      setViewport(cleanMeta.viewport);
      setSelectedNodeIds(new Set());
      pushHistory(tmpl.dsl, cleanMeta.viewport);
    },
    [pushHistory],
  );

  // Reset Layout / Unpin All Nodes
  const handleAutoLayout = useCallback(() => {
    const unpinnedMetadata: LayoutMetadata = {
      ...metadata,
      nodes: {}, // Clear all manual coordinates so Dagre recalculates natural layout
    };
    const newFileContent = serializeDiag(dslText, unpinnedMetadata);
    setMetadata(unpinnedMetadata);
    setFileContent(newFileContent);
    pushHistory(newFileContent, viewport);
  }, [dslText, metadata, viewport, pushHistory]);

  // Open file from local filesystem
  const handleOpenFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const { dslContent: loadedDsl, metadata: loadedMeta } = deserializeDiag(content);
        setFileContent(content);
        setDslText(loadedDsl);
        setMetadata(loadedMeta);
        if (loadedMeta.viewport) {
          setViewport(loadedMeta.viewport);
        }
        setSelectedNodeIds(new Set());
        pushHistory(content, loadedMeta.viewport || viewport);
      }
    };
    reader.readAsText(file);
    // Reset file input value so re-selecting same file fires change
    e.target.value = '';
  };


  // Export handlers
  const handleExportSvg = useCallback(() => {
    const svgStr = exportToSvg(scene, { theme, padding: 40 });
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'diagram.svg');
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [scene, theme]);

  const handleExportPng = useCallback(
    (scale: number, nameSuffix: string) => {
      try {
        const dataUrl = exportToPngDataUrl(scene, {
          scale,
          theme,
          showGrid,
          padding: 40,
        });
        triggerDownload(dataUrl, `diagram-${nameSuffix}.png`);
      } catch (err) {
        console.error('PNG Export failed:', err);
      }
      setShowExportMenu(false);
    },
    [scene, theme, showGrid],
  );

  const handleExportPdf = useCallback(() => {
    exportToPdf(scene, 'FlexDiagram Architecture');
    setShowExportMenu(false);
  }, [scene]);

  // Split Divider Dragging Handlers
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const newPercent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(20, newPercent)));
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Node stats summary
  const pinnedCount = useMemo(() => {
    return scene.nodes.filter((n) => n.pinned).length;
  }, [scene.nodes]);

  const hasDiagnostics = ast.errors.length > 0;

  return (
    <div className="app-container">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".diag,text/plain"
        style={{ display: 'none' }}
        onChange={handleOpenFile}
      />

      {/* Header Toolbar */}
      <header className="app-header">
        {/* Left: Branding & Tagline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="app-title">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                color: '#ffffff',
                borderRadius: 6,
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              F
            </span>
            <span>FlexDiagram</span>
          </div>
          <span className="app-subtitle">
            Code first, Shape later
          </span>

          <div
            style={{
              width: 1,
              height: 20,
              background: 'var(--border-color)',
              margin: '0 4px',
            }}
          />

          {/* Template Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Template:</span>
            <select
              value={selectedTemplateName}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 12,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {TEMPLATES.map((tmpl) => (
                <option key={tmpl.name} value={tmpl.name}>
                  {tmpl.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center: View Mode & History */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View Mode Switcher */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-tertiary)',
              borderRadius: 4,
              padding: 2,
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              onClick={() => setViewMode('code')}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 3,
                background: viewMode === 'code' ? 'var(--accent-primary)' : 'transparent',
                color: viewMode === 'code' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Code Only View"
            >
              [Code]
            </button>
            <button
              onClick={() => setViewMode('split')}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 3,
                background: viewMode === 'split' ? 'var(--accent-primary)' : 'transparent',
                color: viewMode === 'split' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Split Code & Canvas View"
            >
              [Split]
            </button>
            <button
              onClick={() => setViewMode('canvas')}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 3,
                background: viewMode === 'canvas' ? 'var(--accent-primary)' : 'transparent',
                color: viewMode === 'canvas' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Canvas Only View"
            >
              [Canvas]
            </button>
          </div>

          <div
            style={{
              width: 1,
              height: 20,
              background: 'var(--border-color)',
              margin: '0 2px',
            }}
          />

          {/* Undo / Redo */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                background: 'var(--bg-tertiary)',
                color: canUndo ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                cursor: canUndo ? 'pointer' : 'not-allowed',
                opacity: canUndo ? 1 : 0.5,
              }}
              title="Undo (Ctrl+Z)"
            >
              ↶ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                background: 'var(--bg-tertiary)',
                color: canRedo ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                cursor: canRedo ? 'pointer' : 'not-allowed',
                opacity: canRedo ? 1 : 0.5,
              }}
              title="Redo (Ctrl+Shift+Z)"
            >
              ↷ Redo
            </button>
          </div>

          {/* Auto Layout / Unpin All */}
          <button
            onClick={handleAutoLayout}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            title="Clear all manual pins and re-run Dagre auto-layout"
          >
            ⚡ Auto Layout
          </button>
        </div>

        {/* Right: Controls & File Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Snap toggle */}
          <button
            onClick={() => setSnapToGrid((s) => !s)}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              background: snapToGrid ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: snapToGrid ? '#ffffff' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            title="Snap to alignment guides and grid"
          >
            🧲 Snap
          </button>

          {/* Theme switcher */}
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            title="Toggle Light / Dark Theme"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>

          <div
            style={{
              width: 1,
              height: 20,
              background: 'var(--border-color)',
              margin: '0 2px',
            }}
          />

          {/* File Operations */}
          <button
            onClick={() => {
              const blankDsl = '[Client] -> [Server] : Request\n[Server] -> (Database) : Query';
              const cleanMeta: LayoutMetadata = {
                version: 1,
                nodes: {},
                viewport: { panX: 60, panY: 60, zoom: 1 },
              };
              setFileContent(blankDsl);
              setDslText(blankDsl);
              setMetadata(cleanMeta);
              setViewport(cleanMeta.viewport);
              pushHistory(blankDsl, cleanMeta.viewport);
            }}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            title="Create New Diagram"
          >
            📄 New
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            title="Open .diag File (Ctrl+O)"
          >
            📂 Open
          </button>

          <button
            onClick={handleSaveFile}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              background: 'var(--accent-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}
            title="Save .diag with Layout Metadata (Ctrl+S)"
          >
            💾 Save
          </button>

          {/* Export Dropdown */}
          <div ref={exportMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu((open) => !open)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>Export</span>
              <span style={{ fontSize: 9 }}>▼</span>
            </button>

            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                  zIndex: 100,
                  minWidth: 180,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={handleExportSvg}
                  style={exportMenuItemStyle}
                >
                  <span>Vector SVG (.svg)</span>
                </button>
                <button
                  onClick={() => handleExportPng(1, '1x')}
                  style={exportMenuItemStyle}
                >
                  <span>Raster PNG (1x)</span>
                </button>
                <button
                  onClick={() => handleExportPng(2, '2x')}
                  style={exportMenuItemStyle}
                >
                  <span>Retina PNG (2x)</span>
                </button>
                <button
                  onClick={() => handleExportPng(3, '3x')}
                  style={exportMenuItemStyle}
                >
                  <span>High-Res PNG (3x)</span>
                </button>
                <div style={{ height: 1, background: 'var(--border-color)' }} />
                <button
                  onClick={handleExportPdf}
                  style={exportMenuItemStyle}
                >
                  <span>Printable PDF (.pdf)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Split Layout */}
      <div ref={splitContainerRef} className="main-layout">
        {/* Left Pane: Code Editor */}
        {(viewMode === 'split' || viewMode === 'code') && (
          <div
            className="pane editor-pane"
            style={{
              width: viewMode === 'split' ? `${splitPercent}%` : '100%',
              flex: viewMode === 'split' ? 'none' : 1,
            }}
          >
            <EditorView
              value={fileContent}
              onChange={handleEditorChange}
              errors={ast.errors}
            />
          </div>
        )}

        {/* Draggable Divider */}
        {viewMode === 'split' && (
          <div
            onMouseDown={handleDividerMouseDown}
            onDoubleClick={() => setSplitPercent(50)}
            style={{
              width: 8,
              cursor: 'col-resize',
              background: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-color)',
              borderRight: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              zIndex: 10,
              transition: 'background 0.15s ease',
            }}
            title="Drag to resize split pane (Double-click to reset 50%)"
          >
            <div
              style={{
                width: 2,
                height: 24,
                borderRadius: 1,
                background: 'var(--border-color)',
              }}
            />
          </div>
        )}

        {/* Right Pane: Canvas View */}
        {(viewMode === 'split' || viewMode === 'canvas') && (
          <div
            className="pane canvas-pane"
            style={{
              width: viewMode === 'split' ? `${100 - splitPercent}%` : '100%',
              flex: 1,
            }}
          >
            <CanvasView
              scene={scene}
              viewport={viewport}
              selectedNodeIds={selectedNodeIds}
              onViewportChange={setViewport}
              onNodesMoved={handleNodesMoved}
              onSelectionChange={setSelectedNodeIds}
              snapToGridEnabled={snapToGrid}
              theme={theme}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid((g) => !g)}
            />
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <footer
        style={{
          height: 26,
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: 11,
          color: 'var(--text-secondary)',
          userSelect: 'none',
          zIndex: 20,
        }}
      >
        {/* Left: Graph Elements & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: hasDiagnostics ? '#ef4444' : '#10b981',
              fontWeight: 500,
            }}
          >
            <span>●</span>
            <span>
              {hasDiagnostics
                ? `${ast.errors.length} syntax error${ast.errors.length > 1 ? 's' : ''}`
                : 'Syntax valid'}
            </span>
          </span>

          <span>
            {scene.nodes.length} nodes ({pinnedCount} pinned)
          </span>

          <span>{scene.edges.length} edges</span>

          {selectedNodeIds.size > 0 && (
            <span style={{ color: 'var(--accent-primary)' }}>
              {selectedNodeIds.size} selected
            </span>
          )}
        </div>

        {/* Right: Viewport Zoom & Key Hints */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span>Zoom: {Math.round(viewport.zoom * 100)}%</span>
          <span>Pan: ({Math.round(viewport.panX)}, {Math.round(viewport.panY)})</span>
          <span style={{ opacity: 0.8 }}>
            <kbd style={kbdStyle}>H</kbd> Pan · <kbd style={kbdStyle}>V</kbd> Select · <kbd style={kbdStyle}>Space</kbd> Fast Pan
          </span>
        </div>
      </footer>
    </div>
  );
}

const exportMenuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 14px',
  fontSize: 12,
  background: 'transparent',
  color: 'var(--text-primary)',
  border: 'none',
  cursor: 'pointer',
};

const kbdStyle: React.CSSProperties = {
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-color)',
  borderRadius: 3,
  padding: '1px 4px',
  fontSize: 10,
  color: 'var(--text-primary)',
};
