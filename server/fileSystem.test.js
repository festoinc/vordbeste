import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import nodeFs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const tmpHome = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'vordb-test-'));
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;

const requireCjs = createRequire(import.meta.url);
let fileSys;

beforeAll(() => {
  fileSys = requireCjs('./fileSystem');
});

describe('makeDbSlug', () => {
  it('produces a sanitized slug', () => {
    const s = fileSys.makeDbSlug({ host: 'My.Host_1', port: '5432', database: 'My App' });
    expect(s).toMatch(/^[a-z0-9][a-z0-9-]+$/);
  });
  it('falls back to a localhost slug when host/db are empty', () => {
    const s = fileSys.makeDbSlug({ host: '', port: '', database: '' });
    expect(s).toBe('localhost');
  });
  it('throws when nothing usable can be derived', () => {
    expect(() => fileSys.makeDbSlug({ host: '!!!', port: '', database: '' })).toThrow();
  });
});

describe('writeTableMd / readTableMd validate identifiers', () => {
  const slug = 'localhost-5432-test';
  beforeEach(() => fileSys.ensureDbDirs(slug));
  afterEach(() => {
    try { nodeFs.rmSync(path.join(tmpHome, '.vordbeste'), { recursive: true, force: true }); } catch {}
  });

  it('writes and reads a normal table doc', () => {
    fileSys.writeTableMd(slug, 'users', '# users');
    expect(fileSys.readTableMd(slug, 'users')).toBe('# users');
  });

  it('rejects path traversal in tableName', () => {
    expect(() => fileSys.writeTableMd(slug, '../evil', 'pwned')).toThrow();
    expect(() => fileSys.readTableMd(slug, '../evil')).toThrow();
  });

  it('rejects path traversal in slug', () => {
    expect(() => fileSys.writeTableMd('../etc', 'users', 'x')).toThrow();
  });
});

describe('session JSONL', () => {
  const slug = 'localhost-5432-sess';
  beforeEach(() => fileSys.ensureDbDirs(slug));
  afterEach(() => {
    try { nodeFs.rmSync(path.join(tmpHome, '.vordbeste'), { recursive: true, force: true }); } catch {}
  });

  it('appends and reads turns in order', () => {
    const { id } = fileSys.createSession(slug);
    fileSys.appendSessionTurn(slug, id, { kind: 'user', text: 'hi' });
    fileSys.appendSessionTurn(slug, id, { kind: 'assistant', text: 'hello' });
    const turns = fileSys.readSessionTurns(slug, id);
    expect(turns).toHaveLength(2);
    expect(turns[0].kind).toBe('user');
    expect(turns[1].text).toBe('hello');
  });

  it('updates session title in meta', () => {
    const { id } = fileSys.createSession(slug);
    fileSys.updateSessionTitle(slug, id, 'Top customers');
    const meta = fileSys.readSessionMeta(slug, id);
    expect(meta.title).toBe('Top customers');
  });

  it('rejects invalid sessionId on read', () => {
    expect(() => fileSys.readSessionTurns(slug, '../foo')).toThrow();
  });
});
