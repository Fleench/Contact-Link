// main.ts
// Modified by ChatGPT Codex 2025-05-14
import { Plugin, TFile, ItemView, WorkspaceLeaf, Notice } from 'obsidian';

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

class TagLinkGraphView extends ItemView {
    plugin: TagLinkGraphPlugin;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
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

        // Create canvas
        this.canvas = container.createEl('canvas');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.ctx = this.canvas.getContext('2d')!;

        // Add mouse interaction
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
            this.draw();
        });
        resizeObserver.observe(container);

        // Load and display graph
        await this.loadGraph();
        this.startSimulation();
    }

    async loadGraph() {
        const files = this.plugin.getDailyNotes();
        if (files.length === 0) {
            new Notice('No daily notes found!');
            return;
        }

        const noteToTags = await this.plugin.buildNoteTagsMap(files);
        this.links = this.plugin.generateTagConnections(noteToTags);

        // Initialize nodes with random positions
        const center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        this.nodes = files.map(file => ({
            id: file.path,
            label: file.basename,
            path: file.path,
            x: center.x + (Math.random() - 0.5) * 200,
            y: center.y + (Math.random() - 0.5) * 200,
            vx: 0,
            vy: 0
        }));

        new Notice(`Loaded ${this.nodes.length} notes with ${this.links.length} tag connections`);
    }

    startSimulation() {
        const animate = () => {
            if (this.isSimulating) {
                this.updatePhysics();
            }
            this.draw();
            requestAnimationFrame(animate);
        };
        animate();
    }

    updatePhysics() {
        const repulsion = 5000;
        const attraction = 0.01;
        const damping = 0.85;
        const centerPull = 0.001;

        const center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };

        // Apply forces
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            
            // Repulsion between all nodes
            for (let j = 0; j < this.nodes.length; j++) {
                if (i === j) continue;
                const other = this.nodes[j];
                const dx = node.x! - other.x!;
                const dy = node.y! - other.y!;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = repulsion / (dist * dist);
                node.vx! += (dx / dist) * force;
                node.vy! += (dy / dist) * force;
            }

            // Center pull
            const dcx = center.x - node.x!;
            const dcy = center.y - node.y!;
            node.vx! += dcx * centerPull;
            node.vy! += dcy * centerPull;
        }

        // Attraction along links
        for (const link of this.links) {
            const source = this.nodes.find(n => n.id === link.source)!;
            const target = this.nodes.find(n => n.id === link.target)!;
            const dx = target.x! - source.x!;
            const dy = target.y! - source.y!;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = attraction * dist * link.sharedTagCount;
            source.vx! += dx * force;
            source.vy! += dy * force;
            target.vx! -= dx * force;
            target.vy! -= dy * force;
        }

        // Update positions
        for (const node of this.nodes) {
            if (this.draggedNode === node) continue;
            node.vx! *= damping;
            node.vy! *= damping;
            node.x! += node.vx!;
            node.y! += node.vy!;
        }

        // Slow down over time
        const maxVelocity = Math.max(...this.nodes.map(n => 
            Math.sqrt(n.vx! * n.vx! + n.vy! * n.vy!)
        ));
        if (maxVelocity < 0.1) {
            this.isSimulating = false;
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw links
        for (const link of this.links) {
            const source = this.nodes.find(n => n.id === link.source);
            const target = this.nodes.find(n => n.id === link.target);
            if (!source || !target) continue;

            // Color based on strength
            let color = '#6272a4';
            if (link.sharedTagCount >= 5) color = '#ff5555';
            else if (link.sharedTagCount >= 3) color = '#f1fa8c';

            ctx.strokeStyle = color;
            ctx.lineWidth = Math.min(link.sharedTagCount, 5);
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.moveTo(source.x!, source.y!);
            ctx.lineTo(target.x!, target.y!);
            ctx.stroke();
        }

        // Draw nodes
        ctx.globalAlpha = 1;
        for (const node of this.nodes) {
            // Node circle
            ctx.fillStyle = '#bd93f9';
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#44475a';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Node label
            ctx.fillStyle = '#f8f8f2';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(node.label, node.x!, node.y! - 15);
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
        // Cleanup
    }
}

export default class TagLinkGraphPlugin extends Plugin {
    async onload() {
        console.log('Loading Tag-Link Graph Plugin');

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
    }

    async openVisualGraph() {
        const { workspace } = this.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_TAG_GRAPH);

        if (leaves.length > 0) {
            // If view already exists, reveal it
            leaf = leaves[0];
        } else {
            // Create new leaf
            leaf = workspace.getRightLeaf(false);
            await leaf!.setViewState({
                type: VIEW_TYPE_TAG_GRAPH,
                active: true,
            });
        }

