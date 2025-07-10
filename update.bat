@echo off
rem Update script to fetch latest TypeScript, CSS and JSON plugin files
rem Usage: set REPO_URL=<url> && update.bat

if "%REPO_URL%"=="" (
    set REPO_URL=https://raw.githubusercontent.com/USER/Contact-Link/main
)

set FILES=main.ts styles.css manifest.json versions.json

for %%F in (%FILES%) do (
    echo Downloading %%F ...
    curl -fsSL %REPO_URL%/%%F -o %%F
    echo %%F updated
    echo.
)

echo Update complete
