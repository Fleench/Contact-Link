import { App, Plugin, PluginSettingTab, Setting, TFile, normalizePath, Notice, stringifyYaml, requestUrl } from "obsidian";
import { randomUUID } from "crypto";

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

function parseVCard(text: string): Contact {
    const c: Contact = { uid: '' };
    text.split(/\r?\n/).forEach(line => {
        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        if (key === 'UID') c.uid = value;
        if (key === 'FN') c.fullName = value;
        if (key.startsWith('EMAIL')) c.email = value;
        if (key.startsWith('TEL')) c.phone = value;
        if (key.startsWith('BDAY')) c.birthday = value;
        if (key.startsWith('ORG')) c.company = value;
    });
    return c;
}

function buildVCard(contact: Contact): string {
    const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
    lines.push(`UID:${contact.uid}`);
    if (contact.fullName) lines.push(`FN:${contact.fullName}`);
    if (contact.email) lines.push(`EMAIL:${contact.email}`);
    if (contact.phone) lines.push(`TEL:${contact.phone}`);
    if (contact.birthday) lines.push(`BDAY:${contact.birthday}`);
    if (contact.company) lines.push(`ORG:${contact.company}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
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
            const res = await requestUrl({
                url: this.settings.carddavUrl,
                method: 'OPTIONS',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64')
                }
            });
            if (res.status >= 200 && res.status < 300) {
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
        const base = this.settings.carddavUrl.replace(/\/$/, "");
        const auth = 'Basic ' + Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64');
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (!file.path.startsWith(folder)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const fm: any = cache?.frontmatter || {};
            const contact: Contact = {
                uid: fm.uid || randomUUID(),
                fullName: fm.fullName || file.basename,
                phone: fm.phone,
                email: fm.email,
                birthday: fm.birthday,
                company: fm.company,
            };
            const vcard = buildVCard(contact);
            const url = `${base}/${contact.uid}.vcf`;
            await requestUrl({
                url,
                method: 'PUT',
                headers: {
                    'Authorization': auth,
                    'Content-Type': 'text/vcard'
                },
                body: vcard
            }).catch(e => console.error(e));
        }
    }

    async loadContactsFromCardDAV(): Promise<Contact[]> {
        if (!this.settings.carddavUrl) return [];
        try {
            const auth = 'Basic ' + Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64');
            const list = await requestUrl({
                url: this.settings.carddavUrl,
                method: 'PROPFIND',
                headers: {
                    'Authorization': auth,
                    'Depth': '1'
                },
                body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><href/></prop></propfind>'
            });
            if (list.status < 200 || list.status >= 300) return [];
            const xml = list.text;
            const hrefs = Array.from(xml.matchAll(/<href>([^<]+\.vcf)<\/href>/g)).map(m => m[1]);
            const contacts: Contact[] = [];
            for (const href of hrefs) {
                const url = new URL(href, this.settings.carddavUrl).toString();
                const res = await requestUrl({ url, headers: { 'Authorization': auth } });
                if (res.status < 200 || res.status >= 300) continue;
                const card = res.text;
                const c = parseVCard(card);
                if (c.uid) contacts.push(c);
            }
            return contacts;
        } catch (e) {
            console.error(e);
            new Notice('Failed to fetch contacts');
            return [];
        }
    }

    async upsertContactNote(contact: Contact) {
        const folderPath = normalizePath(this.settings.contactFolder);
        await this.app.vault.createFolder(folderPath).catch(()=>{});
        if (!contact.uid) contact.uid = randomUUID();
        const filePath = `${folderPath}/${contact.fullName || contact.uid}.md`;
        const existing = this.app.vault.getAbstractFileByPath(filePath);
        const frontmatter: any = {
            uid: contact.uid,
            fullName: contact.fullName,
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

