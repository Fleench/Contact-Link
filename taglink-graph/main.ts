// main.ts
// Modified by ChatGPT Codex 2025-12-05
import { Plugin, TFile, ItemView, WorkspaceLeaf, Notice, PluginSettingTab, App, Setting } from 'obsidian';

interface TagLinkData {
    source: string;
    target: string;
    sharedTagCount: number;
    sharedTags: string[];
}

interface GraphNode {
    id: string;
    label: string;
    path: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
}

const VIEW_TYPE_TAG_GRAPH = 'tag-link-graph-view';

interface TagLinkGraphSettings {
    ignoredNotePatterns: string;
    ignoreOrphans: boolean;
}

const DEFAULT_SETTINGS: TagLinkGraphSettings = {
    ignoredNotePatterns: '',
    ignoreOrphans: false,
};

class TagLinkGraphView extends ItemView {
    plugin: TagLinkGraphPlugin;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    legend!: HTMLDivElement;
    resizeObserver: ResizeObserver | null = null;
    handleMouseDown = this.onMouseDown.bind(this);
    handleMouseMove = this.onMouseMove.bind(this);
    handleMouseUp = this.onMouseUp.bind(this);
    handleDoubleClick = this.onDoubleClick.bind(this);
    nodes: GraphNode[] = [];
    links: TagLinkData[] = [];
    isDragging = false;
    draggedNode: GraphNode | null = null;
    isSimulating = true;

    constructor(leaf: WorkspaceLeaf, plugin: TagLinkGraphPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_TAG_GRAPH;
    }

    getDisplayText(): string {
        return 'Tag-Link Graph';
    }

    getIcon(): string {
        return 'git-fork';
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass('tag-link-graph-view');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.height = '100%';
        container.style.boxSizing = 'border-box';

        console.log('[Tag-Link Graph] View opened, setting up canvas...');

        // Legend/status header similar to Obsidian graph view
        this.legend = container.createEl('div', { cls: 'tag-link-graph-legend' });
        this.legend.setText('Loading tag graph...');

        // Create canvas wrapper so it can inherit height from the pane
        const wrapper = container.createEl('div', { cls: 'tag-link-graph-wrapper' });
        wrapper.style.flex = '1 1 auto';
        this.canvas = wrapper.createEl('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.ctx = this.canvas.getContext('2d')!;
        this.resizeCanvas();

        // Add mouse interaction
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('dblclick', this.handleDoubleClick);

        // Handle resize
        this.resizeObserver = new ResizeObserver(() => {
            this.resizeCanvas();
            this.draw();
        });
        this.resizeObserver.observe(container);

        // Load and display graph
        await this.loadGraph();
        this.startSimulation();
    }

    

    startSimulation() {
        console.log('[Tag-Link Graph] Starting force simulation loop');
        const animate = () => {
            if (this.isSimulating) {
                this.updatePhysics();
            }
            this.draw();
            requestAnimationFrame(animate);
        };
        animate();
    }

// Replace your resizeCanvas, loadGraph, updatePhysics, and draw methods with these fixed versions:

resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;

    if (width === 0 || height === 0) {
        const parent = this.canvas.parentElement as HTMLElement | null;
        width = parent?.clientWidth ?? 720;
        height = parent?.clientHeight ?? 480;
        console.log('[Tag-Link Graph] Canvas had zero size, using fallback size', { width, height });
    }

    if (width === 0 || height === 0) return;

    const pixelRatio = window.devicePixelRatio || 1;
    
    // Store CSS dimensions for drawing calculations
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    
    // Set actual canvas size with pixel ratio for crisp rendering
    this.canvas.width = width * pixelRatio;
    this.canvas.height = height * pixelRatio;
    
    // Scale context to match pixel ratio
    this.ctx?.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx?.scale(pixelRatio, pixelRatio);
    
    console.log('[Tag-Link Graph] Canvas resized', { width, height, pixelRatio });
}

