'use strict';

const { Parser } = require('node-sql-parser');

const parser = new Parser();

// Functions that read server filesystem / network / metadata even from a SELECT.
const DENY_FUNCTIONS = new Set([
  // PostgreSQL
  'pg_read_file', 'pg_read_binary_file', 'pg_read_server_files',
  'pg_ls_dir', 'pg_ls_logdir', 'pg_ls_waldir', 'pg_ls_tmpdir',
  'pg_stat_file', 'lo_export', 'lo_import',
  'dblink', 'dblink_exec', 'dblink_connect', 'dblink_open',
  'copy', 'pg_terminate_backend', 'pg_cancel_backend',
  // MySQL
  'load_file', 'sys_exec', 'sys_eval',
  'benchmark', 'sleep',
]);

// Top-level statement kinds that are unconditionally allowed.
const SELECT_TYPES = new Set(['select']);
const DESCRIBE_TYPES = new Set(['select', 'desc', 'describe', 'show']);

/**
 * Validate that `sql` is a single read-only statement.
 * Returns { safe: true } or { safe: false, reason }.
 *
 * @param {string} sql
 * @param {'postgres'|'mysql'} dbType
 * @param {{ allowDescribe?: boolean }} [opts]
 */
function checkSelectOnly(sql, dbType = 'postgres', opts = {}) {
  const allowed = opts.allowDescribe ? DESCRIBE_TYPES : SELECT_TYPES;
  if (typeof sql !== 'string' || !sql.trim()) {
    return { safe: false, reason: 'empty query' };
  }

  const dialect = dbType === 'mysql' ? 'MySQL' : 'PostgreSQL';

  let ast;
  try {
    ast = parser.astify(sql, { database: dialect });
  } catch (err) {
    return { safe: false, reason: `Could not parse SQL: ${err.message}` };
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) {
    return { safe: false, reason: 'Only one statement is allowed per query' };
  }

  const stmt = statements[0];
  if (!stmt || typeof stmt !== 'object' || !allowed.has((stmt.type || '').toLowerCase())) {
    return { safe: false, reason: `${(stmt && stmt.type) || 'unknown'} statements are not allowed — read-only` };
  }

  // Walk the AST looking for forbidden function calls.
  const bad = findDeniedFunction(stmt);
  if (bad) return { safe: false, reason: `function "${bad}" is not allowed` };

  // node-sql-parser puts CTE statements on the SELECT under .with — walk those too.
  if (stmt.with) {
    for (const cte of stmt.with) {
      if (cte.stmt && cte.stmt.type && cte.stmt.type.toLowerCase() !== 'select') {
        return { safe: false, reason: 'data-modifying CTEs are not allowed' };
      }
    }
  }

  return { safe: true };
}

function findDeniedFunction(node, seen = new WeakSet()) {
  if (!node || typeof node !== 'object') return null;
  if (seen.has(node)) return null;
  seen.add(node);

  if (node.type === 'function' || node.type === 'aggr_func') {
    const name = extractFunctionName(node);
    if (name && DENY_FUNCTIONS.has(name.toLowerCase())) return name;
  }

  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        const r = findDeniedFunction(item, seen);
        if (r) return r;
      }
    } else if (v && typeof v === 'object') {
      const r = findDeniedFunction(v, seen);
      if (r) return r;
    }
  }
  return null;
}

function extractFunctionName(node) {
  if (!node) return null;
  if (typeof node.name === 'string') return node.name;
  if (node.name && typeof node.name === 'object') {
    if (typeof node.name.name === 'string') return node.name.name;
    if (Array.isArray(node.name.name)) {
      const last = node.name.name[node.name.name.length - 1];
      if (typeof last === 'string') return last;
      if (last && typeof last.value === 'string') return last.value;
    }
  }
  return null;
}

const DEFAULT_LIMIT = 100;
const HARD_CAP = 1000;

/**
 * Wrap user SQL so a LIMIT is always enforced, and trim trailing semicolons.
 * The wrapped form ensures the limit applies to the outermost result set even
 * for unions, ORDER BY in the user's query, etc.
 */
function enforceLimit(sql) {
  const stripped = sql.trim().replace(/;+\s*$/, '');
  return `SELECT * FROM (${stripped}) AS _vordbeste_capped LIMIT ${DEFAULT_LIMIT}`;
}

module.exports = { checkSelectOnly, enforceLimit, DEFAULT_LIMIT, HARD_CAP, DENY_FUNCTIONS };
