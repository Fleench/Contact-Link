import { App, Plugin, PluginSettingTab, Setting, TFile, normalizePath, Notice, stringifyYaml, requestUrl } from "obsidian";
import { randomUUID } from "crypto";

interface ContactLinkSettings {
    apiBaseUrl: string;
    accessToken: string;
    contactFolder: string;
}

const DEFAULT_SETTINGS: ContactLinkSettings = {
    apiBaseUrl: 'https://contacts.zoho.com/api',
    accessToken: '',
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
            name: 'Sync contacts with Zoho',
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
        const contacts = await this.loadContactsFromZoho();
        for (const c of contacts) {
            await this.upsertContactNote(c);
        }
        await this.pushContactsToZoho();
        new Notice(`Synced ${contacts.length} contacts`);
    }

    async checkAuth() {
        if (!this.settings.apiBaseUrl || !this.settings.accessToken) {
            new Notice('Zoho API settings not complete');
            return;
        }
        try {
            const res = await requestUrl({
                url: `${this.settings.apiBaseUrl}/contacts?per_page=1`,
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.settings.accessToken}`
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

    async pushContactsToZoho() {
        if (!this.settings.apiBaseUrl || !this.settings.accessToken) return;
        const folder = normalizePath(this.settings.contactFolder);
        const base = this.settings.apiBaseUrl.replace(/\/$/, "");
        const auth = `Zoho-oauthtoken ${this.settings.accessToken}`;
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
            const payload = {
                id: contact.uid,
                full_name: contact.fullName,
                phone: contact.phone,
                email: contact.email,
                date_of_birth: contact.birthday,
                company: contact.company
            };
            await requestUrl({
                url: `${base}/contacts/${contact.uid}`,
                method: 'PUT',
                headers: {
                    'Authorization': auth,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }).catch(async () => {
                await requestUrl({
                    url: `${base}/contacts`,
                    method: 'POST',
                    headers: {
                        'Authorization': auth,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }).catch(e => console.error(e));
            });
        }
    }

    async loadContactsFromZoho(): Promise<Contact[]> {
        if (!this.settings.apiBaseUrl || !this.settings.accessToken) return [];
        try {
            const res = await requestUrl({
                url: `${this.settings.apiBaseUrl}/contacts`,
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.settings.accessToken}`
                }
            });
            if (res.status < 200 || res.status >= 300) return [];
            const data = JSON.parse(res.text);
            const contacts: Contact[] = [];
            for (const item of data.contacts || []) {
                contacts.push({
                    uid: item.id || item.contact_id || randomUUID(),
                    fullName: item.full_name || `${item.first_name ?? ''} ${item.last_name ?? ''}`.trim(),
                    phone: item.phone,
                    email: item.email,
                    birthday: item.date_of_birth,
                    company: item.company
                });
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
            .setName('Zoho API base URL')
            .addText(text => text
                .setPlaceholder('https://contacts.zoho.com/api')
                .setValue(this.plugin.settings.apiBaseUrl)
                .onChange(async (value) => {
                    this.plugin.settings.apiBaseUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Access token')
            .addText(text => text
                .setValue(this.plugin.settings.accessToken)
                .onChange(async (value) => {
                    this.plugin.settings.accessToken = value;
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

