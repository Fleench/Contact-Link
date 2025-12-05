# Tag-Link Graph

An Obsidian plugin that visualizes how your daily notes relate to each other through shared tags. It builds a force-directed graph where each note is a node and shared tags create the connecting edges, helping you spot clusters and cross-links in your journaling workflow.

## Features
- **Interactive graph view:** Open a canvas view that plots daily notes and animates their relationships based on shared tags.
- **Tag-strength cues:** Edge thickness and color reflect how many tags two notes share (weak/medium/strong).
- **Report generation:** Quickly create a `Tag-Link Graph Report.md` file summarizing every tag-based connection with the tags that link each pair.
- **Ribbon and commands:** Launch the graph from the ribbon icon or via commands:
  - `Open Tag-Connected Graph (Visual)`
  - `Generate Tag-Connected Graph Report`

## How notes and tags are detected
- The plugin scans markdown files whose path starts with `Daily/` **or** whose filename matches the pattern `YYYY-MM-DD` (e.g., `2024-05-01.md`). If no daily notes are found, it falls back to scanning all markdown files in the vault.
- Tags are collected from both frontmatter/metadata and inline `#tags` within the note content.
- Only notes with at least one detected tag are included in the graph.

## Installation (development build)
1. Install Node.js 18+.
2. Clone this repository and open the plugin folder:
   ```bash
   git clone <repo-url>
   cd Contact-Link/taglink-graph
   npm install
   ```
3. Build the plugin to generate `main.js`:
   ```bash
   npm run build
   ```
4. Copy `manifest.json`, the built `main.js`, and `styles.css` into your vault at `.obsidian/plugins/taglink-graph/`.
5. Restart Obsidian and enable **Tag-Link Graph (shared tags = links)** in Settings → Community Plugins.

> **Note:** The repository currently only contains the TypeScript source. You must run the build step to produce the `main.js` bundle that Obsidian loads.

## Usage tips
- Keep your daily notes under `Daily/` or use date-based filenames so the plugin can find them.
- Add meaningful tags to your notes; connections only appear when two notes share at least one tag.
- Drag nodes to rearrange the view; double-click a node to open its note.

## Troubleshooting
- **No view/report generated:** Ensure you've run `npm run build` so a compiled `main.js` exists in your plugin folder—Obsidian cannot load the TypeScript source alone.
- **Empty graph:** Confirm your daily notes contain tags; notes without tags are filtered out.
- **Missing daily notes notice:** Create notes under `Daily/` or rename them to the `YYYY-MM-DD` pattern so they are detected.
- **Build fails on Android/shared storage:** Some Android storage locations are mounted with `noexec`, which blocks the native esbuild binary. The build now automatically falls back to a WebAssembly-based compiler in those environments, but make sure you've installed dependencies (`npm install`) so the `esbuild-wasm` package is available.
