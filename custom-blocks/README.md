# Custom Blocks

The Custom Blocks plugin lets you define reusable, styled components using a single `block` code block language. Block types live entirely in a vault-based YAML file, so you can add or adjust components without updating the plugin.

## Features
- Single shared language name: place block data inside ```block code blocks.
- Required `BLOCK` field selects the block type; the rest of the lines are case-insensitive key/value pairs.
- Reserved uppercase properties (`BLOCK`, `TAGS`) are handled by the plugin.
- `TAGS` values become tag pills that behave like normal Obsidian tags. If the block template omits `{{TAGS}}`, they appear in a dedicated tag row.
- User-defined templates and classes per block type.
- YAML configuration stored in your vault and reloadable via a command or settings tab.

## Installing
1. Copy the plugin folder into your vault's `.obsidian/plugins/` directory.
2. Run `npm install` then `npm run build` inside the plugin folder to generate `main.js`.
3. Enable **Custom Blocks** in Obsidian's community plugins list.

## Configuration
The plugin uses a YAML file (default: `custom-blocks.yml`) in your vault. If none exists, the plugin writes a starter file with the **Information**, **Contact Card**, and **Event Card** examples. Update the path from the settings tab if you prefer a different location.

Each block type entry supports:
- `name`: The value matched by the required `BLOCK` field in notes (case-insensitive).
- `displayName`: Optional header label (defaults to the `name`).
- `className`: Optional CSS class string applied to the rendered card.
- `template`: HTML template that supports `{{field}}` placeholders (case-insensitive) and `{{TAGS}}` for inline tag placement.
- `showHeader`: Set to `false` to hide the block name header.

### Sample configuration
```yaml
# custom-blocks.yml
blockTypes:
  - name: information
    displayName: Information
    className: cb-card info-card
    template: |
      <div class="cb-title">{{Title}}</div>
      <div class="cb-body">{{Description}}</div>
  - name: contact card
    displayName: Contact Card
    className: cb-card contact-card
    template: |
      <div class="cb-title">{{Name}}</div>
      <div class="cb-detail"><span class="cb-label">Email</span><span>{{Email}}</span></div>
      <div class="cb-detail"><span class="cb-label">Phone</span><span>{{Phone}}</span></div>
      <div class="cb-notes">{{Notes}}</div>
  - name: event card
    displayName: Event Card
    className: cb-card event-card
    template: |
      <div class="cb-row"><span class="cb-title">{{Name}}</span><span class="cb-date">{{Date}}</span></div>
      <div class="cb-row"><span class="cb-time">{{Time}}</span></div>
```

## Writing blocks in notes
Use a `block` code block. The first field **must** be `BLOCK`, then add properties in `key: value` or `key = value` form. Keys are case-insensitive; unknown fields stay blank in the template.

```
```block
BLOCK: Event Card
Name: Demo Day Launch
Date: 2025-12-15
Time: 10:00 AM
Tags: #launch, milestones, #product
```
```

If the template omits `{{TAGS}}`, the plugin automatically adds a tag row beneath the rendered content.

## Commands
- **Reload custom block definitions**: Reloads the YAML configuration without restarting Obsidian.

## Styling
Use `styles.css` or your own snippets to target the classes you specify in block definitions. The shipped CSS provides sensible defaults for the three starter block types.