    async loadGraph() {
        try {
            console.log('[Tag-Link Graph] Starting graph load...');
            const files = this.plugin.getTargetNotes();
            console.log('[Tag-Link Graph] Note candidates', files.map(f => f.path));

            if (files.length === 0) {
                new Notice('No notes found to build the tag graph.');
                this.legend.setText('No notes with tags were found.');
                return;
            }

            const noteToTags = await this.plugin.buildNoteTagsMap(files);
            this.links = this.plugin.generateTagConnections(noteToTags);

            const allTags = this.plugin.collectAllTags(noteToTags);
            let tagNodes = Array.from(allTags);

            if (this.plugin.settings.ignoreOrphans) {
                const connectedTags = new Set<string>();
                this.links.forEach(link => {
                    connectedTags.add(link.source);
                    connectedTags.add(link.target);
                });

                tagNodes = tagNodes.filter(tag => connectedTags.has(tag));
                this.links = this.links.filter(link => connectedTags.has(link.source) && connectedTags.has(link.target));

                console.log('[Tag-Link Graph] Filtered orphaned tags', {
                    nodes: tagNodes.length,
                    connections: this.links.length
                });
            }

            if (tagNodes.length === 0 || this.links.length === 0) {
                new Notice('No line-level tag co-occurrences found.');
                this.legend.setText('No line-level tag connections found.');
                return;
            }

            if (noteToTags.size === 0) {
                new Notice('No tags found in the scanned notes.');
                this.legend.setText('No tags found in the scanned notes.');
                return;
            }

            // Use CSS dimensions (not canvas.width/height which are scaled by pixelRatio)
            const rect = this.canvas.getBoundingClientRect();
            const center = { x: rect.width / 2, y: rect.height / 2 };

            console.log('[Tag-Link Graph] Initializing nodes at center:', center);

            this.nodes = tagNodes
                .map(tag => ({
                    id: tag,
                    label: `#${tag}`,
                    path: tag,
                    x: center.x + (Math.random() - 0.5) * 100,
                    y: center.y + (Math.random() - 0.5) * 100,
                    vx: 0,
                    vy: 0
                }));

            console.log('[Tag-Link Graph] Nodes initialized:', this.nodes.map(n =>
                ({label: n.label, x: n.x, y: n.y})
            ));

            const legendText = `${this.nodes.length} tags, ${this.links.length} line-level tag links`;
            this.legend.setText(legendText);
            new Notice(`Loaded ${legendText}`);
            console.log('[Tag-Link Graph] Graph data ready', { nodes: this.nodes.length, links: this.links.length });
        } catch (error) {
            console.error('[Tag-Link Graph] Error while loading graph:', error);
            new Notice('Error loading tag graph. Check console for details.');
            this.legend.setText('Failed to load graph');
        }
    }

updatePhysics() {
    if (this.nodes.length === 0) return;
    
    const repulsion = 3000;  // Reduced from 5000
    const attraction = 0.005; // Reduced from 0.01
    const damping = 0.9;      // Increased from 0.85 for more stability
    const centerPull = 0.002; // Increased from 0.001

    // Use CSS dimensions for center calculation
    const rect = this.canvas.getBoundingClientRect();
    const center = { x: rect.width / 2, y: rect.height / 2 };

    // Reset forces
    for (const node of this.nodes) {
        if (!node.vx) node.vx = 0;
        if (!node.vy) node.vy = 0;
    }

    // Apply forces
    for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        
        // Repulsion between all nodes
        for (let j = i + 1; j < this.nodes.length; j++) {
            const other = this.nodes[j];
            const dx = node.x! - other.x!;
            const dy = node.y! - other.y!;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq) || 1;
            
            // Prevent division by very small numbers
            if (dist < 1) continue;
            
            const force = repulsion / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            node.vx! += fx;
            node.vy! += fy;
            other.vx! -= fx;
            other.vy! -= fy;
        }

