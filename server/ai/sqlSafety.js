'use strict';

// Tokens that indicate a write/DDL operation
const BLOCKED_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
  'TRUNCATE', 'REPLACE', 'MERGE', 'UPSERT', 'GRANT', 'REVOKE',
  'EXEC', 'EXECUTE', 'CALL', 'DO',
];

const BLOCKED_RE = new RegExp(
  `\\b(${BLOCKED_KEYWORDS.join('|')})\\b`,
  'i'
);

/**
 * Returns { safe: true } or { safe: false, keyword }
 */
function checkSelectOnly(sql) {
  // Strip string literals and comments before checking
  const stripped = sql
    .replace(/--[^\n]*/g, ' ')        // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/'[^']*'/g, "''")         // single-quoted strings
    .replace(/"[^"]*"/g, '""');        // double-quoted identifiers

  const match = stripped.match(BLOCKED_RE);
  if (match) return { safe: false, keyword: match[1].toUpperCase() };
  return { safe: true };
}

const DEFAULT_LIMIT = 100;
const HARD_CAP = 1000;

/**
 * Appends LIMIT if missing; enforces hard cap.
 */
function enforceLimit(sql) {
  const stripped = sql.trim().replace(/;+$/, '');
  const hasLimit = /\bLIMIT\s+\d+/i.test(stripped);

  if (!hasLimit) {
    return `${stripped} LIMIT ${DEFAULT_LIMIT}`;
  }

  // Enforce hard cap
  return stripped.replace(/\bLIMIT\s+(\d+)/i, (_, n) => {
    const num = Math.min(Number(n), HARD_CAP);
    return `LIMIT ${num}`;
  });
}

module.exports = { checkSelectOnly, enforceLimit };
