'use strict';

const postgresDriver = require('./postgres');
const mysqlDriver = require('./mysql');
const { assertIdent } = require('../paths');

const MAX_POOLS = 3;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// Map<slug, { conn, driver, type, lastUsed: number }>
const connections = new Map();
let evictTimer = null;

function getDriver(type) {
  if (type === 'postgres' || type === 'postgresql' || type === 'pg') return postgresDriver;
  if (type === 'mysql') return mysqlDriver;
  throw new Error(`Unsupported database type: ${type}`);
}

function touch(slug) {
  const entry = connections.get(slug);
  if (entry) entry.lastUsed = Date.now();
}

async function evictIfNeeded() {
  const now = Date.now();
  for (const [slug, entry] of connections) {
    if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
      await disconnect(slug);
    }
  }
  while (connections.size > MAX_POOLS) {
    let oldestSlug = null;
    let oldestTs = Infinity;
    for (const [slug, entry] of connections) {
      if (entry.lastUsed < oldestTs) { oldestTs = entry.lastUsed; oldestSlug = slug; }
    }
    if (!oldestSlug) break;
    await disconnect(oldestSlug);
  }
}

function ensureEvictionTimer() {
  if (evictTimer) return;
  evictTimer = setInterval(() => { evictIfNeeded().catch(() => {}); }, 60 * 1000);
  if (evictTimer.unref) evictTimer.unref();
}

async function connect(slug, creds) {
  if (connections.has(slug)) {
    await disconnect(slug);
  }
  const driver = getDriver(creds.type);
  const conn = await driver.connect(creds);
  connections.set(slug, { conn, driver, type: creds.type, lastUsed: Date.now() });
  ensureEvictionTimer();
  await evictIfNeeded();
  return conn;
}

async function disconnect(slug) {
  const entry = connections.get(slug);
  if (!entry) return;
  connections.delete(slug);
  try { await entry.driver.disconnect(entry.conn); } catch {}
}

async function disconnectAll() {
  const slugs = [...connections.keys()];
  await Promise.all(slugs.map(disconnect));
}

function getConnection(slug) {
  return connections.get(slug) || null;
}

async function ensureConnected(slug, creds) {
  if (connections.has(slug)) {
    touch(slug);
    return connections.get(slug);
  }
  if (!creds) throw new Error('Not connected and no credentials provided.');
  await connect(slug, creds);
  return connections.get(slug);
}

async function runSelect(slug, sql) {
  const entry = connections.get(slug);
  if (!entry) throw new Error('Not connected to database. Please connect first.');
  touch(slug);
  return entry.driver.runSelect(entry.conn, sql);
}

async function runDescribe(slug, sql) {
  const entry = connections.get(slug);
  if (!entry) throw new Error('Not connected to database. Please connect first.');
  touch(slug);
  return entry.driver.runDescribe(entry.conn, sql);
}

async function probeTable(slug, tableName, limit = 10) {
  const entry = connections.get(slug);
  if (!entry) throw new Error('Not connected to database. Please connect first.');
  assertIdent(tableName, 'table name');
  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 50);
  const quoted = entry.type === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`;
  const sql = `SELECT * FROM ${quoted} LIMIT ${safeLimit}`;
  touch(slug);
  return entry.driver.runSelect(entry.conn, sql);
}

async function introspectSchema(slug) {
  const entry = connections.get(slug);
  if (!entry) throw new Error('Not connected to database.');
  touch(slug);
  return entry.driver.introspectSchema(entry.conn);
}

// Open a fresh pool, immediately use it for the caller, then keep it cached.
// Replaces the prior testConnection+connect double-pool dance.
async function connectAndTest(creds) {
  const driver = getDriver(creds.type);
  const conn = await driver.connect(creds);
  return { conn, driver, type: creds.type };
}

module.exports = {
  connect,
  disconnect,
  disconnectAll,
  getConnection,
  ensureConnected,
  runSelect,
  runDescribe,
  probeTable,
  introspectSchema,
  connectAndTest,
};
