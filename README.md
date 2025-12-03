# Obsidian Plugin Collection

This repository now groups multiple Obsidian plugins, with each plugin living in its own folder. Use the plugin directories to find their individual code, documentation, and build scripts. For example, the `contact-link/` folder contains the Contact Link plugin.

## Repository Layout
- Each plugin has its own subfolder at the root of this repository.
- Plugin folders keep their own `package.json`, configuration files, and README for plugin-specific setup.
- Shared assets such as the repository license remain at the root.

## Setting up a Development Environment
1. Install **Node.js 18+** and `npm` on your system (using a version manager like `nvm` is recommended).
2. Clone this repository and choose the plugin you want to work on:
   ```bash
   git clone <repo-url>
   cd Contact-Link/<plugin-folder>
   ```
3. Install dependencies for that plugin:
   ```bash
   npm install
   ```
4. Run the plugin's scripts from inside its folder. Common tasks include:
   ```bash
   npm run dev    # Start a development build/watch if available
   npm run build  # Produce a production build
   ```
5. Consult the plugin's README for any plugin-specific steps such as copying build outputs into Obsidian.

## Adding New Plugins
When adding another plugin, create a new folder at the repository root, copy or initialize the needed project files inside it, and add a README that explains how to build and install that plugin.
