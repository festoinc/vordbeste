'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const configRoutes = require('./routes/config');
const modelsRoutes = require('./routes/models');
const databasesRoutes = require('./routes/databases');
const chatRoutes = require('./routes/chat');

const PORT = 3456;

function createApp() {
  const app = express();

  app.use(cors());
  app.use(bodyParser.json({ limit: '2mb' }));

  // API routes
  app.use('/api/config', configRoutes);
  app.use('/api/models', modelsRoutes);
  app.use('/api/databases', databasesRoutes);
  app.use('/api/chat', chatRoutes);

  // Serve built React app (production only — in dev, Vite serves on port 5173)
  const clientDist = path.join(__dirname, '../dist/client');
  const fs = require('fs');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}

async function startServer() {
  const app = createApp();

  const server = app.listen(PORT, async () => {
    console.log(`\n  vorDBeste running at http://localhost:${PORT}\n`);
    try {
      const { default: open } = await import('open');
      await open(`http://localhost:${PORT}`);
    } catch {
      // open is optional
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${PORT} is already in use. Run: lsof -ti :${PORT} | xargs kill\n`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

module.exports = { startServer, createApp };

// Run when called directly: node server/index.js
if (require.main === module) {
  startServer();
}
