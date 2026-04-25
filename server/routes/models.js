'use strict';

const express = require('express');
const router = express.Router();
const { fetchModels } = require('../ai/index');

// GET /api/models?provider=anthropic&apiKey=sk-...
router.get('/', async (req, res) => {
  const { provider, apiKey } = req.query;
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
