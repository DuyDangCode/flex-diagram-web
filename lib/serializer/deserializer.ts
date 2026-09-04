import { LayoutMetadata } from '../types';

export interface DeserializedDiag {
  dslContent: string;
  metadata: LayoutMetadata;
}

export function deserializeDiag(fileContent: string): DeserializedDiag {
  const defaultMetadata: LayoutMetadata = {
    version: 1,
    nodes: {},
    viewport: { panX: 60, panY: 60, zoom: 1 },
  };

  const markerRegex = /\/\/\s*@layout:v(\d+)/;
  const match = markerRegex.exec(fileContent);

  if (!match) {
    return {
      dslContent: fileContent,
      metadata: defaultMetadata,
    };
  }

  const markerIndex = match.index;
  const dslContent = fileContent.slice(0, markerIndex).trimEnd();
  const metadataBlock = fileContent.slice(markerIndex + match[0].length);

  try {
    // Strip leading '// ' from each line
    const jsonLines = metadataBlock
      .split('\n')
      .map((line) => line.replace(/^\s*\/\/\s?/, ''))
      .join('\n')
      .trim();

    const parsed = JSON.parse(jsonLines);
    return {
      dslContent,
      metadata: {
        version: parsed.version || 1,
        nodes: parsed.nodes || {},
        viewport: parsed.viewport || defaultMetadata.viewport,
      },
    };
  } catch (err) {
    console.warn('Failed to parse diagram layout metadata, resetting to default:', err);
    return {
      dslContent,
      metadata: defaultMetadata,
    };
  }
}
