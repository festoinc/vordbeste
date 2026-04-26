'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const configRoutes = require('./routes/config');
const modelsRoutes = require('./routes/models');
const databasesRoutes = require('./routes/databases');
const chatRoutes = require('./routes/chat');
const { hostGuard, tokenGuard, getLaunchToken } = require('./auth');

const PORT = Number(process.env.VORDBESTE_PORT) || 3456;
const HOST = '127.0.0.1';

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(hostGuard);
  app.use(bodyParser.json({ limit: '2mb' }));

  // Tiny endpoint the SPA calls only when token wasn't injected (e.g. dev mode).
  // It's still host-guarded, so only same-origin browsers reach it.
  app.get('/api/launch-token', (req, res) => {
    res.json({ token: getLaunchToken() });
  });

  app.use('/api/config', tokenGuard, configRoutes);
  app.use('/api/models', tokenGuard, modelsRoutes);
  app.use('/api/databases', tokenGuard, databasesRoutes);
  app.use('/api/chat', tokenGuard, chatRoutes);

  // Serve built React app — inject token into index.html so the SPA doesn't
  // need a separate fetch for it.
  const clientDist = path.join(__dirname, '../dist/client');
  if (fs.existsSync(clientDist)) {
    app.get('/', serveIndex(clientDist));
    app.use(express.static(clientDist, { index: false }));
    app.get(/^\/(?!api\/).*/, serveIndex(clientDist));
  }

  return app;
}

function serveIndex(clientDist) {
  return (req, res) => {
    const indexPath = path.join(clientDist, 'index.html');
    let html;
    try {
      html = fs.readFileSync(indexPath, 'utf8');
    } catch {
      return res.status(500).send('Client build missing');
    }
    const tag = `<meta name="vordbeste-token" content="${getLaunchToken()}">`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `  ${tag}\n</head>`);
    } else {
      html = tag + html;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  };
}

async function startServer() {
  const app = createApp();

  const server = app.listen(PORT, HOST, async () => {
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

if (require.main === module) {
  startServer();
}
