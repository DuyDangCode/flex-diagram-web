# Changelog

All notable changes to the FlexDiagram project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How to Use This Changelog

To maintain a consistent, high-quality historical log of all modifications, contributors should follow these guidelines:

- **Focus on Impact (WHAT, not HOW)**: Each entry should describe **WHAT** changed from a user or developer perspective, rather than implementation details of **HOW** it was coded.
- **Standard Categories**: Group all changes within a version under the appropriate subheadings:
  - `Added` for new features and capabilities.
  - `Changed` for changes in existing functionality.
  - `Deprecated` for soon-to-be removed features.
  - `Removed` for features removed in this release.
  - `Fixed` for bug fixes and defect resolutions.
  - `Security` in case of vulnerabilities and security patches.
- **Context & Traceability**: Include release dates (formatted as `YYYY-MM-DD`) and reference related issue numbers or pull requests (e.g., `#42`) when available.
- **Unreleased Changes**: The `[Unreleased]` section is dedicated to tracking all changes that have been committed but not yet packaged into an official release. When cutting a release, promote the unreleased changes to a new version header stamped with the current date, and instantiate a new empty `[Unreleased]` section above it.

---

## [Unreleased]

## [0.2.0] - 2026-09-05

### Added
- **PlantUML Compatibility**:
  - Direct tolerance and filtering for PlantUML preamble and skin parameters (`@startuml`, `@enduml`, `!theme`, `skinparam`, `title`, `header`, `footer`).
  - Single-quote PlantUML comment support (`' comment line`).
  - Rich connector arrow syntax support including dotted and dashed lines (`..>`, `-.->`, `-->`, `<..>`, `...`).
  - `EdgeStyle` property (`solid`, `dashed`, `dotted`) modeled in AST and rendered with HTML5 Canvas `setLineDash` and SVG `stroke-dasharray`.
  - Built-in PlantUML sample architecture template in the template picker.
- **White / Light Theme Support**:
  - Full application-wide Light theme via CSS custom properties (`:root[data-theme="light"]`).
  - Dedicated `LIGHT_THEME` render palette with crisp white canvas (`#ffffff`), high-contrast node strokes, and dark text.
  - Theme switcher button in header (`☀️ Light` / `🌙 Dark`).
  - Theme-synchronized vector SVG and raster PNG export honoring active color scheme.
- **Enhanced Canvas Pan Navigation & Tool Modes**:
  - Click-and-hold left mouse canvas panning on empty canvas areas by default.
  - Persistent tool mode switcher in the floating canvas HUD: Pan mode (`✋ Pan`) and Select mode (`↖ Select`).
  - Keyboard shortcuts to quickly toggle tool modes: <kbd>H</kbd> for Pan, <kbd>V</kbd> for Select, and holding <kbd>Space</kbd> for temporary pan.
  - Interactive cursor cues (`grab`, `grabbing`, `crosshair`, `default`).
- **Grid Visibility Controls**:
  - Canvas background dot grid visibility toggle (`▦ Grid` / `⬚ Grid`).
  - Accessible via both the top application toolbar and the canvas floating HUD.

### Fixed
- Fixed database cylinder top elliptical cap rendering black in White/Light theme by adding a dynamic `nodeCylinderCap` theme token (`#e2e8f0` in light, `#222733` in dark).

