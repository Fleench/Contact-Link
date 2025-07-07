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

### Obtaining a Zoho OAuth token

1. Log in to the [Zoho API Console](https://api-console.zoho.com/) and create a new OAuth client. Any client type works, but the **Self Client** option is the quickest for testing.
2. Choose the scopes you need (for example `ZohoContacts.fullaccess`) and generate a grant token.
3. Exchange the grant token for an access token using Zoho's token endpoint:

   ```bash
   curl --request POST \
        'https://accounts.zoho.com/oauth/v2/token?grant_type=authorization_code&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&redirect_uri=YOUR_REGISTERED_URI&code=GRANT_TOKEN'
   ```

   The JSON response includes an `access_token` and optionally a `refresh_token` if you requested offline access.
4. Paste the `access_token` value into the plugin's **Access token** field. If you obtained a `refresh_token`, you can periodically generate a new access token without repeating the authorization step.
5. Use **Check authentication** in the plugin settings to verify that the token works.

Tokens typically expire after an hour unless refreshed. If authentication fails, generate a new token and update the setting.
