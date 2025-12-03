/* ChatGPT Codex 2025-12-03 */
import { App, MarkdownPostProcessorContext, Notice, Plugin, PluginSettingTab, Setting, normalizePath, parseYaml } from "obsidian";

interface CustomBlocksSettings {
  configPath: string;
}

const DEFAULT_SETTINGS: CustomBlocksSettings = {
  configPath: "custom-blocks.yml",
};

interface BlockTypeConfig {
  name: string;
  className?: string;
  template: string;
  showHeader?: boolean;
  displayName?: string;
}

interface ParsedBlock {
  type?: string;
  fields: Record<string, string>;
  tags: string[];
  valid: boolean;
  error?: string;
}

const DEFAULT_CONFIG_CONTENT = `# ChatGPT Codex 2025-12-03\n# Block definitions for the Custom Blocks plugin.\nblockTypes:\n  - name: information\n    displayName: Information\n    className: cb-card info-card\n    template: |\n      <div class=\"cb-title\">{{Title}}</div>\n      <div class=\"cb-body\">{{Description}}</div>\n  - name: contact card\n    displayName: Contact Card\n    className: cb-card contact-card\n    template: |\n      <div class=\"cb-title\">{{Name}}</div>\n      <div class=\"cb-detail\"><span class=\"cb-label\">Email</span><span>{{Email}}</span></div>\n      <div class=\"cb-detail\"><span class=\"cb-label\">Phone</span><span>{{Phone}}</span></div>\n      <div class=\"cb-notes\">{{Notes}}</div>\n  - name: event card\n    displayName: Event Card\n    className: cb-card event-card\n    template: |\n      <div class=\"cb-row\"><span class=\"cb-title\">{{Name}}</span><span class=\"cb-date\">{{Date}}</span></div>\n      <div class=\"cb-row\"><span class=\"cb-time\">{{Time}}</span></div>\n`;

export default class CustomBlocksPlugin extends Plugin {
  settings: CustomBlocksSettings = DEFAULT_SETTINGS;
  private blockTypes: Map<string, BlockTypeConfig> = new Map();

  async onload() {
    await this.loadSettings();
    await this.ensureConfigExists();
    await this.loadBlockDefinitions();

    this.registerMarkdownCodeBlockProcessor("block", (source, el, ctx) => {
      this.renderBlock(source, el, ctx);
    });

    this.addCommand({
      id: "reload-custom-blocks-config",
      name: "Reload custom block definitions",
      callback: () => this.reloadDefinitions(),
    });

    this.addSettingTab(new CustomBlocksSettingTab(this.app, this));
  }

  onunload() {}

  private async ensureConfigExists() {
    const path = normalizePath(this.settings.configPath);
    const exists = await this.app.vault.adapter.exists(path);
    if (!exists) {
      await this.app.vault.adapter.write(path, DEFAULT_CONFIG_CONTENT);
      new Notice(`Created default Custom Blocks config at ${path}`);
    }
  }

  private async loadBlockDefinitions() {
    const path = normalizePath(this.settings.configPath);
    try {
      const raw = await this.app.vault.adapter.read(path);
      const parsed = parseYaml(raw) as any;
      const types: BlockTypeConfig[] = Array.isArray(parsed?.blockTypes) ? parsed.blockTypes : [];
      const nextMap: Map<string, BlockTypeConfig> = new Map();
      for (const entry of types) {
        if (!entry?.name || typeof entry.template !== "string") continue;
        const name: string = String(entry.name).trim();
        if (name.toUpperCase() === name) {
          console.warn(`Custom Blocks: skipping block type "${name}" because fully uppercase names are reserved.`);
          continue;
        }
        const key = name.toLowerCase();
        nextMap.set(key, {
          name,
          template: entry.template,
          className: entry.className ?? "",
          displayName: entry.displayName ?? entry.name,
          showHeader: entry.showHeader !== false,
        });
      }
      this.blockTypes = nextMap;
    } catch (error) {
      console.error("Custom Blocks: failed to load config", error);
      new Notice(`Custom Blocks: failed to read ${path}`);
    }
  }

  public async reloadDefinitions() {
    await this.loadBlockDefinitions();
    new Notice("Custom Blocks configuration reloaded");
  }

