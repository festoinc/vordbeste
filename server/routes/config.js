'use strict';

const express = require('express');
const router = express.Router();
const { readConfig, writeConfig } = require('../config');

router.get('/', (req, res) => {
  const config = readConfig();
  if (!config) return res.json({ configured: false });
  // Never send the actual API key to the client
  res.json({ configured: true, provider: config.provider, model: config.model });
});

router.post('/', (req, res) => {
  const { provider, apiKey, model } = req.body;
  if (!provider || !apiKey || !model) {
    return res.status(400).json({ error: 'provider, apiKey, and model are required' });
  }
  writeConfig({ provider, apiKey, model });
  res.json({ ok: true });
});

module.exports = router;
