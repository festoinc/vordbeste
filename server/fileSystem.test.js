'use strict';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/**
 * Tests for session persistence round-trip.
 * Ensures that user messages, assistant text, and result metadata
 * survive write → read cycles intact.
 */
describe('session turn persistence', () => {
  let tmpDir;
  const fs = require('fs');
  const path = require('path');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vordbeste-sess-'));
    const config = require('./config');
    config._setRootDir(tmpDir);
  });

  afterEach(() => {
    const config = require('./config');
    config._resetRootDir();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete require.cache[require.resolve('./config')];
    delete require.cache[require.resolve('./fileSystem')];
  });

  function getFs() {
    return require('./fileSystem');
  }

  const SLUG = 'testdb-5432-mydb';

  it('round-trips user and assistant text turns', () => {
    const fileSystem = getFs();
    const session = fileSystem.createSession(SLUG);

    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'user', text: 'hello', ts: '2025-01-01T00:00:00Z' });
    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'assistant', text: 'hi there', ts: '2025-01-01T00:00:01Z' });

    const turns = fileSystem.readSessionTurns(SLUG, session.id);
    expect(turns).toHaveLength(2);
    expect(turns[0].kind).toBe('user');
    expect(turns[0].text).toBe('hello');
    expect(turns[1].kind).toBe('assistant');
    expect(turns[1].text).toBe('hi there');
  });

  it('round-trips result turns with sql, rowCount, and columns', () => {
    const fileSystem = getFs();
    const session = fileSystem.createSession(SLUG);

    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'user', text: 'show users', ts: '2025-01-01T00:00:00Z' });
    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'assistant', text: 'Here are the users:', ts: '2025-01-01T00:00:01Z' });
    fileSystem.appendSessionTurn(SLUG, session.id, {
      kind: 'result',
      sql: 'SELECT id, name FROM users LIMIT 10',
      rowCount: 10,
      columns: ['id', 'name'],
      ts: '2025-01-01T00:00:02Z',
    });

    const turns = fileSystem.readSessionTurns(SLUG, session.id);
    expect(turns).toHaveLength(3);

    const result = turns[2];
    expect(result.kind).toBe('result');
    expect(result.sql).toBe('SELECT id, name FROM users LIMIT 10');
    expect(result.rowCount).toBe(10);
    expect(result.columns).toEqual(['id', 'name']);
  });

  it('preserves result turns across multiple conversation rounds', () => {
    const fileSystem = getFs();
    const session = fileSystem.createSession(SLUG);

    // First round
    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'user', text: 'query 1', ts: 'T1' });
    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'assistant', text: 'answer 1', ts: 'T2' });
    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'result', sql: 'SQL1', rowCount: 5, columns: ['a'], ts: 'T3' });

    // Second round
    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'user', text: 'query 2', ts: 'T4' });
    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'assistant', text: 'answer 2', ts: 'T5' });
    fileSystem.appendSessionTurn(SLUG, session.id, { kind: 'result', sql: 'SQL2', rowCount: 20, columns: ['b'], ts: 'T6' });

    const turns = fileSystem.readSessionTurns(SLUG, session.id);
    expect(turns).toHaveLength(6);

    expect(turns[2].kind).toBe('result');
    expect(turns[2].sql).toBe('SQL1');
    expect(turns[5].kind).toBe('result');
    expect(turns[5].sql).toBe('SQL2');
  });

  it('returns empty array for session with no turns', () => {
    const fileSystem = getFs();
    const session = fileSystem.createSession(SLUG);

    const turns = fileSystem.readSessionTurns(SLUG, session.id);
    expect(turns).toEqual([]);
  });

  it('session meta includes correct id and title', () => {
    const fileSystem = getFs();
    const session = fileSystem.createSession(SLUG);

    const meta = fileSystem.readSessionMeta(SLUG, session.id);
    expect(meta.id).toBe(session.id);
    expect(meta.title).toBe('Untitled session');
    expect(meta.created_at).toBeDefined();

    fileSystem.updateSessionTitle(SLUG, session.id, 'Order queries');
    const updated = fileSystem.readSessionMeta(SLUG, session.id);
    expect(updated.title).toBe('Order queries');
  });

  it('lists sessions sorted newest first', () => {
    const fileSystem = getFs();

    const s1 = fileSystem.createSession(SLUG);
    // Ensure different timestamps
    fileSystem.updateSessionTitle(SLUG, s1.id, 'Older session');

    // Small delay to guarantee different timestamp
    const originalCreate = fileSystem.createSession;
    let forcedId = String(Number(s1.id) + 1000);
    const ts = forcedId;
    const fs2 = require('fs');
    const path2 = require('path');
    const config = require('./config');
    const sessionsDir = path2.join(config.getDatabasesDir(), SLUG, 'sessions');
    fs2.writeFileSync(path2.join(sessionsDir, `${ts}.meta.json`), JSON.stringify({
      id: ts, title: 'Newer session', created_at: new Date().toISOString(),
    }, null, 2), 'utf8');
    fs2.writeFileSync(path2.join(sessionsDir, `${ts}.jsonl`), '', 'utf8');

    const sessions = fileSystem.listSessions(SLUG);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    // Newest first
    expect(Number(sessions[0].id)).toBeGreaterThan(Number(sessions[sessions.length - 1].id));
    const titles = sessions.map(s => s.title);
    expect(titles).toContain('Newer session');
    expect(titles).toContain('Older session');
  });
});