        workspace.revealLeaf(leaf!);
    }

    async openTagLinkReport() {
        try {
            const files = this.getDailyNotes();
            
            if (files.length === 0) {
                new Notice('No daily notes found!');
                return;
            }

            new Notice(`Found ${files.length} daily notes. Building report...`);

            const noteToTags = await this.buildNoteTagsMap(files);
            const connections = this.generateTagConnections(noteToTags);

            if (connections.length === 0) {
                new Notice('No shared tags found between notes!');
                return;
            }

            await this.createGraphVisualization(files, connections);
            new Notice(`Created report with ${connections.length} connections!`);

        } catch (error) {
            console.error('Error creating tag-link report:', error);
            new Notice('Error creating report. Check console for details.');
        }
    }

    getDailyNotes(): TFile[] {
        const allFiles = this.app.vault.getMarkdownFiles();
        
        return allFiles.filter(file => {
            const isDailyFolder = file.path.startsWith('Daily/');
            const isDailyPattern = /\d{4}-\d{2}-\d{2}/.test(file.basename);
            return isDailyFolder || isDailyPattern;
        });
    }

    async buildNoteTagsMap(files: TFile[]): Promise<Map<string, Set<string>>> {
        const noteToTags = new Map<string, Set<string>>();

        for (const file of files) {
            const tags = new Set<string>();
            
            const metadata = this.app.metadataCache.getFileCache(file);
            
            if (metadata?.tags) {
                metadata.tags.forEach(tag => {
                    const cleanTag = tag.tag.startsWith('#') ? tag.tag.slice(1) : tag.tag;
                    tags.add(cleanTag);
                });
            }

            const content = await this.app.vault.read(file);
            const inlineTags = this.extractInlineTags(content);
            inlineTags.forEach(tag => tags.add(tag));

            if (tags.size > 0) {
                noteToTags.set(file.path, tags);
            }
        }

        return noteToTags;
    }

    extractInlineTags(content: string): string[] {
        const tagRegex = /#([a-zA-Z][a-zA-Z0-9/_-]*)/g;
        const tags: string[] = [];
        let match;

        while ((match = tagRegex.exec(content)) !== null) {
            tags.push(match[1]);
        }

        return tags;
    }

    generateTagConnections(noteToTags: Map<string, Set<string>>): TagLinkData[] {
        const connections: TagLinkData[] = [];
        const paths = Array.from(noteToTags.keys());

        for (let i = 0; i < paths.length; i++) {
            for (let j = i + 1; j < paths.length; j++) {
                const path1 = paths[i];
                const path2 = paths[j];
                const tags1 = noteToTags.get(path1)!;
                const tags2 = noteToTags.get(path2)!;

                const commonTags = Array.from(tags1).filter(tag => tags2.has(tag));

                if (commonTags.length > 0) {
                    connections.push({
                        source: path1,
                        target: path2,
                        sharedTagCount: commonTags.length,
                        sharedTags: commonTags
                    });
                }
            }
        }

        connections.sort((a, b) => b.sharedTagCount - a.sharedTagCount);

        return connections;
    }

    async createGraphVisualization(files: TFile[], connections: TagLinkData[]) {
        const graphFileName = 'Tag-Link Graph Report.md';
        const graphPath = `${graphFileName}`;

        let content = '# Tag-Connected Daily Notes Report\n\n';
        content += `Generated: ${new Date().toLocaleString()}\n\n`;
        content += `**${files.length} notes** connected by **${connections.length} shared-tag relationships**\n\n`;

        const strong = connections.filter(c => c.sharedTagCount >= 5);
        const medium = connections.filter(c => c.sharedTagCount >= 3 && c.sharedTagCount < 5);
        const weak = connections.filter(c => c.sharedTagCount < 3);

        content += '## Connection Strength\n\n';
        content += `- ?? Strong (5+ tags): ${strong.length} connections\n`;
        content += `- ?? Medium (3-4 tags): ${medium.length} connections\n`;
        content += `- ?? Weak (1-2 tags): ${weak.length} connections\n\n`;

        content += '## All Connections\n\n';
        
        for (const conn of connections) {
            const sourceName = this.getNoteName(conn.source);
            const targetName = this.getNoteName(conn.target);
            const emoji = conn.sharedTagCount >= 5 ? '??' : conn.sharedTagCount >= 3 ? '??' : '??';
            
            content += `### ${emoji} [[${sourceName}]]  [[${targetName}]]\n`;
            content += `**${conn.sharedTagCount} shared tags:** ${conn.sharedTags.map(t => `#${t}`).join(', ')}\n\n`;
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
}
