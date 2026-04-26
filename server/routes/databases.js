'use strict';

const express = require('express');
const router = express.Router();
const fs = require('../fileSystem');
const dbDriver = require('../db/index');

function handleValidationError(res, err) {
  return res.status(400).json({ error: err.message });
}

// GET /api/databases — list saved databases (no auto-connect)
router.get('/', async (req, res) => {
  const slugs = fs.listDatabases();
  const databases = slugs.map(slug => {
    const creds = fs.readDbEnv(slug);
    if (!creds) return null;
    const conn = dbDriver.getConnection(slug);
    return {
      slug,
      label: creds.label || creds.database,
      type: creds.type,
      host: creds.host,
      database: creds.database,
      tableCount: fs.listTableMds(slug).length,
      sessionCount: fs.listSessions(slug).length,
      status: conn ? 'online' : 'unknown',
    };
  }).filter(Boolean);
  res.json({ databases });
});

// GET /api/databases/:slug
router.get('/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const creds = fs.readDbEnv(slug);
    if (!creds) return res.status(404).json({ error: 'Database not found' });
    res.json({
      slug,
      creds: { ...creds, password: '***' },
      tables: fs.listTableMds(slug),
      sessions: fs.listSessions(slug),
    });
  } catch (err) { return handleValidationError(res, err); }
});

router.get('/:slug/sessions', (req, res) => {
  try {
    res.json({ sessions: fs.listSessions(req.params.slug) });
  } catch (err) { return handleValidationError(res, err); }
});

router.get('/:slug/sessions/:sessionId', (req, res) => {
  try {
    const { slug, sessionId } = req.params;
    const meta = fs.readSessionMeta(slug, sessionId);
    if (!meta) return res.status(404).json({ error: 'Session not found' });
    const turns = fs.readSessionTurns(slug, sessionId);
    const messages = turnsToLegacyMessages(turns);
    res.json({
      id: meta.id,
      title: meta.title,
      created_at: meta.created_at,
      messages,
      turns, // raw view for clients that want the new shape
    });
  } catch (err) { return handleValidationError(res, err); }
});

function turnsToLegacyMessages(turns) {
  const out = [];
  for (const t of turns) {
    if (t.kind === 'user') out.push({ role: 'user', content: t.text });
    else if (t.kind === 'assistant') out.push({ role: 'assistant', content: t.text });
    else if (t.kind === 'result') {
      out.push({
        role: 'assistant',
        content: '',
        result: { sql: t.sql, rowCount: t.rowCount, columns: t.columns, redacted: true },
      });
    }
  }
  return out;
}

router.get('/:slug/tables/:tableName', (req, res) => {
  try {
    const { slug, tableName } = req.params;
    const content = fs.readTableMd(slug, tableName);
    if (!content) return res.status(404).json({ error: 'Table doc not found' });
    res.json({ tableName, content });
  } catch (err) { return handleValidationError(res, err); }
});

module.exports = router;