  private parseBlock(source: string): ParsedBlock {
    const fields: Record<string, string> = {};
    const tags: string[] = [];
    const lines = source.split(/\r?\n/);
    let type: string | undefined;
    let firstKey: string | undefined;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(/^([^:=]+?)\s*(?:=|:)\s*(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const lowerKey = key.toLowerCase();
      firstKey = firstKey ?? lowerKey;
      const value = match[2].trim();

      if (lowerKey === "block") {
        type = value;
        continue;
      }

      if (firstKey !== "block") {
        return { type, fields, tags, valid: false, error: "First field must be BLOCK." };
      }

      if (lowerKey === "tags") {
        tags.push(...value.split(",").map((tag) => this.normalizeTag(tag)).filter(Boolean) as string[]);
        continue;
      }

      fields[lowerKey] = value;
    }

    if (!type) {
      return { type, fields, tags, valid: false, error: "BLOCK type is missing." };
    }

    return { type, fields, tags, valid: true };
  }

  private normalizeTag(tag: string): string {
    const cleaned = tag.trim().replace(/^#+/, "");
    if (!cleaned) return "";
    return `#${cleaned}`;
  }

  private renderBlock(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    const parsed = this.parseBlock(source);

    if (!parsed.valid || !parsed.type) {
      const warning = el.createDiv({ cls: "custom-blocks-warning" });
      warning.setText(parsed.error ?? "Invalid block definition.");
      return;
    }

    const typeKey = parsed.type.toLowerCase();
    const definition = this.blockTypes.get(typeKey);

    if (!definition) {
      const warning = el.createDiv({ cls: "custom-blocks-warning" });
      warning.setText(`Unknown block type: ${parsed.type}`);
      return;
    }

    const container = el.createDiv({ cls: ["custom-block-card", definition.className ?? "", `custom-block-${typeKey}`].join(" ") });

    if (definition.showHeader !== false) {
      const header = container.createDiv({ cls: "custom-block-header" });
      header.setText(definition.displayName ?? definition.name);
    }

    const body = container.createDiv({ cls: "custom-block-body" });
    const { html, tagsUsedInTemplate } = this.renderTemplate(definition.template, parsed.fields, parsed.tags);
    body.innerHTML = html;

    if (parsed.tags.length > 0 && !tagsUsedInTemplate) {
      const tagRow = container.createDiv({ cls: "custom-block-tag-row" });
      this.injectTagPills(tagRow, parsed.tags);
    }
  }

  private renderTemplate(template: string, fields: Record<string, string>, tags: string[]): { html: string; tagsUsedInTemplate: boolean } {
    let tagsUsedInTemplate = false;
    const html = template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawKey) => {
      const key = String(rawKey).trim().toLowerCase();
      if (key === "tags") {
        tagsUsedInTemplate = true;
        return this.tagsToHtml(tags);
      }
      return fields[key] ?? "";
    });

    return { html, tagsUsedInTemplate };
  }

  private tagsToHtml(tags: string[]): string {
    if (tags.length === 0) return "";
    return tags
    .map((tag) => `<a class="tag custom-block-tag" href="#/${tag.substring(1)}">${tag}</a>`)
    .join(" ");
  }

  private injectTagPills(container: HTMLElement, tags: string[]) {
    if (tags.length === 0) return;
    const row = container.createDiv({ cls: "custom-block-tags" });
    tags.forEach((tag) => {
      row.innerHTML += `<a class="tag custom-block-tag" href="#/${tag.substring(1)}">${tag}</a>`;
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class CustomBlocksSettingTab extends PluginSettingTab {
  plugin: CustomBlocksPlugin;

  constructor(app: App, plugin: CustomBlocksPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Custom Blocks" });

    new Setting(containerEl)
      .setName("Config file path")
      .setDesc("Relative path inside the vault to the YAML file that defines your block types.")
      .addText((text) =>
        text
          .setPlaceholder("custom-blocks.yml")
          .setValue(this.plugin.settings.configPath)
          .onChange(async (value) => {
            this.plugin.settings.configPath = value.trim() || DEFAULT_SETTINGS.configPath;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reload configuration")
      .setDesc("Reload block definitions from the config file without restarting Obsidian.")
      .addButton((button) =>
        button
          .setButtonText("Reload")
          .setCta()
          .onClick(() => this.plugin.reloadDefinitions())
      );

    new Setting(containerEl)
      .setName("Write example config")
      .setDesc("Create or overwrite the config file with the starter block definitions.")
      .addButton((button) =>
        button
          .setButtonText("Write sample")
          .onClick(async () => {
            const path = normalizePath(this.plugin.settings.configPath);
            await this.app.vault.adapter.write(path, DEFAULT_CONFIG_CONTENT);
            new Notice(`Custom Blocks sample config written to ${path}`);
            await this.plugin.reloadDefinitions();
          })
      );
  }
}
