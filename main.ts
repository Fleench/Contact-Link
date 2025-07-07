import { App, Plugin, PluginSettingTab, Setting, TFile, normalizePath, Notice, stringifyYaml, requestUrl, DropdownComponent, SuggestModal } from "obsidian";
import { randomUUID } from "crypto";

interface FieldMap {
    fullName: string;
    phone: string;
    email: string;
    birthday: string;
    company: string;
}

interface ContactLinkSettings {
    carddavUrl: string;
    username: string;
    password: string;
    contactFolder: string;
    fieldMap: FieldMap;
    birthdayCalendarPath: string;
}

const DEFAULT_SETTINGS: ContactLinkSettings = {
    carddavUrl: '',
    username: '',
    password: '',
    contactFolder: 'Contacts',
    fieldMap: {
        fullName: 'fullName',
        phone: 'phone',
        email: 'email',
        birthday: 'birthday',
        company: 'company',
    },
    birthdayCalendarPath: 'Contacts/Birthdays.ics'
};

interface Contact {
    uid: string;
    fullName?: string;
    phone?: string;
    email?: string;
    birthday?: string;
    company?: string;
}

interface AddressBook {
    name: string;
    url: string;
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

        this.addCommand({
            id: 'import-contacts-from-csv',
            name: 'Import contacts from CSV',
            callback: () => this.importCsv()
        });

        this.addCommand({
            id: 'insert-contact-link',
            name: 'Insert contact link',
            editorCallback: (editor) => this.chooseAndInsertLink(editor)
        });

