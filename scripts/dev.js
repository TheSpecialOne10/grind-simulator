// Removes ELECTRON_RUN_AS_NODE before launching electron-vite dev.
// This env var is set by some environments (e.g., VS Code extensions)
// and prevents Electron from initializing its framework modules.
delete process.env.ELECTRON_RUN_AS_NODE;

const { execSync } = require('child_process');
execSync('npx electron-vite dev', { stdio: 'inherit', env: process.env });
