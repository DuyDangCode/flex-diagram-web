import { SceneGraph } from '../types';
import { exportToSvg } from './export_svg';

export function exportToPdf(scene: SceneGraph, title = 'FlexDiagram'): void {
  const svg = exportToSvg(scene, { padding: 30 });

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export to PDF');
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page {
            size: auto;
            margin: 10mm;
          }
          body {
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
          }
          svg {
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        ${svg}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
