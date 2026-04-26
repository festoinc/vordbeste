import { describe, it, expect } from 'vitest';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { assertSlug, assertIdent, assertSessionId, safeJoin } = require('./paths');

describe('assertSlug', () => {
  it('accepts normal slugs', () => {
    expect(() => assertSlug('localhost-5432-myapp')).not.toThrow();
    expect(() => assertSlug('a1')).not.toThrow();
  });
  it('rejects traversal', () => {
    expect(() => assertSlug('..')).toThrow();
    expect(() => assertSlug('../etc')).toThrow();
    expect(() => assertSlug('a/b')).toThrow();
    expect(() => assertSlug('a\\b')).toThrow();
  });
  it('rejects leading dash, dot, empty', () => {
    expect(() => assertSlug('-foo')).toThrow();
    expect(() => assertSlug('.foo')).toThrow();
    expect(() => assertSlug('')).toThrow();
  });
  it('rejects upper case', () => {
    expect(() => assertSlug('Foo')).toThrow();
  });
  it('rejects non-strings', () => {
    expect(() => assertSlug(undefined)).toThrow();
    expect(() => assertSlug(null)).toThrow();
    expect(() => assertSlug(123)).toThrow();
  });
});

describe('assertIdent', () => {
  it('accepts SQL identifiers', () => {
    expect(() => assertIdent('users')).not.toThrow();
    expect(() => assertIdent('User_Profile_2024')).not.toThrow();
    expect(() => assertIdent('_internal')).not.toThrow();
  });
  it('rejects starting with digit', () => {
    expect(() => assertIdent('1users')).toThrow();
  });
  it('rejects traversal-y forms', () => {
    expect(() => assertIdent('../etc')).toThrow();
    expect(() => assertIdent('a/b')).toThrow();
    expect(() => assertIdent('a;b')).toThrow();
  });
});

describe('assertSessionId', () => {
  it('accepts numeric epoch ids', () => {
    expect(() => assertSessionId(String(Date.now()))).not.toThrow();
  });
  it('rejects non-numeric', () => {
    expect(() => assertSessionId('abc')).toThrow();
    expect(() => assertSessionId('../etc/passwd')).toThrow();
  });
});

describe('safeJoin', () => {
  const base = path.resolve('/tmp/vordbeste-test');
  it('joins regular subpaths', () => {
    expect(safeJoin(base, 'a', 'b.txt')).toBe(path.resolve(base, 'a/b.txt'));
  });
  it('throws on traversal', () => {
    expect(() => safeJoin(base, '..', 'evil')).toThrow();
    expect(() => safeJoin(base, 'a/../../evil')).toThrow();
  });
  it('rejects absolute that escapes base', () => {
    expect(() => safeJoin(base, '/etc/passwd')).toThrow();
  });
});