        // Center pull - stronger for nodes far from center
        const dcx = center.x - node.x!;
        const dcy = center.y - node.y!;
        const distFromCenter = Math.sqrt(dcx * dcx + dcy * dcy);
        const centerForce = centerPull * distFromCenter;
        node.vx! += dcx * centerForce;
        node.vy! += dcy * centerForce;
    }

    // Attraction along links
    for (const link of this.links) {
        const source = this.nodes.find(n => n.id === link.source);
        const target = this.nodes.find(n => n.id === link.target);
        if (!source || !target) continue;
        
        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = attraction * dist * Math.sqrt(link.sharedTagCount);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        source.vx! += fx;
        source.vy! += fy;
        target.vx! -= fx;
        target.vy! -= fy;
    }

    // Update positions with velocity clamping
    const maxVelocity = 10; // Clamp maximum velocity
    for (const node of this.nodes) {
        if (this.draggedNode === node) continue;
        
        // Clamp velocities
        const speed = Math.sqrt(node.vx! * node.vx! + node.vy! * node.vy!);
        if (speed > maxVelocity) {
            node.vx! = (node.vx! / speed) * maxVelocity;
            node.vy! = (node.vy! / speed) * maxVelocity;
        }
        
        node.vx! *= damping;
        node.vy! *= damping;
        node.x! += node.vx!;
        node.y! += node.vy!;
        
        // Keep nodes within bounds with some margin
        const margin = 50;
        node.x! = Math.max(margin, Math.min(rect.width - margin, node.x!));
        node.y! = Math.max(margin, Math.min(rect.height - margin, node.y!));
    }

    // Slow down over time
    const totalVelocity = this.nodes.reduce((sum, n) => 
        sum + Math.sqrt(n.vx! * n.vx! + n.vy! * n.vy!), 0
    );
    const avgVelocity = totalVelocity / this.nodes.length;
    
    if (avgVelocity < 0.05) {
        this.isSimulating = false;
        console.log('[Tag-Link Graph] Simulation settled');
    }
}

draw() {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // Subtle glow background
    const gradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.1,
        width / 2,
        height / 2,
        Math.max(width, height)
    );
    gradient.addColorStop(0, 'rgba(98, 114, 164, 0.12)');
    gradient.addColorStop(1, 'rgba(10, 10, 20, 0.08)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw links first (behind nodes)
    ctx.shadowBlur = 0;
    for (const link of this.links) {
        const source = this.nodes.find(n => n.id === link.source);
        const target = this.nodes.find(n => n.id === link.target);
        if (!source || !target) continue;

        let color = '#6272a4';
        if (link.sharedTagCount >= 5) color = '#ff5555';
        else if (link.sharedTagCount >= 3) color = '#f1fa8c';

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.min(link.sharedTagCount * 0.5, 3);
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(source.x!, source.y!);
        ctx.lineTo(target.x!, target.y!);
        ctx.stroke();
    }

    // Draw nodes on top
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    
    for (const node of this.nodes) {
        // Node circle with glow
        ctx.shadowColor = '#bd93f9';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#bd93f9';
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Node border
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#44475a';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Node label
        ctx.fillStyle = '#f8f8f2';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add text background for readability
        const metrics = ctx.measureText(node.label);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(
            node.x! - metrics.width / 2 - 2,
            node.y! - 20,
            metrics.width + 4,
            14
        );
        
        ctx.fillStyle = '#f8f8f2';
        ctx.fillText(node.label, node.x!, node.y! - 13);
    }

    ctx.restore();
    
    // Debug info every 60 frames
    if (Math.random() < 0.016) {
        console.log('[Tag-Link Graph] Drawing frame with', this.nodes.length, 'nodes');
    }
}

    onMouseDown(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicking on a node
        for (const node of this.nodes) {
            const dx = x - node.x!;
            const dy = y - node.y!;
            if (Math.sqrt(dx * dx + dy * dy) < 8) {
                this.isDragging = true;
                this.draggedNode = node;
                this.isSimulating = false;
                return;
            }
        }
    }

    onMouseMove(e: MouseEvent) {
        if (this.isDragging && this.draggedNode) {
            const rect = this.canvas.getBoundingClientRect();
            this.draggedNode.x = e.clientX - rect.left;
            this.draggedNode.y = e.clientY - rect.top;
            this.draggedNode.vx = 0;
            this.draggedNode.vy = 0;
        }
    }

    onMouseUp() {
        this.isDragging = false;
        this.draggedNode = null;
        this.isSimulating = true;
    }

    onDoubleClick(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if double-clicking on a node
        for (const node of this.nodes) {
            const dx = x - node.x!;
            const dy = y - node.y!;
            if (Math.sqrt(dx * dx + dy * dy) < 8) {
                // Open the note
                const file = this.app.vault.getAbstractFileByPath(node.path);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf(false).openFile(file);
                }
                return;
            }
        }
    }

    async onClose() {
        console.log('[Tag-Link Graph] Closing view and cleaning up listeners');
        this.resizeObserver?.disconnect();
        this.canvas?.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas?.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas?.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas?.removeEventListener('dblclick', this.handleDoubleClick);
    }
}

