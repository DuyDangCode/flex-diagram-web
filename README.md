# FlexDiagram Web

> **"Code first, Shape later"** — A developer-centric architecture diagramming platform that combines the speed of declarative DSL authoring with the spatial control of free-form visual canvas adjustments.

---

## Key Features

- ⚡ **Closed-Loop Synchronization**: Seamlessly bidirectional. Type DSL on the left, reposition shapes freely on the right. Pinned nodes stay locked when updating code.
- 📐 **Orthogonal Manhattan Edge Routing**: Obstacle-aware 90-degree right-angle routing around node bodies with automatic parallel lane-shifting.
- 🧲 **Free-Form Canvas & Alignment Snapping**: Drag-and-drop repositioning with dynamic alignment guides (center-line and border matching).
- 🎨 **Dark & Light Themes**: Instant switching between dark developer palette and high-contrast white presentation palette with theme-synchronized exports.
- 📁 **Git-Friendly `.diag` Format**: Pure logic DSL at the top, deterministically sorted JSON metadata comment block at the bottom (`// @layout:v1`).
- 📤 **Publication-Ready Exports**: Vector SVG, high-resolution PNG (1x, 2x Retina, 3x Presentation), and printable vector PDF.
- 📑 **Template Library**: Built-in templates for Microservices Flow, Kafka Stream Pipeline, Logic Decision Flow, and PlantUML Compatibility.
- ⌨️ **Full Keyboard Shortcuts**: <kbd>Ctrl+Z</kbd> / <kbd>Cmd+Z</kbd> Undo, <kbd>Ctrl+Shift+Z</kbd> / <kbd>Cmd+Shift+Z</kbd> Redo, <kbd>Ctrl+S</kbd> Save, <kbd>H</kbd> Pan mode, <kbd>V</kbd> Select mode, and <kbd>Space</kbd> Fast Pan.

---

## Getting Started

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Quality Checks & Testing

```bash
# Type check TypeScript
npm run typecheck

# Lint with ESLint
npm run lint

# Run all unit and integration test suites
npm test

# Production build
npm run build
```

---

## DSL Quick Syntax

```flexdiag
// Rectangle Node
[Client App]

// Cylinder / Database Node
(PostgreSQL DB)

// Diamond Decision Node
<Rate Limit Exceeded?>

// Connectors & Styles
[Client] -> [Gateway] : HTTPS Request           // Solid directed arrow with label
[Gateway] ..> (Cache) : Cache Miss (SQL)         // Dotted arrow
[Gateway] -.-> [Worker] : Event Stream           // Dashed arrow
[Service A] <-> [Service B] : Mutual Sync        // Bidirectional arrow
```

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/SPECIFICATION.md](docs/SPECIFICATION.md) for full system design, grammar specifications, and requirements.
