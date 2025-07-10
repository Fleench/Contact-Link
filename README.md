# Contact Link

Contact Link synchronizes your Obsidian vault with a CardDAV server so your notes can store real contact information. The plugin creates and updates Markdown files based on your address book and lets you edit contacts directly from Obsidian.

## Features

- Two-way sync with your CardDAV server.
- Customisable frontmatter mapping for contact fields.
- Relationship field to track how contacts are related.
- Import contacts from a CSV file (`contacts.csv`).
- Dashboard with responsive contact cards, quick actions, mention counts, search and filters.
- Dashboard metrics summarizing totals and upcoming birthdays.
- Birthday calendar exported as an ICS file.
- Commands to insert contact links in any note, link the current note to a contact, and create a contact from the active page.
- Works on both desktop and mobile without extra dependencies.

This project still provides only a lightweight example implementation but now demonstrates how a more complete contact manager could be built.

### Automatic server discovery

Instead of relying on a single CardDAV URL, the plugin now follows the same
multi-step lookup that DAVx5 uses. It first asks the server for your
`current-user-principal`, then queries that principal for the
`addressbook-home-set` and finally lists all address books found there. You can
choose the correct collection from a dropdown in the settings tab so the sync
always targets the right address book.

### Zoho CardDAV Setup

Set the CardDAV URL to:

```
https://contacts.zoho.com/dav/<your-email>/contacts/
```

Use your Zoho credentials for authentication.


## Getting Started

1. Install the Node dependencies:

   ```bash
   npm install
   ```

2. Build the plugin bundle:

   ```bash
   npm run build
   ```

3. Copy `manifest.json`, `main.js` and `styles.css` into your Obsidian
   `.obsidian/plugins/contact-link` folder and enable the plugin from Obsidian's
   community plugins tab.

For development you can run `npm run dev` to automatically rebuild the plugin
when the source files change.
