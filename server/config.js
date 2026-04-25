'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const VORDBESTE_DIR = path.join(os.homedir(), '.vordbeste');
const CONFIG_FILE = path.join(VORDBESTE_DIR, 'config.json');
const DATABASES_DIR = path.join(VORDBESTE_DIR, 'databases');

function ensureDirs() {
  fs.mkdirSync(VORDBESTE_DIR, { recursive: true });
  fs.mkdirSync(DATABASES_DIR, { recursive: true });
}

function readConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeConfig(config) {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

function getDatabasesDir() {
  ensureDirs();
  return DATABASES_DIR;
}

module.exports = { readConfig, writeConfig, getDatabasesDir, DATABASES_DIR };
