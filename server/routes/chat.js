'use strict';

const express = require('express');
const router = express.Router();
const { chat } = require('../ai/index');
const { readConfig } = require('../config');
const fs = require('../fileSystem');
const dbDriver = require('../db/index');

/**
 * POST /api/chat
 * Body: {
 *   messages: [{role, content}],   // full conversation so far
 *   slug?: string,                  // current DB slug (null for connect page)
 *   sessionId?: string,             // current session ID
 *   isConnectPage: boolean
 * }
 *
 * Response: SSE stream of events
 */
router.post('/', async (req, res) => {
  const config = readConfig();
  if (!config) {
    return res.status(401).json({ error: 'Not configured. Please set up your API key first.' });
  }

  const { messages, slug, sessionId, isConnectPage } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Load DB creds if we have a slug
  let dbCreds = null;
  if (slug) {
    dbCreds = fs.readDbEnv(slug);
    // Ensure connected
    if (!dbDriver.getConnection(slug) && dbCreds) {
      try {
        await dbDriver.connect(slug, dbCreds);
      } catch (err) {
        sendEvent({ type: 'error', message: 'Could not reconnect to the database. Please check the connection.' });
        res.end();
        return;
      }
    }
  }

  // Create or reuse session
  let activeSessionId = sessionId;
  if (!activeSessionId && slug) {
    const session = fs.createSession(slug);
    activeSessionId = session.id;
    sendEvent({ type: 'session_created', sessionId: activeSessionId });
  }

  // Persist the latest user message
  if (slug && activeSessionId) {
    fs.writeSessionTranscript(slug, activeSessionId, messages);
  }

  try {
    await chat({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      messages,
      slug,
      sessionId: activeSessionId,
      dbCreds,
      isConnectPage: !!isConnectPage,
      onEvent: (event) => {
        sendEvent(event);

        // Persist transcript updates after tool results that produce data
        if (event.type === 'tool_result' && slug && activeSessionId) {
          // We persist at the end, handled below
        }
      },
    });

    sendEvent({ type: 'done' });
  } catch (err) {
    sendEvent({ type: 'error', message: 'Something went wrong. Please try again.' });
  }

  res.end();
});

module.exports = router;