        this.addSettingTab(new ContactLinkSettingTab(this.app, this));
    }

    async syncContacts() {
        const contacts = await this.loadContactsFromCardDAV();
        for (const c of contacts) {
            await this.upsertContactNote(c);
        }
        await this.pushContactsToCardDAV();
        await this.updateBirthdayCalendar();
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
            const contact: Contact = { uid: fm.uid || randomUUID() } as Contact;
            for (const key of Object.keys(this.settings.fieldMap) as (keyof FieldMap)[]) {
                const prop = this.settings.fieldMap[key];
                (contact as any)[key] = fm[prop];
            }
            if (!contact.fullName) contact.fullName = file.basename;
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
            const xmlDoc = new DOMParser().parseFromString(list.text, 'application/xml');
            const hrefEls = Array.from(xmlDoc.getElementsByTagName('href'));
            const hrefs = hrefEls
                .map(h => h.textContent || '')
                .filter(h => h.endsWith('.vcf'));
            const contacts: Contact[] = [];
            for (const href of hrefs) {
                const url = new URL(href, this.settings.carddavUrl).toString();
                const res = await requestUrl({ url, headers: { 'Authorization': auth } });
                if (res.status < 200 || res.status >= 300) continue;
                const c = parseVCard(res.text);
                if (c.uid) contacts.push(c);
            }
            return contacts;
        } catch (e) {
            console.error(e);
            new Notice('Failed to fetch contacts');
            return [];
        }
    }

    async listAddressBooks(): Promise<AddressBook[]> {
        if (!this.settings.carddavUrl) return [];
        const auth = 'Basic ' + Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64');
        const propfind = async (url: string, depth: string, body: string) => {
            const res = await requestUrl({ url, method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': depth }, body });
            if (res.status < 200 || res.status >= 300) throw new Error(`PROPFIND ${url}`);
            return new DOMParser().parseFromString(res.text, 'application/xml');
        };
        try {
            const base = this.settings.carddavUrl.replace(/\/$/, '');
            // current-user-principal discovery
            let doc = await propfind(base, '0', '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>');
            const principalHref = doc.getElementsByTagName('href')[0]?.textContent;
            if (!principalHref) return [];
            const principalUrl = new URL(principalHref, base).toString();

            // addressbook-home-set discovery
            doc = await propfind(principalUrl, '0', '<?xml version="1.0"?><propfind xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><prop><addressbook-home-set xmlns="urn:ietf:params:xml:ns:carddav"/></prop></propfind>');
            const homeHref = doc.getElementsByTagName('href')[0]?.textContent;
            if (!homeHref) return [];
            const homeUrl = new URL(homeHref, principalUrl).toString();

            // list available address books
            doc = await propfind(homeUrl, '1', '<?xml version="1.0"?><propfind xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><prop><displayname/><resourcetype/></prop></propfind>');
            const responses = Array.from(doc.getElementsByTagName('response'));
            const books: AddressBook[] = [];
            for (const r of responses) {
                if (!r.getElementsByTagName('addressbook').length) continue;
                const href = r.getElementsByTagName('href')[0]?.textContent;
                if (!href) continue;
                const name = r.getElementsByTagName('displayname')[0]?.textContent || href;
                const url = new URL(href, homeUrl).toString();
                books.push({ name, url });
            }
            return books;
        } catch (e) {
            console.error(e);
            new Notice('Failed to fetch address books');
            return [];
        }
    }


    async upsertContactNote(contact: Contact) {
        const folderPath = normalizePath(this.settings.contactFolder);
        await this.app.vault.createFolder(folderPath).catch(()=>{});
        if (!contact.uid) contact.uid = randomUUID();
        const filePath = `${folderPath}/${contact.fullName || contact.uid}.md`;
        const existing = this.app.vault.getAbstractFileByPath(filePath);
        const frontmatter: any = { uid: contact.uid };
        for (const key of Object.keys(this.settings.fieldMap) as (keyof FieldMap)[]) {
            const prop = this.settings.fieldMap[key];
            frontmatter[prop] = (contact as any)[key];
        }
        const content = `---\n${stringifyYaml(frontmatter)}---\n`;

        if (!existing) {
            await this.app.vault.create(filePath, content);
        } else if (existing instanceof TFile) {
            const current = await this.app.vault.read(existing);
            let body = current.replace(/^---[\s\S]*?---\n/, '');
            const cache = this.app.metadataCache.getFileCache(existing);
            const fm: any = cache?.frontmatter || {};
            const diffs: string[] = [];
            for (const key of Object.keys(this.settings.fieldMap) as (keyof FieldMap)[]) {
                const prop = this.settings.fieldMap[key];
                const newVal = (contact as any)[key];
                if (fm[prop] && fm[prop] !== newVal) {
                    diffs.push(`${prop}: ${fm[prop]} -> ${newVal}`);
                }
            }
            if (diffs.length) {
                body += `\n<!-- ContactLink conflict\n${diffs.join('\n')}\n-->\n`;
            }
            await this.app.vault.modify(existing, content + body);
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
        const lines: string[] = ['| Name | Phone | Email | Mentions |', '|---|---|---|---|'];
        for (const f of contacts) {
            const cache = this.app.metadataCache.getFileCache(f);
            const fm: any = cache?.frontmatter || {};
            const link = this.app.fileManager.generateMarkdownLink(f, f.path, undefined);
            const phoneLink = fm.phone ? `[call](tel:${fm.phone})` : '';
            const mailLink = fm.email ? `[email](mailto:${fm.email})` : '';
            let mentions = 0;
            for (const file of this.app.vault.getMarkdownFiles()) {
                if (file.path === f.path) continue;
                const content = await this.app.vault.cachedRead(file);
                if (content.includes(link) || content.includes(f.basename)) mentions++;
            }
            lines.push(`| ${link} | ${phoneLink} | ${mailLink} | ${mentions} |`);
        }
        const file = await this.app.vault.create("Contacts Dashboard.md", lines.join('\n')).catch(async existing => {
            if (existing instanceof TFile) await this.app.vault.modify(existing, lines.join('\n'));
        });
        if (file instanceof TFile) {
            await this.app.workspace.getLeaf(false).openFile(file);
        }
    }

    async updateBirthdayCalendar() {
        const events: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0'];
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (!file.path.startsWith(normalizePath(this.settings.contactFolder))) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const fm: any = cache?.frontmatter || {};
            const birthday = fm[this.settings.fieldMap.birthday];
            if (birthday) {
                const uid = fm.uid || randomUUID();
                const dt = birthday.replace(/-/g, '');
                const name = fm[this.settings.fieldMap.fullName] || file.basename;
                events.push('BEGIN:VEVENT');
                events.push(`UID:${uid}`);
                events.push(`DTSTART;VALUE=DATE:${dt}`);
                events.push(`RRULE:FREQ=YEARLY`);
                events.push(`SUMMARY:${name} Birthday`);
                events.push('END:VEVENT');
            }
        }
        events.push('END:VCALENDAR');
        await this.app.vault.adapter.write(this.settings.birthdayCalendarPath, events.join('\r\n'));
    }

    async importCsv(path: string = 'contacts.csv') {
        try {
            const text = await this.app.vault.adapter.read(path);
            const rows = text.split(/\r?\n/).filter(r => r.trim());
            const headers = rows.shift()?.split(',') || [];
            for (const row of rows) {
                const values = row.split(',');
                const c: Contact = { uid: randomUUID() } as Contact;
                headers.forEach((h, i) => {
                    const key = h.trim();
                    const val = values[i]?.trim();
                    for (const mapKey of Object.keys(this.settings.fieldMap) as (keyof FieldMap)[]) {
                        if (this.settings.fieldMap[mapKey] === key) {
                            (c as any)[mapKey] = val;
                        }
                    }
                });
                await this.upsertContactNote(c);
            }
            await this.updateBirthdayCalendar();
            new Notice('Imported contacts from CSV');
        } catch (e) {
            console.error(e);
            new Notice('Failed to import CSV');
        }
    }

    async chooseAndInsertLink(editor: import("obsidian").Editor) {
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(normalizePath(this.settings.contactFolder)));
        const items = files.map(f => ({ file: f, name: f.basename }));
        const modal = new class extends SuggestModal<{file: TFile, name: string}> {
            plugin: ContactLinkPlugin;
            items: {file: TFile, name: string}[];
            constructor(app: App, plugin: ContactLinkPlugin, items: {file: TFile, name: string}[]) {
                super(app);
                this.plugin = plugin;
                this.items = items;
            }
            getSuggestions(q: string) {
                return this.items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()));
            }
            renderSuggestion(value: {file: TFile, name: string}, el: HTMLElement) {
                el.createEl('div', { text: value.name });
            }
            onChooseSuggestion(value: {file: TFile, name: string}) {
                const link = this.plugin.app.fileManager.generateMarkdownLink(value.file, value.file.path, undefined);
                editor.replaceSelection(link);
            }
        }(this.app, this, items);
        modal.open();
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

        let dropdown!: DropdownComponent;
        new Setting(containerEl)
            .setName('Address book')
            .setDesc('Choose which address book to sync')
            .addDropdown(d => {
                dropdown = d;
                d.addOption('', 'Loading...');
                d.onChange(async (value) => {
                    this.plugin.settings.carddavUrl = value;
                    await this.plugin.saveSettings();
                });
            });
        this.plugin.listAddressBooks().then(books => {
            dropdown.selectEl.innerHTML = '';
            books.forEach(b => dropdown.addOption(b.url, b.name));
            if (this.plugin.settings.carddavUrl && !books.find(b => b.url === this.plugin.settings.carddavUrl)) {
                dropdown.addOption(this.plugin.settings.carddavUrl, this.plugin.settings.carddavUrl);
            }
            dropdown.setValue(this.plugin.settings.carddavUrl);
        });

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
            .setName('Birthday calendar file')
            .setDesc('ICS file path written when syncing')
            .addText(text => text
                .setValue(this.plugin.settings.birthdayCalendarPath)
                .onChange(async value => {
                    this.plugin.settings.birthdayCalendarPath = value || 'Contacts/Birthdays.ics';
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Frontmatter mapping' });
        (Object.keys(this.plugin.settings.fieldMap) as (keyof FieldMap)[]).forEach(key => {
            new Setting(containerEl)
                .setName(key)
                .addText(text => text
                    .setValue(this.plugin.settings.fieldMap[key])
                    .onChange(async value => {
                        this.plugin.settings.fieldMap[key] = value;
                        await this.plugin.saveSettings();
                    }));
        });

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