export default class TagLinkGraphPlugin extends Plugin {
    settings!: TagLinkGraphSettings;

    async onload() {
        console.log('Loading Tag-Link Graph Plugin');
        await this.loadSettings();

        // Register the custom view
        this.registerView(
            VIEW_TYPE_TAG_GRAPH,
            (leaf) => new TagLinkGraphView(leaf, this)
        );

        // Command to open visual graph
        this.addCommand({
            id: 'open-taglink-graph-visual',
            name: 'Open Tag-Connected Graph (Visual)',
            callback: () => this.openVisualGraph()
        });

        // Command to generate markdown report
        this.addCommand({
            id: 'open-taglink-graph-report',
            name: 'Generate Tag-Connected Graph Report',
            callback: () => this.openTagLinkReport()
        });

        // Add ribbon icon
        this.addRibbonIcon('git-fork', 'Tag-Connected Graph', () => {
            this.openVisualGraph();
        });

        this.addSettingTab(new TagLinkGraphSettingTab(this.app, this));
    }

    async openVisualGraph() {
        const { workspace } = this.app;

        console.log('[Tag-Link Graph] Opening visual graph in a fresh tab');

        // Always create a fresh tab so the view appears on mobile and desktop
        const leaf = workspace.getLeaf('tab');
        await leaf.setViewState({
            type: VIEW_TYPE_TAG_GRAPH,
            active: true,
        });

        workspace.revealLeaf(leaf);
    }

    async openTagLinkReport() {
        try {
            console.log('[Tag-Link Graph] Starting tag-link report generation');
            const files = this.getTargetNotes();

            if (files.length === 0) {
                new Notice('No notes found!');
                console.log('[Tag-Link Graph] No notes found during report generation');
                return;
            }

            new Notice(`Found ${files.length} notes. Building report...`);

            const noteToTags = await this.buildNoteTagsMap(files);
            let connections = this.generateTagConnections(noteToTags);
            let tags = Array.from(this.collectAllTags(noteToTags));

            if (this.settings.ignoreOrphans) {
                const connectedTags = new Set<string>();
                connections.forEach(link => {
                    connectedTags.add(link.source);
                    connectedTags.add(link.target);
                });

                tags = tags.filter(tag => connectedTags.has(tag));
                connections = connections.filter(link => connectedTags.has(link.source) && connectedTags.has(link.target));
            }

            if (connections.length === 0 || tags.length === 0) {
                new Notice('No line-level tag co-occurrences found!');
                console.log('[Tag-Link Graph] No connections detected for report');
                return;
            }

            await this.createGraphVisualization(tags.length, connections, files.length);
            new Notice(`Created report with ${connections.length} connections!`);

        } catch (error) {
            console.error('Error creating tag-link report:', error);
            new Notice('Error creating report. Check console for details.');
        }
    }

