# Contact Link

Contact Link synchronizes your Obsidian vault with the official Zoho Contacts API so your notes can store real contact information. The plugin creates and updates Markdown files based on your address book and lets you edit contacts directly from Obsidian.

## Features

- Connect to the Zoho Contacts API and pull contact details.
- Store contact fields in frontmatter (`phone`, `email`, `birthday`, `company`).
- Create or update notes in a chosen folder when syncing.
- View a simple dashboard table of all contacts with links to call or email.
- Basic settings for API URL, access token and note folder.
- Check authentication from the settings tab.
- Manual sync button to push and pull changes.

This repository contains only a minimal example implementation. Two-way updates require further development.

### Zoho API Setup

Enter your API base URL (e.g. `https://contacts.zoho.com/api`) and an OAuth access token in the plugin settings.
