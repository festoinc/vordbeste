import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { checkSelectOnly, enforceLimit } = require('./sqlSafety');

describe('checkSelectOnly — allows', () => {
  const cases = [
    'SELECT 1',
    'SELECT * FROM users',
    'SELECT id, name FROM users WHERE active = true LIMIT 10',
    'SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id',
    "WITH recent AS (SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '7 days') SELECT COUNT(*) FROM recent",
    'SELECT DISTINCT status FROM orders',
    'SELECT a FROM t UNION SELECT b FROM u',
  ];
  for (const sql of cases) {
    it(`accepts: ${sql.slice(0, 60)}`, () => {
      const r = checkSelectOnly(sql, 'postgres');
      expect(r.safe, r.reason).toBe(true);
    });
  }
});

describe('checkSelectOnly — blocks writes', () => {
  const cases = [
    'INSERT INTO users (id) VALUES (1)',
    "UPDATE users SET name = 'x'",
    'DELETE FROM users',
    'DROP TABLE users',
    'TRUNCATE users',
    'CREATE TABLE x (id int)',
    'ALTER TABLE x ADD COLUMN y int',
    'GRANT SELECT ON users TO bob',
  ];
  for (const sql of cases) {
    it(`rejects: ${sql.slice(0, 60)}`, () => {
      const r = checkSelectOnly(sql, 'postgres');
      expect(r.safe).toBe(false);
    });
  }
});

describe('checkSelectOnly — blocks multi-statement', () => {
  it('rejects two SELECTs separated by ;', () => {
    const r = checkSelectOnly('SELECT 1; SELECT 2', 'postgres');
    expect(r.safe).toBe(false);
  });

  it('rejects SELECT; DROP', () => {
    const r = checkSelectOnly('SELECT 1; DROP TABLE users', 'postgres');
    expect(r.safe).toBe(false);
  });
});

describe('checkSelectOnly — blocks dangerous functions', () => {
  it('blocks pg_read_server_files', () => {
    const r = checkSelectOnly("SELECT pg_read_server_files('/etc/passwd')", 'postgres');
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/pg_read_server_files/);
  });

  it('blocks lo_export', () => {
    const r = checkSelectOnly("SELECT lo_export(16389, '/tmp/x')", 'postgres');
    expect(r.safe).toBe(false);
  });

  it('blocks load_file on MySQL', () => {
    const r = checkSelectOnly("SELECT load_file('/etc/passwd')", 'mysql');
    expect(r.safe).toBe(false);
  });

  it('blocks nested dangerous calls', () => {
    const r = checkSelectOnly("SELECT length(pg_read_file('/etc/passwd')) FROM users", 'postgres');
    expect(r.safe).toBe(false);
  });
});

describe('checkSelectOnly — blocks data-modifying CTE', () => {
  it('rejects WITH ... DELETE ... SELECT', () => {
    const sql = 'WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d';
    const r = checkSelectOnly(sql, 'postgres');
    expect(r.safe).toBe(false);
  });
});

describe('checkSelectOnly — empty / garbage', () => {
  it('rejects empty', () => {
    expect(checkSelectOnly('', 'postgres').safe).toBe(false);
    expect(checkSelectOnly('   ', 'postgres').safe).toBe(false);
  });
  it('rejects garbage', () => {
    expect(checkSelectOnly('this is not sql', 'postgres').safe).toBe(false);
  });
});

describe('enforceLimit', () => {
  it('wraps a plain SELECT', () => {
    const out = enforceLimit('SELECT * FROM users');
    expect(out).toMatch(/LIMIT 100$/);
    expect(out).toContain('SELECT * FROM users');
  });

  it('strips trailing semicolons', () => {
    const out = enforceLimit('SELECT * FROM users;');
    expect(out).not.toMatch(/;\s*\)/);
    expect(out).toMatch(/LIMIT 100$/);
  });

  it('caps even if user query already has LIMIT', () => {
    const out = enforceLimit('SELECT * FROM users LIMIT 999999');
    expect(out).toMatch(/LIMIT 100$/);
  });

  it('handles UNION', () => {
    const out = enforceLimit('SELECT a FROM t UNION SELECT b FROM u');
    expect(out).toContain('UNION');
    expect(out).toMatch(/LIMIT 100$/);
  });
});
