'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const VORDBESTE_DIR = path.join(os.homedir(), '.vordbeste');
const CONFIG_FILE = path.join(VORDBESTE_DIR, 'config.json');
const DATABASES_DIR = path.join(VORDBESTE_DIR, 'databases');

const SECRET_MODE = 0o600;
const SECRET_DIR_MODE = 0o700;

function ensureDirs() {
  fs.mkdirSync(VORDBESTE_DIR, { recursive: true, mode: SECRET_DIR_MODE });
  fs.mkdirSync(DATABASES_DIR, { recursive: true, mode: SECRET_DIR_MODE });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(VORDBESTE_DIR, SECRET_DIR_MODE); } catch {}
    try { fs.chmodSync(DATABASES_DIR, SECRET_DIR_MODE); } catch {}
  }
}

function readConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_FILE)) return null;
  if (process.platform !== 'win32') {
    const stat = fs.statSync(CONFIG_FILE);
    if (stat.mode & 0o077) {
      try { fs.chmodSync(CONFIG_FILE, SECRET_MODE); } catch {
        throw new Error(`Refusing to read ${CONFIG_FILE}: permissions too permissive. Run: chmod 600 "${CONFIG_FILE}"`);
      }
    }
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeConfig(config) {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: SECRET_MODE });
  try { fs.chmodSync(CONFIG_FILE, SECRET_MODE); } catch {}
}

function getDatabasesDir() {
  ensureDirs();
  return DATABASES_DIR;
}

module.exports = { readConfig, writeConfig, getDatabasesDir, DATABASES_DIR, VORDBESTE_DIR };
