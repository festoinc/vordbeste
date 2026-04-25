'use strict';

const postgresDriver = require('./postgres');
const mysqlDriver = require('./mysql');

// Active connection pool per slug
const connections = new Map();

function getDriver(type) {
  if (type === 'postgres' || type === 'postgresql' || type === 'pg') return postgresDriver;
  if (type === 'mysql') return mysqlDriver;
  throw new Error(`Unsupported database type: ${type}`);
}

async function connect(slug, creds) {
  if (connections.has(slug)) {
    await disconnect(slug);
  }
  const driver = getDriver(creds.type);
  const conn = await driver.connect(creds);
  connections.set(slug, { conn, driver, type: creds.type });
  return conn;
}

async function disconnect(slug) {
  if (!connections.has(slug)) return;
  const { conn, driver } = connections.get(slug);
  await driver.disconnect(conn);
  connections.delete(slug);
}

function getConnection(slug) {
  return connections.get(slug) || null;
}

async function runSelect(slug, sql) {
  const entry = connections.get(slug);
  if (!entry) throw new Error('Not connected to database. Please connect first.');
  return entry.driver.runSelect(entry.conn, sql);
}

async function runDescribe(slug, sql) {
  const entry = connections.get(slug);
  if (!entry) throw new Error('Not connected to database. Please connect first.');
  return entry.driver.runDescribe(entry.conn, sql);
}

async function introspectSchema(slug) {
  const entry = connections.get(slug);
  if (!entry) throw new Error('Not connected to database.');
  return entry.driver.introspectSchema(entry.conn);
}

async function testConnection(creds) {
  const driver = getDriver(creds.type);
  const conn = await driver.connect(creds);
  await driver.disconnect(conn);
}

module.exports = { connect, disconnect, getConnection, runSelect, runDescribe, introspectSchema, testConnection };
