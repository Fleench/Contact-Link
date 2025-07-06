import { App, Plugin, PluginSettingTab, Setting, TFile, normalizePath, Notice, stringifyYaml } from "obsidian";

interface ContactLinkSettings {
    carddavUrl: string;
    username: string;
    password: string;
    contactFolder: string;
}

const DEFAULT_SETTINGS: ContactLinkSettings = {
    carddavUrl: '',
    username: '',
    password: '',
    contactFolder: 'Contacts',
};

interface Contact {
    uid: string;
    fullName?: string;
    phone?: string;
    email?: string;
    birthday?: string;
    company?: string;
}

export default class ContactLinkPlugin extends Plugin {
    settings: ContactLinkSettings;

    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: 'sync-contacts',
            name: 'Sync contacts with CardDAV',
            callback: () => this.syncContacts()
        });

        this.addCommand({
            id: 'show-contacts-dashboard',
            name: 'Show contacts dashboard',
            checkCallback: (checking) => {
                if (checking) return true;
                this.openDashboard();
                return true;
            }
        });

        this.addSettingTab(new ContactLinkSettingTab(this.app, this));
    }

    async syncContacts() {
        const contacts = await this.loadContactsFromCardDAV();
        for (const c of contacts) {
            await this.upsertContactNote(c);
        }
        await this.pushContactsToCardDAV();
        new Notice(`Synced ${contacts.length} contacts`);
    }

    async checkAuth() {
        if (!this.settings.carddavUrl) {
            new Notice('CardDAV URL not set');
            return;
        }
        try {
            const res = await fetch(this.settings.carddavUrl, {
                method: 'OPTIONS',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64')
                }
            });
            if (res.ok) {
                new Notice('Authentication successful');
            } else {
                new Notice('Authentication failed');
            }
        } catch (e) {
            console.error(e);
            new Notice('Authentication failed');
        }
    }

    async pushContactsToCardDAV() {
        if (!this.settings.carddavUrl) return;
        const folder = normalizePath(this.settings.contactFolder);
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (!file.path.startsWith(folder)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const fm: any = cache?.frontmatter || {};
            const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
            lines.push(`UID:${fm.uid ?? ''}`);
            if (fm.fullName) lines.push(`FN:${fm.fullName}`);
            if (fm.email) lines.push(`EMAIL:${fm.email}`);
            if (fm.phone) lines.push(`TEL:${fm.phone}`);
            if (fm.birthday) lines.push(`BDAY:${fm.birthday}`);
            if (fm.company) lines.push(`ORG:${fm.company}`);
            lines.push('END:VCARD');
            await fetch(this.settings.carddavUrl, {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64'),
                    'Content-Type': 'text/vcard'
                },
                body: lines.join('\n')
            }).catch(e => console.error(e));
        }
    }

    async loadContactsFromCardDAV(): Promise<Contact[]> {
        if (!this.settings.carddavUrl) return [];
        try {
            const res = await fetch(this.settings.carddavUrl, {
                headers: { 'Authorization': 'Basic ' + Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64') }
            });
            if (!res.ok) return [];
            const text = await res.text();
            // Placeholder parser. Real CardDAV parsing is required.
            const contacts: Contact[] = [];
            text.split('BEGIN:VCARD').forEach((block) => {
                if (block.trim().length === 0) return;
                const c: Contact = { uid: '' };
                block.split(/\r?\n/).forEach(line => {
                    if (line.startsWith('UID:')) c.uid = line.substring(4).trim();
                    if (line.startsWith('FN:')) c.fullName = line.substring(3).trim();
                    if (line.startsWith('EMAIL')) c.email = line.split(':')[1].trim();
                    if (line.startsWith('TEL')) c.phone = line.split(':')[1].trim();
                    if (line.startsWith('BDAY')) c.birthday = line.split(':')[1].trim();
                    if (line.startsWith('ORG')) c.company = line.split(':')[1].trim();
                });
                if (c.uid) contacts.push(c);
            });
            return contacts;
        } catch(e) {
            console.error(e);
            new Notice('Failed to fetch contacts');
            return [];
        }
    }

    async upsertContactNote(contact: Contact) {
        const folderPath = normalizePath(this.settings.contactFolder);
        await this.app.vault.createFolder(folderPath).catch(()=>{});
        const filePath = `${folderPath}/${contact.fullName || contact.uid}.md`;
        const existing = this.app.vault.getAbstractFileByPath(filePath);
        const frontmatter: any = {
            uid: contact.uid,
            phone: contact.phone,
            email: contact.email,
            birthday: contact.birthday,
            company: contact.company
        };
        const content = `---\n${stringifyYaml(frontmatter)}---\n`;

        if (!existing) {
            await this.app.vault.create(filePath, content);
        } else if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
        }
    }

    async openDashboard() {
        const files = this.app.vault.getMarkdownFiles();
        const contacts: TFile[] = [];
        for (const f of files) {
            if (f.path.startsWith(normalizePath(this.settings.contactFolder))) {
                contacts.push(f);
            }
        }
        const lines: string[] = ['| Name | Phone | Email |', '|---|---|---|'];
        for (const f of contacts) {
            const cache = this.app.metadataCache.getFileCache(f);
            const fm: any = cache?.frontmatter || {};
            const link = this.app.fileManager.generateMarkdownLink(f, f.path, undefined);
            lines.push(`| ${link} | ${fm.phone ?? ''} | ${fm.email ?? ''} |`);
        }
        const file = await this.app.vault.create("Contacts Dashboard.md", lines.join('\n')).catch(async existing => {
            if (existing instanceof TFile) await this.app.vault.modify(existing, lines.join('\n'));
        });
        if (file instanceof TFile) {
            await this.app.workspace.getLeaf(false).openFile(file);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class ContactLinkSettingTab extends PluginSettingTab {
    plugin: ContactLinkPlugin;

    constructor(app: App, plugin: ContactLinkPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('CardDAV URL')
            .addText(text => text
                .setPlaceholder('https://example.com/carddav')
                .setValue(this.plugin.settings.carddavUrl)
                .onChange(async (value) => {
                    this.plugin.settings.carddavUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Username')
            .addText(text => text
                .setValue(this.plugin.settings.username)
                .onChange(async (value) => {
                    this.plugin.settings.username = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Password')
            .addText(text => text
                .setValue(this.plugin.settings.password)
                .onChange(async (value) => {
                    this.plugin.settings.password = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Contact folder in vault')
            .setDesc('Path where contact notes are stored')
            .addText(text => text
                .setValue(this.plugin.settings.contactFolder)
                .onChange(async (value) => {
                    this.plugin.settings.contactFolder = value.trim() || 'Contacts';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Check authentication')
                .onClick(async () => {
                    await this.plugin.checkAuth();
                }));

        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Sync now')
                .setCta()
                .onClick(async () => {
                    await this.plugin.syncContacts();
                }));
    }
}

