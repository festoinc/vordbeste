'use strict';

const fs = require('fs');
const path = require('path');
const { getDatabasesDir } = require('./config');

// Slug from hostname + port + dbname
function makeDbSlug({ host, port, database }) {
  const h = (host || 'localhost').replace(/[^a-z0-9]/gi, '-');
  const p = port || '';
  const d = (database || '').replace(/[^a-z0-9]/gi, '-');
  return [h, p, d].filter(Boolean).join('-').toLowerCase();
}

function getDbDir(slug) {
  return path.join(getDatabasesDir(), slug);
}

function getTablesDir(slug) {
  return path.join(getDbDir(slug), 'tables-info');
}

function getSessionsDir(slug) {
  return path.join(getDbDir(slug), 'sessions');
}

function ensureDbDirs(slug) {
  fs.mkdirSync(getTablesDir(slug), { recursive: true });
  fs.mkdirSync(getSessionsDir(slug), { recursive: true });
}

// .env file for DB credentials
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
  fs.writeFileSync(path.join(getDbDir(slug), '.env'), lines.join('\n'), 'utf8');
}

function readDbEnv(slug) {
  const envPath = path.join(getDbDir(slug), '.env');
  if (!fs.existsSync(envPath)) return null;
  const result = {};
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      result[key] = val;
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

// List all databases (slugs that have a .env)
function listDatabases() {
  const dir = getDatabasesDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(slug => {
    return fs.existsSync(path.join(dir, slug, '.env'));
  });
}

// Table info markdown
function readTableMd(slug, tableName) {
  const file = path.join(getTablesDir(slug), `${tableName}.md`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

function writeTableMd(slug, tableName, content) {
  ensureDbDirs(slug);
  fs.writeFileSync(path.join(getTablesDir(slug), `${tableName}.md`), content, 'utf8');
}

function listTableMds(slug) {
  const dir = getTablesDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

// Sessions
function createSession(slug) {
  ensureDbDirs(slug);
  const ts = Date.now();
  const file = path.join(getSessionsDir(slug), `${ts}.md`);
  const frontmatter = `---\ntitle: Untitled session\ncreated_at: ${new Date().toISOString()}\n---\n\n`;
  fs.writeFileSync(file, frontmatter, 'utf8');
  return { id: String(ts), file };
}

function readSession(slug, sessionId) {
  const file = path.join(getSessionsDir(slug), `${sessionId}.md`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

function writeSession(slug, sessionId, content) {
  const file = path.join(getSessionsDir(slug), `${sessionId}.md`);
  fs.writeFileSync(file, content, 'utf8');
}

function updateSessionTitle(slug, sessionId, title) {
  const raw = readSession(slug, sessionId);
  if (!raw) return;
  const updated = raw.replace(/^title:.*$/m, `title: ${title}`);
  writeSession(slug, sessionId, updated);
}

function listSessions(slug) {
  const dir = getSessionsDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const id = f.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const titleMatch = raw.match(/^title:\s*(.+)$/m);
      const dateMatch = raw.match(/^created_at:\s*(.+)$/m);
      return {
        id,
        title: titleMatch ? titleMatch[1].trim() : 'Untitled session',
        created_at: dateMatch ? dateMatch[1].trim() : null,
      };
    })
    .sort((a, b) => Number(b.id) - Number(a.id));
}

// Parse session transcript from markdown (everything after frontmatter)
function parseSessionTranscript(raw) {
  const fmEnd = raw.indexOf('\n---\n', 4);
  if (fmEnd === -1) return [];
  const body = raw.slice(fmEnd + 5).trim();
  if (!body) return [];
  try {
    const jsonMatch = body.match(/^```json\n([\s\S]*?)\n```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]);
  } catch {}
  return [];
}

function writeSessionTranscript(slug, sessionId, messages) {
  const raw = readSession(slug, sessionId);
  if (!raw) return;
  const fmEnd = raw.indexOf('\n---\n', 4);
  const fm = fmEnd !== -1 ? raw.slice(0, fmEnd + 5) : raw;
  const body = '```json\n' + JSON.stringify(messages, null, 2) + '\n```\n';
  writeSession(slug, sessionId, fm + '\n' + body);
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
  readSession,
  writeSession,
  updateSessionTitle,
  listSessions,
  parseSessionTranscript,
  writeSessionTranscript,
};
