import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { hostGuard, tokenGuard, getLaunchToken } = require('./auth');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

describe('hostGuard', () => {
  it('allows localhost on the default port', () => {
    const req = { headers: { host: 'localhost:3456' } };
    const res = mockRes();
    let called = false;
    hostGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('allows the vite dev host', () => {
    const req = { headers: { host: '127.0.0.1:5173' } };
    const res = mockRes();
    let called = false;
    hostGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('rejects an unknown host with 403', () => {
    const req = { headers: { host: 'evil.example.com' } };
    const res = mockRes();
    let called = false;
    hostGuard(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden host' });
  });

  it('rejects a missing host header', () => {
    const req = { headers: {} };
    const res = mockRes();
    let called = false;
    hostGuard(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});

describe('tokenGuard', () => {
  const token = getLaunchToken();

  it('accepts a valid Bearer token', () => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    let called = false;
    tokenGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('accepts case-insensitive Bearer scheme', () => {
    const req = { headers: { authorization: `bearer ${token}` } };
    const res = mockRes();
    let called = false;
    tokenGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('accepts a valid x-vordbeste-token header', () => {
    const req = { headers: { 'x-vordbeste-token': token } };
    const res = mockRes();
    let called = false;
    tokenGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('rejects a wrong token with 401', () => {
    const req = { headers: { authorization: 'Bearer not-the-token' } };
    const res = mockRes();
    let called = false;
    tokenGuard(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects a missing Authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    let called = false;
    tokenGuard(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token of equal length but different bytes', () => {
    const sameLengthBogus = 'x'.repeat(token.length);
    const req = { headers: { authorization: `Bearer ${sameLengthBogus}` } };
    const res = mockRes();
    let called = false;
    tokenGuard(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe('getLaunchToken', () => {
  it('returns a stable, sufficiently long hex token', () => {
    const a = getLaunchToken();
    const b = getLaunchToken();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});
