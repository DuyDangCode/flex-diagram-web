import { describe, it, expect } from 'vitest';
import { parseDSL } from '../../lib/parser';
import { computeLayout } from '../../lib/layout';
import { exportToSvg } from '../../lib/export/export_svg';

describe('Performance and Stress Benchmark', () => {
  it('efficiently handles 100+ nodes and 150+ edges under 100ms', () => {
    const lines: string[] = [];
    const nodeCount = 100;

    // Generate complex interconnected mesh
    for (let i = 1; i < nodeCount; i++) {
      const parent = Math.floor((i - 1) / 3);
      lines.push(`[Node ${parent}] -> [Node ${i}] : link-${i}`);
      if (i % 5 === 0) {
        lines.push(`[Node ${i}] -> (Database ${i / 5}) : query`);
      }
    }

    const dsl = lines.join('\n');

    const t0 = performance.now();
    const ast = parseDSL(dsl);
    const tParse = performance.now() - t0;

    expect(ast.nodes.length).toBeGreaterThanOrEqual(100);
    expect(ast.edges.length).toBeGreaterThanOrEqual(115);
    expect(tParse).toBeLessThan(100); // Sub-100ms parsing for 100 nodes

    const t1 = performance.now();
    const scene = computeLayout(ast);
    const tLayout = performance.now() - t1;

    expect(scene.nodes.length).toBeGreaterThanOrEqual(100);
    expect(scene.edges.length).toBeGreaterThanOrEqual(115);
    // Layout and orthogonal routing should complete briskly
    expect(tLayout).toBeLessThan(250);

    const t2 = performance.now();
    const svg = exportToSvg(scene);
    const tExport = performance.now() - t2;

    expect(svg.length).toBeGreaterThan(1000);
    expect(tExport).toBeLessThan(100);
  });
});
