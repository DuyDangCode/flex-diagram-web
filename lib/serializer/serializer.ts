import { LayoutMetadata, NodeLayoutOverride } from '../types';

export function serializeDiag(dslContent: string, metadata: LayoutMetadata): string {
  // Strip any existing layout metadata block
  const layoutMarkerIndex = dslContent.indexOf('// @layout:v');
  const cleanDsl = (layoutMarkerIndex !== -1 ? dslContent.slice(0, layoutMarkerIndex) : dslContent).trimEnd();

  // Deterministically sort node keys to ensure clean Git diffs
  const sortedNodes: Record<string, NodeLayoutOverride> = {};
  const nodeKeys = Object.keys(metadata.nodes).sort();
  for (const key of nodeKeys) {
    sortedNodes[key] = metadata.nodes[key];
  }

  const sortedMetadata: LayoutMetadata = {
    version: 1,
    nodes: sortedNodes,
    viewport: {
      panX: Math.round(metadata.viewport.panX),
      panY: Math.round(metadata.viewport.panY),
      zoom: Number(metadata.viewport.zoom.toFixed(2)),
    },
  };

  const jsonStr = JSON.stringify(sortedMetadata, null, 2);
  const commentedJson = jsonStr
    .split('\n')
    .map((line) => `// ${line}`)
    .join('\n');

  return `${cleanDsl}\n\n// @layout:v1\n${commentedJson}\n`;
}