### Added
- **Cross-Platform App, Split-View UI & Export Engine (Phase 3)**:
  - Resizable split pane with draggable divider, percentage memory, and 3 view modes (`Code Only`, `Split View`, `Canvas Only`).
  - Gutter-based line numbers and real-time inline diagnostic error markers ([src/editor/EditorView.tsx](file:///home/thanhduy/Projects/flex-diagram/src/editor/EditorView.tsx)).
  - High-resolution vector SVG export engine ([src/export/export_svg.ts](file:///home/thanhduy/Projects/flex-diagram/src/export/export_svg.ts)) with embedded CSS and XML escaping.
  - Multi-density raster PNG export ([src/export/export_png.ts](file:///home/thanhduy/Projects/flex-diagram/src/export/export_png.ts)) supporting 1x, 2x Retina, and 3x presentation scaling.
  - Vector PDF print export generator ([src/export/export_pdf.ts](file:///home/thanhduy/Projects/flex-diagram/src/export/export_pdf.ts)).
  - Sample architectural templates picker (Microservices, Kafka Stream Pipeline, Logic Decision Flow).
  - Native file open and save dialogs with Tauri Rust IPC commands ([src-tauri/src/lib.rs](file:///home/thanhduy/Projects/flex-diagram/src-tauri/src/lib.rs)).
  - Multi-OS matrix CI workflow ([.github/workflows/ci.yml](file:///home/thanhduy/Projects/flex-diagram/.github/workflows/ci.yml)) testing on Linux, macOS, and Windows.
  - Cross-platform release packaging workflow ([.github/workflows/release.yml](file:///home/thanhduy/Projects/flex-diagram/.github/workflows/release.yml)) targeting `.dmg`, `.msi`/`.exe`, and `.deb`/`.AppImage`.
  - Comprehensive DSL specification ([docs/SPECIFICATION.md](file:///home/thanhduy/Projects/flex-diagram/docs/SPECIFICATION.md)) and user showcase walkthrough ([docs/DEMO.md](file:///home/thanhduy/Projects/flex-diagram/docs/DEMO.md)).
  - End-to-end loop synchronization test ([tests/integration/loop_sync.test.ts](file:///home/thanhduy/Projects/flex-diagram/tests/integration/loop_sync.test.ts)) and stress benchmark validating 100+ nodes and 150+ edges processed under 60ms.
- **Canvas Enhancements & Git Diff Stability (Phase 2.2 & 2.4)**:
  - Multi-node selection with Shift-click toggling and interactive rectangular marquee box selection.
  - Group drag: simultaneously translates multiple selected nodes preserving their relative spatial offsets.
  - Smart alignment guides and grid snapping ([src/canvas/alignment.ts](file:///home/thanhduy/Projects/flex-diagram/src/canvas/alignment.ts)) with center-line and edge alignment indicators.
  - Full Undo/Redo command pattern history stack ([src/app/history.ts](file:///home/thanhduy/Projects/flex-diagram/src/app/history.ts)) with toolbar buttons and keyboard shortcuts (`Ctrl+Z` / `Cmd+Z`, `Ctrl+Shift+Z` / `Cmd+Shift+Z`).
  - Validated single-node git diff compatibility ensuring minimal line churn when updating diagram coordinates.
- **Sync & Persistence: State Reconciler & Orthogonal Router (Phase 2.1 & 2.3)**:
  - Intelligent State Reconciler ([src/reconciler/reconciler.ts](file:///home/thanhduy/Projects/flex-diagram/src/reconciler/reconciler.ts)) with AST diffing against LayoutMetadata.
  - Heuristic node rename detection preserving manual coordinates when labels change.
  - Directional collision-free open space placement for newly added nodes.
  - Automatic pruning of deleted nodes from metadata table.
  - Orthogonal (Manhattan) Edge Router ([src/layout/orthogonal_router.ts](file:///home/thanhduy/Projects/flex-diagram/src/layout/orthogonal_router.ts)) with 4-port boundary docking and obstacle avoidance.
  - Dedicated orthogonal loop routing for self-referential edges (`[A] -> [A]`).
  - Dynamic lane-shifting for parallel and bidirectional edges to eliminate line overlaps.
  - Real-time connected edge re-routing during interactive node dragging on the canvas.
- **Core Engine (Phase 1 MVP)**:
  - Repository structure, tooling, Vite, TypeScript, ESLint 9+ flat config, Prettier, and GitHub Actions CI.
  - Tauri v2 cross-platform desktop shell skeleton with Rust native backend.
  - Zero-dependency DSL Lexer and Recursive Descent Parser with error recovery and full source location mapping.
  - Stable ID generator for nodes supporting deterministic slugification.
  - Hierarchical auto-layout engine powered by Dagre with node dimension calculations and docking point geometry.
  - Interactive HTML5 Canvas 2D renderer running at 60 FPS with Retina scaling, pan, zoom-to-cursor, node drag-and-drop, and visual pin indicator badges.
  - Bidirectional closed loop between DSL text editor and interactive canvas.
  - Git-friendly `.diag` serializer and deserializer with deterministic sorted `// @layout:v1` commented metadata blocks.
  - Automated test suite with 28 unit and integration tests passing in Vitest.
- Project documentation initialized (2026-09-04)
  - PROJECT_OVERVIEW.md — Project vision, mission, and high-level description
  - USER_STORIES.md — User stories organized by epics with acceptance criteria
  - USER_REQUIREMENTS.md — Functional and non-functional requirements specification
  - WORK_BREAKDOWN.md — Work breakdown structure and task tracking
  - ARCHITECTURE.md — Technical architecture and design decisions
  - CHANGELOG.md — This changelog file

## [0.0.0] - 2026-09-04

### Added
- Initial project creation
- Repository initialized
