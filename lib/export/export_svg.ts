import { SceneGraph } from '../types';

export interface ExportSvgOptions {
  padding?: number;
  transparentBackground?: boolean;
  backgroundColor?: string;
  theme?: 'dark' | 'light';
}

export function exportToSvg(scene: SceneGraph, options: ExportSvgOptions = {}): string {
  const padding = options.padding ?? 40;
  const isTransparent = options.transparentBackground ?? false;
  const isLight = options.theme === 'light';
  const defaultBg = isLight ? '#ffffff' : '#0e0f12';
  const bgColor = options.backgroundColor ?? defaultBg;

  const minX = scene.boundingBox.minX - padding;
  const minY = scene.boundingBox.minY - padding;
  const width = Math.max(200, scene.boundingBox.maxX - scene.boundingBox.minX + padding * 2);
  const height = Math.max(150, scene.boundingBox.maxY - scene.boundingBox.minY + padding * 2);

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">`,
  );

  // Embedded CSS based on theme
  const nodeFill = isLight ? '#ffffff' : '#1a1d26';
  const nodeStroke = isLight ? '#94a3b8' : '#3e4456';
  const nodeTextFill = isLight ? '#0f172a' : '#f1f5f9';
  const cylCapFill = isLight ? '#f1f5f9' : '#222733';
  const edgeStroke = isLight ? '#475569' : '#64748b';
  const edgeBadgeFill = isLight ? '#f1f5f9' : '#1e293b';
  const edgeBadgeStroke = isLight ? '#cbd5e1' : '#64748b';
  const edgeTextFill = isLight ? '#1e293b' : '#cbd5e1';

  lines.push(`  <style>`);
  lines.push(`    .bg { fill: ${isTransparent ? 'none' : bgColor}; }`);
  lines.push(`    .node-rect { fill: ${nodeFill}; stroke: ${nodeStroke}; stroke-width: 1.5px; rx: 8px; ry: 8px; }`);
  lines.push(`    .node-cyl-body { fill: ${nodeFill}; stroke: ${nodeStroke}; stroke-width: 1.5px; }`);
  lines.push(`    .node-cyl-cap { fill: ${cylCapFill}; stroke: ${nodeStroke}; stroke-width: 1.5px; }`);
  lines.push(`    .node-diamond { fill: ${nodeFill}; stroke: ${nodeStroke}; stroke-width: 1.5px; }`);
  lines.push(
    `    .node-text { fill: ${nodeTextFill}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; font-weight: 600; text-anchor: middle; dominant-baseline: central; }`,
  );
  lines.push(`    .edge-line { stroke: ${edgeStroke}; stroke-width: 1.8px; stroke-linejoin: round; fill: none; }`);
  lines.push(`    .edge-arrow { fill: ${edgeStroke}; }`);
  lines.push(`    .edge-badge { fill: ${edgeBadgeFill}; stroke: ${edgeBadgeStroke}; stroke-width: 1px; rx: 4px; ry: 4px; }`);
  lines.push(
    `    .edge-text { fill: ${edgeTextFill}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; font-weight: 500; text-anchor: middle; dominant-baseline: central; }`,
  );
  lines.push(`    .pin-badge { fill: #f59e0b; stroke: #000000; stroke-width: 1px; }`);
  lines.push(`  </style>`);

  // Background
  if (!isTransparent) {
    lines.push(`  <rect class="bg" x="${minX}" y="${minY}" width="${width}" height="${height}" />`);
  }

  // Edges
  for (const edge of scene.edges) {
    if (edge.waypoints.length < 2) continue;

    // Polyline path
    let d = `M ${edge.waypoints[0].x} ${edge.waypoints[0].y}`;
    for (let i = 1; i < edge.waypoints.length; i++) {
      d += ` L ${edge.waypoints[i].x} ${edge.waypoints[i].y}`;
    }
    const dashAttr = edge.style === 'dotted' ? ' stroke-dasharray="4,4"' : edge.style === 'dashed' ? ' stroke-dasharray="8,5"' : '';
    lines.push(`  <path class="edge-line"${dashAttr} d="${d}" />`);

    // Arrowhead
    const last = edge.waypoints[edge.waypoints.length - 1];
    const prev = edge.waypoints[edge.waypoints.length - 2];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const arrowLen = 9;
    const arrowWidth = 5;

    const p1x = last.x - arrowLen * Math.cos(angle) + arrowWidth * Math.sin(angle);
    const p1y = last.y - arrowLen * Math.sin(angle) - arrowWidth * Math.cos(angle);
    const p2x = last.x - arrowLen * Math.cos(angle) - arrowWidth * Math.sin(angle);
    const p2y = last.y - arrowLen * Math.sin(angle) + arrowWidth * Math.cos(angle);

    lines.push(
      `  <polygon class="edge-arrow" points="${last.x},${last.y} ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)}" />`,
    );

    // Label
    if (edge.label && edge.labelPosition) {
      const approxW = edge.label.length * 7 + 16;
      const approxH = 18;
      const lx = edge.labelPosition.x - approxW / 2;
      const ly = edge.labelPosition.y - approxH / 2;

      lines.push(
        `  <rect class="edge-badge" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${approxW}" height="${approxH}" />`,
      );
      lines.push(
        `  <text class="edge-text" x="${edge.labelPosition.x.toFixed(1)}" y="${edge.labelPosition.y.toFixed(1)}">${escapeXml(edge.label)}</text>`,
      );
    }
  }

  // Nodes
  for (const node of scene.nodes) {
    const halfW = node.width / 2;
    const halfH = node.height / 2;
    const x = node.x - halfW;
    const y = node.y - halfH;

    if (node.shape === 'cylinder') {
      const rx = node.width / 2;
      const ry = 12;
      const cx = node.x;

      // Curved body
      const bodyD = `M ${x} ${y + ry} A ${rx} ${ry} 0 0 0 ${x + node.width} ${y + ry} L ${x + node.width} ${y + node.height - ry} A ${rx} ${ry} 0 0 1 ${x} ${y + node.height - ry} Z`;
      lines.push(`  <path class="node-cyl-body" d="${bodyD}" />`);
      // Top cap
      lines.push(`  <ellipse class="node-cyl-cap" cx="${cx}" cy="${y + ry}" rx="${rx}" ry="${ry}" />`);
    } else if (node.shape === 'diamond') {
      const pts = `${node.x},${y} ${x + node.width},${node.y} ${node.x},${y + node.height} ${x},${node.y}`;
      lines.push(`  <polygon class="node-diamond" points="${pts}" />`);
    } else {
      // Rounded Rectangle
      lines.push(
        `  <rect class="node-rect" x="${x}" y="${y}" width="${node.width}" height="${node.height}" />`,
      );
    }

    // Node Text
    lines.push(`  <text class="node-text" x="${node.x}" y="${node.y}">${escapeXml(node.label)}</text>`);

    // Pin indicator
    if (node.pinned) {
      lines.push(`  <circle class="pin-badge" cx="${node.x + halfW - 12}" cy="${y + 12}" r="5" />`);
    }
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
