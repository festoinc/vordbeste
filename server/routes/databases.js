'use strict';

const express = require('express');
const router = express.Router();
const fs = require('../fileSystem');
const dbDriver = require('../db/index');
const { readConfig } = require('../config');

// GET /api/databases — list all saved databases with connection status
router.get('/', async (req, res) => {
  const slugs = fs.listDatabases();
  const databases = [];

  for (const slug of slugs) {
    const creds = fs.readDbEnv(slug);
    if (!creds) continue;

    // Check if currently connected
    const conn = dbDriver.getConnection(slug);
    let status = conn ? 'online' : 'offline';

    // If not connected, try to connect quietly
    if (!conn) {
      try {
        await dbDriver.connect(slug, creds);
        status = 'online';
      } catch {
        status = 'offline';
      }
    }

    const tables = fs.listTableMds(slug);
    const sessions = fs.listSessions(slug);

    databases.push({
      slug,
      label: creds.label || creds.database,
      type: creds.type,
      host: creds.host,
      database: creds.database,
      tableCount: tables.length,
      sessionCount: sessions.length,
      status,
    });
  }

  res.json({ databases });
});

// GET /api/databases/:slug — details for one DB
router.get('/:slug', (req, res) => {
  const { slug } = req.params;
  const creds = fs.readDbEnv(slug);
  if (!creds) return res.status(404).json({ error: 'Database not found' });

  const tables = fs.listTableMds(slug);
  const sessions = fs.listSessions(slug);

  res.json({ slug, creds: { ...creds, password: '***' }, tables, sessions });
});

// GET /api/databases/:slug/sessions — list sessions
router.get('/:slug/sessions', (req, res) => {
  const { slug } = req.params;
  const sessions = fs.listSessions(slug);
  res.json({ sessions });
});

// GET /api/databases/:slug/sessions/:sessionId — full session transcript
router.get('/:slug/sessions/:sessionId', (req, res) => {
  const { slug, sessionId } = req.params;
  const raw = fs.readSession(slug, sessionId);
  if (!raw) return res.status(404).json({ error: 'Session not found' });
  const messages = fs.parseSessionTranscript(raw);
  const titleMatch = raw.match(/^title:\s*(.+)$/m);
  const dateMatch = raw.match(/^created_at:\s*(.+)$/m);
  res.json({
    id: sessionId,
    title: titleMatch ? titleMatch[1].trim() : 'Untitled session',
    created_at: dateMatch ? dateMatch[1].trim() : null,
    messages,
  });
});

// GET /api/databases/:slug/tables/:tableName — table doc
router.get('/:slug/tables/:tableName', (req, res) => {
  const { slug, tableName } = req.params;
  const content = fs.readTableMd(slug, tableName);
  if (!content) return res.status(404).json({ error: 'Table doc not found' });
  res.json({ tableName, content });
});

module.exports = router;
