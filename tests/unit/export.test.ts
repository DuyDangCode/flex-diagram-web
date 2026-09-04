import { describe, it, expect } from 'vitest';
import { parseDSL } from '../../lib/parser';
import { computeLayout } from '../../lib/layout';
import { exportToSvg } from '../../lib/export/export_svg';

describe('Export to SVG', () => {
  it('generates valid vector SVG markup with nodes and edges', () => {
    const dsl = `
      [Client App] -> [API Gateway] : HTTPS
      [API Gateway] -> (PostgreSQL DB) : SQL
    `;
    const ast = parseDSL(dsl);
    const scene = computeLayout(ast);
    const svg = exportToSvg(scene);

    expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('Client App');
    expect(svg).toContain('API Gateway');
    expect(svg).toContain('PostgreSQL DB');

    // Should contain rectangle node and cylinder node
    expect(svg).toContain('class="node-rect"');
    expect(svg).toContain('class="node-cyl-body"');
    expect(svg).toContain('class="node-cyl-cap"');

    // Should contain edges and labels
    expect(svg).toContain('class="edge-line"');
    expect(svg).toContain('class="edge-arrow"');
    expect(svg).toContain('HTTPS');
  });

  it('safely escapes special XML characters in text labels', () => {
    const dsl = `
      [Service <A & B>] -> [Target "Main"] : Param > 5
    `;
    const ast = parseDSL(dsl);
    const scene = computeLayout(ast);
    const svg = exportToSvg(scene);

    expect(svg).toContain('Service &lt;A &amp; B&gt;');
    expect(svg).toContain('Target &quot;Main&quot;');
    expect(svg).toContain('Param &gt; 5');
    expect(svg).not.toContain('<A & B>');
  });

  it('supports transparent background option', () => {
    const dsl = `[A] -> [B]`;
    const ast = parseDSL(dsl);
    const scene = computeLayout(ast);
    const svg = exportToSvg(scene, { transparentBackground: true });

    expect(svg).toContain('.bg { fill: none; }');
    expect(svg).not.toContain('<rect class="bg"');
  });

  it('supports light / white theme export option', () => {
    const dsl = `[A] -> [B]`;
    const ast = parseDSL(dsl);
    const scene = computeLayout(ast);
    const svg = exportToSvg(scene, { theme: 'light' });

    expect(svg).toContain('.bg { fill: #ffffff; }');
    expect(svg).toContain('.node-text { fill: #0f172a;');
    expect(svg).toContain('.node-rect { fill: #ffffff;');
  });
});