    getTargetNotes(): TFile[] {
        console.log('[Tag-Link Graph] Scanning vault for markdown notes...');
        const allFiles = this.app.vault.getMarkdownFiles();
        const filtered = allFiles.filter(file => !this.shouldIgnoreFile(file));

        console.log('[Tag-Link Graph] Notes after ignore filters', {
            total: allFiles.length,
            included: filtered.length,
            ignoredPatterns: this.settings.ignoredNotePatterns
        });

        return filtered;
    }

    private shouldIgnoreFile(file: TFile): boolean {
        const patterns = this.settings.ignoredNotePatterns
            .split(/\r?\n/)
            .map(pattern => pattern.trim())
            .filter(Boolean);

        return patterns.some(pattern => file.path.includes(pattern));
    }

    async buildNoteTagsMap(files: TFile[]): Promise<Map<string, Map<number, Set<string>>>> {
        const noteToTags = new Map<string, Map<number, Set<string>>>();

        for (const file of files) {
            const perLineTags = new Map<number, Set<string>>();

            const metadata = this.app.metadataCache.getFileCache(file);

            if (metadata?.tags) {
                metadata.tags.forEach(tag => {
                    const cleanTag = tag.tag.startsWith('#') ? tag.tag.slice(1) : tag.tag;
                    const lineTags = perLineTags.get(0) ?? new Set<string>();
                    lineTags.add(cleanTag);
                    perLineTags.set(0, lineTags);
                });
            }

            const content = await this.app.vault.read(file);
            const inlineTags = this.extractInlineTags(content);

            inlineTags.forEach((tags, lineNumber) => {
                const existing = perLineTags.get(lineNumber) ?? new Set<string>();
                tags.forEach(tag => existing.add(tag));
                perLineTags.set(lineNumber, existing);
            });

            const hasTags = Array.from(perLineTags.values()).some(set => set.size > 0);

            if (hasTags) {
                noteToTags.set(file.path, perLineTags);
                console.log('[Tag-Link Graph] Tags found for file', file.path, Array.from(perLineTags.entries()));
            }
        }

        return noteToTags;
    }

    extractInlineTags(content: string): Map<number, string[]> {
        const tagRegex = /#([a-zA-Z][a-zA-Z0-9/_-]*)/g;
        const tagsByLine = new Map<number, string[]>();

        const lines = content.split(/\r?\n/);

        lines.forEach((line, index) => {
            const tags: string[] = [];
            let match;

            tagRegex.lastIndex = 0;

            while ((match = tagRegex.exec(line)) !== null) {
                tags.push(match[1]);
            }

            if (tags.length > 0) {
                tagsByLine.set(index + 1, tags);
            }
        });

        return tagsByLine;
    }

    generateTagConnections(noteToTags: Map<string, Map<number, Set<string>>>): TagLinkData[] {
        const pairCounts = new Map<string, { sharedTagCount: number; sharedTags: string[] }>();

        console.log('[Tag-Link Graph] Building line-level tag co-occurrence connections');

        for (const [, lineMap] of noteToTags) {
            for (const [, tags] of lineMap) {
                if (tags.size < 2) continue;

                const uniqueTags = Array.from(tags).sort();

                for (let i = 0; i < uniqueTags.length; i++) {
                    for (let j = i + 1; j < uniqueTags.length; j++) {
                        const source = uniqueTags[i];
                        const target = uniqueTags[j];
                        const key = `${source}|${target}`;

                        if (!pairCounts.has(key)) {
                            pairCounts.set(key, { sharedTagCount: 0, sharedTags: [source, target] });
                        }

                        const data = pairCounts.get(key)!;
                        data.sharedTagCount += 1;
                    }
                }
            }
        }

        const connections: TagLinkData[] = Array.from(pairCounts.entries()).map(([key, data]) => {
            const [source, target] = key.split('|');
            return {
                source,
                target,
                sharedTagCount: data.sharedTagCount,
                sharedTags: data.sharedTags
            };
        });

        connections.sort((a, b) => b.sharedTagCount - a.sharedTagCount);

        console.log('[Tag-Link Graph] Connections generated', { count: connections.length });

        return connections;
    }

