'use strict';

const express = require('express');
const router = express.Router();
const { readConfig, writeConfig, getVordbesteDir } = require('../config');

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

// PATCH /api/config — partial update (e.g. change apiKey or model)
router.patch('/', (req, res) => {
  const cfg = readConfig();
  if (!cfg) return res.status(400).json({ error: 'No config found' });
  const updated = { ...cfg, ...req.body };
  writeConfig(updated);
  res.json({ ok: true });
});

// DELETE /api/config/provider/:provider — remove API key for a specific provider
router.delete('/provider/:provider', (req, res) => {
  const { provider } = req.params;
  const cfg = readConfig();
  if (!cfg) return res.status(400).json({ error: 'No config found' });
  if (cfg.provider === provider) {
    return res.status(400).json({ error: 'Cannot delete the active provider\'s key. Switch provider first.' });
  }
  // Store deleted keys per provider
  const keys = cfg.deletedProviderKeys || {};
  keys[provider] = true;
  cfg.deletedProviderKeys = keys;
  writeConfig(cfg);
  res.json({ ok: true });
});

// DELETE /api/config/key — remove only the API key config, preserve databases
router.delete('/key', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dir = getVordbesteDir();
  const cfg = path.join(dir, 'config.json');
  try {
    if (fs.existsSync(cfg)) {
      fs.unlinkSync(cfg);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete config: ' + err.message });
  }
});

// DELETE /api/config/all-data — wipe everything
router.delete('/all-data', (req, res) => {
  const fs = require('fs');
  const dir = getVordbesteDir();
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete data: ' + err.message });
  }
});

module.exports = router;
