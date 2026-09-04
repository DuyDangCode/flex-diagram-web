import { SceneGraph } from '../types';
import { DARK_THEME, LIGHT_THEME, Renderer2D, RenderTheme } from '../canvas/renderer_2d';

export interface ExportPngOptions {
  scale?: number; // 1, 2, 3
  padding?: number;
  transparentBackground?: boolean;
  theme?: 'dark' | 'light';
  showGrid?: boolean;
}

export function exportToPngDataUrl(
  scene: SceneGraph,
  options: ExportPngOptions = {},
): string {
  const scale = options.scale ?? 2; // Default 2x Retina
  const padding = options.padding ?? 40;
  const isTransparent = options.transparentBackground ?? false;
  const isLight = options.theme === 'light';
  const baseTheme = isLight ? LIGHT_THEME : DARK_THEME;

  const minX = scene.boundingBox.minX - padding;
  const minY = scene.boundingBox.minY - padding;
  const width = Math.max(200, scene.boundingBox.maxX - scene.boundingBox.minX + padding * 2);
  const height = Math.max(150, scene.boundingBox.maxY - scene.boundingBox.minY + padding * 2);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create offscreen 2D canvas context');
  }

  // Setup transform: translate so scene minX/minY aligns at (0, 0) inside padding
  const customTheme: RenderTheme = isTransparent
    ? {
        ...baseTheme,
        canvasBg: 'transparent',
        gridDotColor: 'transparent',
      }
    : baseTheme;

  const renderer = new Renderer2D(ctx, customTheme);

  // Use custom viewport mapping world coordinates to export canvas
  const exportViewport = {
    panX: -minX,
    panY: -minY,
    zoom: 1,
  };

  const showGrid = options.showGrid ?? false;
  renderer.render(scene, exportViewport, null, [], null, showGrid);

  return canvas.toDataURL('image/png');
}

export function triggerDownload(dataUrlOrBlobUri: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrlOrBlobUri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