    collectAllTags(noteToTags: Map<string, Map<number, Set<string>>>): Set<string> {
        const tags = new Set<string>();

        for (const [, lineMap] of noteToTags) {
            for (const [, lineTags] of lineMap) {
                lineTags.forEach(tag => tags.add(tag));
            }
        }

        return tags;
    }

    async createGraphVisualization(tagCount: number, connections: TagLinkData[], noteCount: number) {
        const graphFileName = 'Tag-Link Graph Report.md';
        const graphPath = `${graphFileName}`;

        console.log('[Tag-Link Graph] Writing markdown report to', graphPath);

        let content = '# Tag Co-occurrence Report\n\n';
        content += `Generated: ${new Date().toLocaleString()}\n\n`;
        content += `**${tagCount} tags** across **${noteCount} notes** with **${connections.length} line-level connections**\n\n`;

        const strong = connections.filter(c => c.sharedTagCount >= 5);
        const medium = connections.filter(c => c.sharedTagCount >= 3 && c.sharedTagCount < 5);
        const weak = connections.filter(c => c.sharedTagCount < 3);

        content += '## Connection Strength\n\n';
        content += `- ?? Strong (5+ co-occurring lines): ${strong.length} connections\n`;
        content += `- ?? Medium (3-4 co-occurring lines): ${medium.length} connections\n`;
        content += `- ?? Weak (1-2 co-occurring lines): ${weak.length} connections\n\n`;

        content += '## All Connections\n\n';
        
        for (const conn of connections) {
            const emoji = conn.sharedTagCount >= 5 ? '??' : conn.sharedTagCount >= 3 ? '??' : '??';

            content += `### ${emoji} #${conn.source}  #${conn.target}\n`;
            content += `**${conn.sharedTagCount} line(s) with both tags:** ${conn.sharedTags.map(t => `#${t}`).join(', ')}\n\n`;
        }

        const existingFile = this.app.vault.getAbstractFileByPath(graphPath);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
        } else {
            await this.app.vault.create(graphPath, content);
        }

        const file = this.app.vault.getAbstractFileByPath(graphPath);
        if (file instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
            console.log('[Tag-Link Graph] Report opened in a new leaf');
        }
    }

    getNoteName(path: string): string {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return file.basename;
        }
        return path;
    }

    onunload() {
        console.log('Unloading Tag-Link Graph Plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class TagLinkGraphSettingTab extends PluginSettingTab {
    plugin: TagLinkGraphPlugin;

    constructor(app: App, plugin: TagLinkGraphPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Tag-Link Graph Settings' });

        new Setting(containerEl)
            .setName('Ignore notes by path')
            .setDesc('Enter substrings (one per line). Any note whose path contains one of these substrings will be skipped.')
            .addTextArea(text => text
                .setPlaceholder('e.g. Templates/\nArchive\nPrivate.md')
                .setValue(this.plugin.settings.ignoredNotePatterns)
                .onChange(async (value) => {
                    this.plugin.settings.ignoredNotePatterns = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Ignore orphaned notes')
            .setDesc('When enabled, notes without any shared tag connections are removed from the graph and report.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ignoreOrphans)
                .onChange(async (value) => {
                    this.plugin.settings.ignoreOrphans = value;
                    await this.plugin.saveSettings();
                }));
    }
}
