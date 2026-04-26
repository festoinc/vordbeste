'use strict';

const path = require('path');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SESSION_ID_RE = /^\d{10,16}$/;

function assertSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(`Invalid database slug: ${JSON.stringify(slug)}`);
  }
  return slug;
}

function assertIdent(name, label = 'identifier') {
  if (typeof name !== 'string' || !IDENT_RE.test(name)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(name)}`);
  }
  return name;
}

function assertSessionId(id) {
  if (typeof id !== 'string' || !SESSION_ID_RE.test(id)) {
    throw new Error(`Invalid session id: ${JSON.stringify(id)}`);
  }
  return id;
}

function safeJoin(base, ...parts) {
  const resolvedBase = path.resolve(base);
  const joined = path.resolve(resolvedBase, ...parts);
  if (joined !== resolvedBase && !joined.startsWith(resolvedBase + path.sep)) {
    throw new Error('Path escapes its base directory');
  }
  return joined;
}

module.exports = { assertSlug, assertIdent, assertSessionId, safeJoin, SLUG_RE, IDENT_RE, SESSION_ID_RE };
