'use strict';

const express = require('express');
const router = express.Router();
const { chat } = require('../ai/index');
const { readConfig } = require('../config');
const fs = require('../fileSystem');
const dbDriver = require('../db/index');

const MAX_TURNS_IN_PROMPT = 40;

router.post('/', async (req, res) => {
  const config = readConfig();
  if (!config) {
    return res.status(401).json({ error: 'Not configured. Please set up your API key first.' });
  }

  const { messages, slug, sessionId, isConnectPage, ephemeral } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let dbCreds = null;
  if (slug) {
    try {
      dbCreds = fs.readDbEnv(slug);
    } catch (err) {
      sendEvent({ type: 'error', message: 'Invalid database identifier.' });
      return res.end();
    }
    if (dbCreds && !dbDriver.getConnection(slug)) {
      try {
        await dbDriver.connect(slug, dbCreds);
      } catch {
        sendEvent({ type: 'error', message: 'Could not reconnect to the database. Please check the connection.' });
        return res.end();
      }
    }
  }

  let activeSessionId = sessionId;
  if (!activeSessionId && slug && !ephemeral) {
    const session = fs.createSession(slug);
    activeSessionId = session.id;
    sendEvent({ type: 'session_created', sessionId: activeSessionId });
  }

  // Append only the last user message to the transcript.
  if (slug && activeSessionId && !ephemeral) {
    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      try {
        fs.appendSessionTurn(slug, activeSessionId, {
          kind: 'user',
          text: extractText(last.content),
          ts: new Date().toISOString(),
        });
      } catch {}
    }
  }

  // Cap prompt size — keep the most recent turns plus the very first user message.
  const trimmedMessages = trimMessages(messages, MAX_TURNS_IN_PROMPT);

  // Buffer assistant text for the turn so we persist one assistant row at the end.
  let assistantBuffer = '';
  const events = [];

  try {
    await chat({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      messages: trimmedMessages,
      slug,
      sessionId: activeSessionId,
      dbCreds,
      isConnectPage: !!isConnectPage,
      onEvent: (event) => {
        sendEvent(event);
        if (event.type === 'text') assistantBuffer += event.text;
        if (event.type === 'print_result') events.push({
          kind: 'result',
          sql: event.sql,
          rowCount: Array.isArray(event.rows) ? event.rows.length : 0,
          columns: Array.isArray(event.rows) && event.rows[0] ? Object.keys(event.rows[0]) : [],
        });
        if (event.type === 'session_titled' && slug && activeSessionId) {
          try { fs.updateSessionTitle(slug, activeSessionId, event.title); } catch {}
        }
      },
    });

    if (slug && activeSessionId && !ephemeral) {
      if (assistantBuffer.trim()) {
        try {
          fs.appendSessionTurn(slug, activeSessionId, {
            kind: 'assistant',
            text: assistantBuffer,
            ts: new Date().toISOString(),
          });
        } catch {}
      }
      for (const ev of events) {
        try { fs.appendSessionTurn(slug, activeSessionId, { ...ev, ts: new Date().toISOString() }); } catch {}
      }
    }

    sendEvent({ type: 'done' });
  } catch (err) {
    sendEvent({ type: 'error', message: 'Something went wrong. Please try again.' });
  }

  res.end();
});

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b && b.type === 'text').map(b => b.text).join('');
  }
  return '';
}

function trimMessages(messages, maxTurns) {
  if (messages.length <= maxTurns) return messages;
  const head = messages.slice(0, 1);
  const tail = messages.slice(-maxTurns + 1);
  return [...head, ...tail];
}

module.exports = router;
