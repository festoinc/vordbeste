'use strict';

const express = require('express');
const router = express.Router();
const { fetchModels } = require('../ai/index');
const { readConfig } = require('../config');

// GET /api/models/current — fetch models using stored config
router.get('/current', async (req, res) => {
  const cfg = readConfig();
  if (!cfg || !cfg.provider || !cfg.apiKey) {
    return res.status(400).json({ error: 'No provider configured' });
  }
  try {
    const models = await fetchModels(cfg.provider, cfg.apiKey);
    res.json({ models, provider: cfg.provider });
  } catch (err) {
    res.status(400).json({ error: 'Could not fetch models. Check your API key.' });
  }
});

// POST /api/models — body: { provider, apiKey }
router.post('/', async (req, res) => {
  const { provider, apiKey } = req.body;
  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'provider and apiKey are required' });
  }
  try {
    const models = await fetchModels(provider, apiKey);
    res.json({ models });
  } catch (err) {
    res.status(400).json({ error: 'Could not fetch models. Check your API key.' });
  }
});

module.exports = router;
