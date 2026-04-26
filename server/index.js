'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

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

function findPidsOnPort(port) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') return resolve([]);
    execFile('lsof', ['-ti', `:${port}`], (err, stdout) => {
      if (err && err.code !== 1) return resolve([]);
      const pids = (stdout || '')
        .split('\n')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid);
      resolve(pids);
    });
  });
}

async function tryFreePort(port) {
  const pids = await findPidsOnPort(port);
  if (!pids.length) return false;
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  await new Promise((r) => setTimeout(r, 300));
  const stillThere = await findPidsOnPort(port);
  for (const pid of stillThere) {
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
  if (stillThere.length) await new Promise((r) => setTimeout(r, 200));
  return true;
}

async function startServer() {
  const app = createApp();
  let retried = false;

  const listen = () => {
    const server = app.listen(PORT, HOST, async () => {
      console.log(`\n  vorDBeste running at http://localhost:${PORT}\n`);
      try {
        const { default: open } = await import('open');
        await open(`http://localhost:${PORT}`);
      } catch {
        // open is optional
      }
    });

    server.on('error', async (err) => {
      if (err.code === 'EADDRINUSE' && !retried) {
        retried = true;
        console.log(`  Port ${PORT} is busy — freeing it…`);
        const freed = await tryFreePort(PORT);
        if (freed) return listen();
        console.error(`\n  Port ${PORT} is already in use. Run: lsof -ti :${PORT} | xargs kill\n`);
      } else if (err.code === 'EADDRINUSE') {
        console.error(`\n  Port ${PORT} is already in use. Run: lsof -ti :${PORT} | xargs kill\n`);
      } else {
        console.error(err);
      }
      process.exit(1);
    });
  };

  listen();
}

module.exports = { startServer, createApp };

if (require.main === module) {
  startServer();
}
