'use strict';

const fs = require('fs');
const { getDatabasesDir } = require('./config');
const { assertSlug, assertIdent, assertSessionId, safeJoin } = require('./paths');

const SECRET_MODE = 0o600;
const SECRET_DIR_MODE = 0o700;

function makeDbSlug({ host, port, database }) {
  const h = (host || 'localhost').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const p = String(port || '').replace(/[^0-9]/g, '');
  const d = (database || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const raw = [h, p, d].filter(Boolean).join('-');
  const trimmed = raw.replace(/^-+|-+$/g, '').slice(0, 127);
  if (!trimmed) throw new Error('Could not derive a database slug from the credentials');
  return trimmed;
}

function getDbDir(slug) {
  assertSlug(slug);
  return safeJoin(getDatabasesDir(), slug);
}

function getTablesDir(slug) {
  return safeJoin(getDbDir(slug), 'tables-info');
}

function getSessionsDir(slug) {
  return safeJoin(getDbDir(slug), 'sessions');
}

function ensureDbDirs(slug) {
  fs.mkdirSync(getDbDir(slug), { recursive: true, mode: SECRET_DIR_MODE });
  fs.mkdirSync(getTablesDir(slug), { recursive: true });
  fs.mkdirSync(getSessionsDir(slug), { recursive: true });
}

function writeSecretFile(filePath, content) {
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: SECRET_MODE });
  try { fs.chmodSync(filePath, SECRET_MODE); } catch {}
}

function readSecretFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  if (process.platform !== 'win32') {
    const stat = fs.statSync(filePath);
    const wide = stat.mode & 0o077;
    if (wide) {
      try { fs.chmodSync(filePath, SECRET_MODE); } catch {
        throw new Error(`Refusing to read ${filePath}: file permissions are too permissive (mode=${(stat.mode & 0o777).toString(8)}). Run: chmod 600 "${filePath}"`);
      }
    }
  }
  return fs.readFileSync(filePath, 'utf8');
}

function writeDbEnv(slug, creds) {
  ensureDbDirs(slug);
  const lines = [
    `DB_TYPE=${creds.type}`,
    `DB_HOST=${creds.host}`,
    `DB_PORT=${creds.port}`,
    `DB_USER=${creds.user}`,
    `DB_PASSWORD=${creds.password}`,
    `DB_NAME=${creds.database}`,
    `DB_LABEL=${creds.label || creds.database}`,
    `DB_SSL=${creds.ssl ? 'true' : 'false'}`,
  ];
  writeSecretFile(safeJoin(getDbDir(slug), '.env'), lines.join('\n'));
}

function readDbEnv(slug) {
  const envPath = safeJoin(getDbDir(slug), '.env');
  const raw = readSecretFile(envPath);
  if (!raw) return null;
  const result = {};
  raw.split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0) {
      result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  });
  return {
    type: result.DB_TYPE,
    host: result.DB_HOST,
    port: result.DB_PORT,
    user: result.DB_USER,
    password: result.DB_PASSWORD,
    database: result.DB_NAME,
    label: result.DB_LABEL || result.DB_NAME,
    ssl: result.DB_SSL === 'true',
  };
}

function listDatabases() {
  const dir = getDatabasesDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => {
    try {
      assertSlug(name);
    } catch {
      return false;
    }
    return fs.existsSync(safeJoin(dir, name, '.env'));
  });
}

function readTableMd(slug, tableName) {
  assertIdent(tableName, 'table name');
  const file = safeJoin(getTablesDir(slug), `${tableName}.md`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

function writeTableMd(slug, tableName, content) {
  assertIdent(tableName, 'table name');
  ensureDbDirs(slug);
  fs.writeFileSync(safeJoin(getTablesDir(slug), `${tableName}.md`), content, 'utf8');
}

function listTableMds(slug) {
  const dir = getTablesDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .filter(name => {
      try { assertIdent(name, 'table name'); return true; } catch { return false; }
    });
}

function createSession(slug) {
  ensureDbDirs(slug);
  const ts = String(Date.now());
  const meta = {
    id: ts,
    title: 'Untitled session',
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(safeJoin(getSessionsDir(slug), `${ts}.meta.json`), JSON.stringify(meta, null, 2), 'utf8');
  fs.writeFileSync(safeJoin(getSessionsDir(slug), `${ts}.jsonl`), '', 'utf8');
  return { id: ts };
}

function sessionMetaPath(slug, sessionId) {
  assertSessionId(sessionId);
  return safeJoin(getSessionsDir(slug), `${sessionId}.meta.json`);
}

function sessionTranscriptPath(slug, sessionId) {
  assertSessionId(sessionId);
  return safeJoin(getSessionsDir(slug), `${sessionId}.jsonl`);
}

function readSessionMeta(slug, sessionId) {
  const file = sessionMetaPath(slug, sessionId);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeSessionMeta(slug, sessionId, meta) {
  fs.writeFileSync(sessionMetaPath(slug, sessionId), JSON.stringify(meta, null, 2), 'utf8');
}

function updateSessionTitle(slug, sessionId, title) {
  const meta = readSessionMeta(slug, sessionId);
  if (!meta) return;
  meta.title = String(title).slice(0, 200);
  writeSessionMeta(slug, sessionId, meta);
}

function appendSessionTurn(slug, sessionId, turn) {
  const file = sessionTranscriptPath(slug, sessionId);
  fs.appendFileSync(file, JSON.stringify(turn) + '\n', 'utf8');
}

function readSessionTurns(slug, sessionId) {
  const file = sessionTranscriptPath(slug, sessionId);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  return raw.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function listSessions(slug) {
  const dir = getSessionsDir(slug);
  if (!fs.existsSync(dir)) return [];
  const ids = new Set();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(\d{10,16})\.(meta\.json|jsonl)$/);
    if (m) ids.add(m[1]);
  }
  return [...ids]
    .map(id => readSessionMeta(slug, id))
    .filter(Boolean)
    .sort((a, b) => Number(b.id) - Number(a.id));
}

module.exports = {
  makeDbSlug,
  getDbDir,
  ensureDbDirs,
  writeDbEnv,
  readDbEnv,
  listDatabases,
  readTableMd,
  writeTableMd,
  listTableMds,
  createSession,
  readSessionMeta,
  updateSessionTitle,
  appendSessionTurn,
  readSessionTurns,
  listSessions,
};
