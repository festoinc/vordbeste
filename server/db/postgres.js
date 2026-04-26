'use strict';

const { Pool } = require('pg');

async function connect(creds) {
  const pool = new Pool({
    host: creds.host,
    port: Number(creds.port) || 5432,
    user: creds.user,
    password: creds.password,
    database: creds.database,
    connectionTimeoutMillis: 8000,
    ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  pool.on('error', () => { /* swallow idle-client errors so they don't crash the process */ });
  // Verify
  const client = await pool.connect();
  client.release();
  return pool;
}

async function disconnect(pool) {
  await pool.end();
}

async function readOnly(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      const result = await fn(client);
      return result;
    } finally {
      // Always rollback — we never want to commit anything on the read path.
      try { await client.query('ROLLBACK'); } catch {}
    }
  } finally {
    client.release();
  }
}

async function runSelect(pool, sql) {
  return readOnly(pool, async (client) => {
    const result = await client.query(sql);
    return { rows: result.rows, rowCount: result.rowCount };
  });
}

async function runDescribe(pool, sql) {
  return readOnly(pool, async (client) => {
    const result = await client.query(sql);
    return { rows: result.rows, rowCount: result.rowCount };
  });
}

async function introspectSchema(pool) {
  const sql = `
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
    FROM information_schema.columns c
    LEFT JOIN information_schema.key_column_usage kcu
      ON kcu.table_name = c.table_name
      AND kcu.column_name = c.column_name
      AND kcu.constraint_name IN (
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE constraint_type = 'PRIMARY KEY' AND table_schema = 'public'
      )
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position
  `;
  return readOnly(pool, async (client) => {
    const result = await client.query(sql);
    return groupByTable(result.rows);
  });
}

function groupByTable(rows) {
  const tables = {};
  for (const row of rows) {
    if (!tables[row.table_name]) tables[row.table_name] = [];
    tables[row.table_name].push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      default: row.column_default,
      pk: row.is_primary_key,
    });
  }
  return tables;
}

module.exports = { connect, disconnect, runSelect, runDescribe, introspectSchema };
