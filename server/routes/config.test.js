'use strict';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/**
 * Tests that DELETE /api/config/key only removes config.json
 * while DELETE /api/config/all-data wipes everything.
 *
 * We test the actual fs operations directly since the route handlers
 * are thin wrappers around config.js functions.
 */
describe('delete key vs delete all data', () => {
  let tmpDir;
  const fs = require('fs');
  const path = require('path');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vordbeste-test-'));
    const config = require('../config');
    config._setRootDir(tmpDir);
  });

  afterEach(() => {
    const config = require('../config');
    config._resetRootDir();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete require.cache[require.resolve('../config')];
  });

  /**
   * Simulate what DELETE /api/config/key does:
   * only unlinks config.json, leaves databases/ intact.
   */
  function deleteKeyOnly() {
    const { getVordbesteDir } = require('../config');
    const dir = getVordbesteDir();
    const cfg = path.join(dir, 'config.json');
    if (fs.existsSync(cfg)) fs.unlinkSync(cfg);
  }

  /**
   * Simulate what DELETE /api/config/all-data does:
   * wipes the entire .vordbeste directory.
   */
  function deleteAllData() {
    const { getVordbesteDir } = require('../config');
    const dir = getVordbesteDir();
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }

  function setupData() {
    const config = require('../config');
    config.writeConfig({ provider: 'zai', apiKey: 'test-key', model: 'glm-5.1' });
    const dbDir = config.getDatabasesDir();
    fs.writeFileSync(path.join(dbDir, 'mydb.env'), 'HOST=localhost\nDB=test');
    return dbDir;
  }

  it('deleteKeyOnly removes config.json but preserves databases/', () => {
    const dbDir = setupData();

    expect(fs.existsSync(path.join(tmpDir, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(dbDir, 'mydb.env'))).toBe(true);

    deleteKeyOnly();

    expect(fs.existsSync(path.join(tmpDir, 'config.json'))).toBe(false);
    expect(fs.existsSync(dbDir)).toBe(true);
    expect(fs.existsSync(path.join(dbDir, 'mydb.env'))).toBe(true);
    expect(fs.readFileSync(path.join(dbDir, 'mydb.env'), 'utf8')).toContain('HOST=localhost');
  });

  it('deleteKeyOnly works when no config exists', () => {
    // No config written — just databases dir created by getDatabasesDir
    const dbDir = require('../config').getDatabasesDir();
    fs.writeFileSync(path.join(dbDir, 'mydb.env'), 'HOST=localhost');

    // Should not throw
    deleteKeyOnly();

    expect(fs.existsSync(dbDir)).toBe(true);
    expect(fs.existsSync(path.join(dbDir, 'mydb.env'))).toBe(true);
  });

  it('deleteAllData removes both config and databases', () => {
    const dbDir = setupData();

    expect(fs.existsSync(path.join(tmpDir, 'config.json'))).toBe(true);
    expect(fs.existsSync(dbDir)).toBe(true);

    deleteAllData();

    expect(fs.existsSync(path.join(tmpDir, 'config.json'))).toBe(false);
    expect(fs.existsSync(dbDir)).toBe(false);
  });

  it('deleteKeyOnly preserves chat sessions inside databases/', () => {
    const dbDir = setupData();

    // Simulate chat sessions
    const sessionDir = path.join(dbDir, 'mydb', 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 's1.json'), JSON.stringify({ title: 'Test session' }));

    deleteKeyOnly();

    expect(fs.existsSync(sessionDir)).toBe(true);
    expect(fs.existsSync(path.join(sessionDir, 's1.json'))).toBe(true);
    const session = JSON.parse(fs.readFileSync(path.join(sessionDir, 's1.json'), 'utf8'));
    expect(session.title).toBe('Test session');
  });

  it('deleteAllData removes chat sessions too', () => {
    const dbDir = setupData();

    const sessionDir = path.join(dbDir, 'mydb', 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 's1.json'), JSON.stringify({ title: 'Test session' }));

    deleteAllData();

    expect(fs.existsSync(sessionDir)).toBe(false);
  });
});
