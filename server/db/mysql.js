'use strict';

const mysql = require('mysql2/promise');

async function connect(creds) {
  const pool = mysql.createPool({
    host: creds.host,
    port: Number(creds.port) || 3306,
    user: creds.user,
    password: creds.password,
    database: creds.database,
    connectTimeout: 8000,
    waitForConnections: true,
    connectionLimit: 5,
    ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
  });
  // Test it
  const conn = await pool.getConnection();
  conn.release();
  return pool;
}

async function disconnect(pool) {
  await pool.end();
}

async function runSelect(pool, sql) {
  const [rows] = await pool.query(sql);
  return { rows, rowCount: rows.length };
}

async function runDescribe(pool, sql) {
  const [rows] = await pool.query(sql);
  return { rows, rowCount: rows.length };
}

async function introspectSchema(pool) {
  const [dbRows] = await pool.query('SELECT DATABASE() AS db');
  const dbName = dbRows[0]?.db;

  const [rows] = await pool.query(`
    SELECT
      c.TABLE_NAME AS table_name,
      c.COLUMN_NAME AS column_name,
      c.DATA_TYPE AS data_type,
      c.IS_NULLABLE AS is_nullable,
      c.COLUMN_DEFAULT AS column_default,
      CASE WHEN c.COLUMN_KEY = 'PRI' THEN true ELSE false END AS is_primary_key
    FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = ?
    ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
  `, [dbName]);

  return groupByTable(rows);
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
      pk: Boolean(row.is_primary_key),
    });
  }
  return tables;
}

module.exports = { connect, disconnect, runSelect, runDescribe, introspectSchema };
