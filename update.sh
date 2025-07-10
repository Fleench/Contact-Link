#!/bin/sh
# Update script to fetch latest TypeScript, CSS and JSON plugin files
# Usage: REPO_URL=<url> ./update.sh

set -e

: "${REPO_URL:=https://raw.githubusercontent.com/Fleench/Contact-Link/main}"

FILES="main.ts styles.css manifest.json versions.json"

for f in $FILES; do
    echo "Downloading $f ..."
    curl -fsSL "$REPO_URL/$f" -o "$f"
    echo "$f updated"
    echo
    done

echo "Update complete"
