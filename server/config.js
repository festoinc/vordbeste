'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function getDefaultDir() {
  return path.join(os.homedir(), '.vordbeste');
}

let _rootDir = getDefaultDir();

function _setRootDir(dir) {
  _rootDir = dir;
}

function _resetRootDir() {
  _rootDir = getDefaultDir();
}

function getVordbesteDir() {
  return _rootDir;
}

const CONFIG_FILE = () => path.join(_rootDir, 'config.json');
const DATABASES_DIR = () => path.join(_rootDir, 'databases');

const SECRET_MODE = 0o600;
const SECRET_DIR_MODE = 0o700;

function ensureDirs() {
  fs.mkdirSync(_rootDir, { recursive: true, mode: SECRET_DIR_MODE });
  const dbDir = DATABASES_DIR();
  fs.mkdirSync(dbDir, { recursive: true, mode: SECRET_DIR_MODE });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(_rootDir, SECRET_DIR_MODE); } catch {}
    try { fs.chmodSync(dbDir, SECRET_DIR_MODE); } catch {}
  }
}

function readConfig() {
  ensureDirs();
  const cfg = CONFIG_FILE();
  if (!fs.existsSync(cfg)) return null;
  if (process.platform !== 'win32') {
    const stat = fs.statSync(cfg);
    if (stat.mode & 0o077) {
      try { fs.chmodSync(cfg, SECRET_MODE); } catch {
        throw new Error(`Refusing to read ${cfg}: permissions too permissive. Run: chmod 600 "${cfg}"`);
      }
    }
  }
  try {
    return JSON.parse(fs.readFileSync(cfg, 'utf8'));
  } catch {
    return null;
  }
}

function writeConfig(config) {
  ensureDirs();
  const cfg = CONFIG_FILE();
  fs.writeFileSync(cfg, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: SECRET_MODE });
  try { fs.chmodSync(cfg, SECRET_MODE); } catch {}
}

function getDatabasesDir() {
  ensureDirs();
  return DATABASES_DIR();
}

module.exports = { readConfig, writeConfig, getDatabasesDir, getVordbesteDir, _setRootDir, _resetRootDir };
