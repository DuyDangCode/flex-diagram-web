import { describe, it, expect } from 'vitest';
import { serializeDiag, deserializeDiag } from '../../lib/serializer';
import { LayoutMetadata } from '../../lib/types';

describe('Diag Serializer and Deserializer', () => {
  it('serializes DSL and metadata with git-friendly commented JSON', () => {
    const dsl = '[Client] -> [Gateway] : REST';
    const metadata: LayoutMetadata = {
      version: 1,
      nodes: {
        client: { x: 100, y: 150, pinned: true },
        gateway: { x: 300, y: 150, pinned: false },
      },
      viewport: { panX: 50, panY: 50, zoom: 1 },
    };

    const serialized = serializeDiag(dsl, metadata);
    expect(serialized).toContain('[Client] -> [Gateway] : REST');
    expect(serialized).toContain('// @layout:v1');
    expect(serialized).toContain('//   "version": 1');
    expect(serialized).toContain('//   "nodes": {');
    expect(serialized).toContain('//     "client": {');
  });

  it('round-trips .diag format accurately', () => {
    const originalDsl = `// Microservice Architecture
[Client] -> [Gateway] : REST
[Gateway] -> (Database) : SQL`;

    const originalMetadata: LayoutMetadata = {
      version: 1,
      nodes: {
        client: { x: 120, y: 200, pinned: true },
        database: { x: 500, y: 400, pinned: true },
        gateway: { x: 300, y: 200, pinned: false },
      },
      viewport: { panX: 80, panY: 100, zoom: 1.25 },
    };

    const fileContent = serializeDiag(originalDsl, originalMetadata);
    const deserialized = deserializeDiag(fileContent);

    expect(deserialized.dslContent).toBe(originalDsl);
    expect(deserialized.metadata.version).toBe(1);
    expect(deserialized.metadata.nodes['client']).toEqual({ x: 120, y: 200, pinned: true });
    expect(deserialized.metadata.nodes['database']).toEqual({ x: 500, y: 400, pinned: true });
    expect(deserialized.metadata.viewport.panX).toBe(80);
    expect(deserialized.metadata.viewport.zoom).toBe(1.25);
  });

  it('produces clean, minimal git diffs when a single node is moved', () => {
    const dsl = '[A] -> [B]\n[B] -> [C]';
    const initialMetadata: LayoutMetadata = {
      version: 1,
      nodes: {
        a: { x: 100, y: 100, pinned: true },
        b: { x: 300, y: 100, pinned: true },
        c: { x: 500, y: 100, pinned: true },
      },
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };

    const updatedMetadata: LayoutMetadata = {
      ...initialMetadata,
      nodes: {
        ...initialMetadata.nodes,
        b: { x: 300, y: 250, pinned: true }, // ONLY b moved
      },
    };

    const file1Lines = serializeDiag(dsl, initialMetadata).split('\n');
    const file2Lines = serializeDiag(dsl, updatedMetadata).split('\n');

    expect(file1Lines.length).toBe(file2Lines.length);

    // Count how many lines differ
    const changedIndices = [];
    for (let i = 0; i < file1Lines.length; i++) {
      if (file1Lines[i] !== file2Lines[i]) {
        changedIndices.push(i);
      }
    }

    // Only the lines for node "b" ('"y": 100' vs '"y": 250') should have changed
    expect(changedIndices.length).toBe(1);
    expect(file1Lines[changedIndices[0]]).toContain('"y": 100');
    expect(file2Lines[changedIndices[0]]).toContain('"y": 250');
  });
});
