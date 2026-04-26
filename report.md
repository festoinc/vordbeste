# vorDBeste — Architecture Review

Top 7 problems, ranked by severity. Findings reference concrete files and lines.

---

## 1. Path traversal via unvalidated `slug` / `tableName` / `sessionId`

**Why it is important**
Every filesystem helper in `server/fileSystem.js` (`getDbDir`, `readTableMd`, `writeTableMd`, `readSession`, `writeSession`, `updateSessionTitle`, `writeSessionTranscript`) joins a user-controlled string straight into a path under `~/.vordbeste/...` with no validation. The values flow from request params (`server/routes/databases.js:51,63,70,86`) and the chat body (`server/routes/chat.js:27`). A request like `GET /api/databases/..%2F..%2F..%2F.ssh/sessions/id_rsa` resolves to `~/.ssh/id_rsa`. `writeTableMd` and `writeSessionTranscript` give an attacker primitives to write arbitrary file contents anywhere the user can write — including `~/.zshrc`, launchd plists, or the app's own `dist/`. Combined with the lack of auth (problem #2), this is a remote-ish file-write from any browser tab the user has open.

**How to fix it**
- Add a strict slug validator (`/^[a-z0-9][a-z0-9-]{0,63}$/`) and reject anything that doesn't match before touching the FS. Same for `tableName` (already has `IDENT_RE` in `server/db/index.js:48`, just reuse it) and `sessionId` (`/^\d{10,16}$/`).
- After joining, call `path.resolve` and verify the result still starts with the expected base (`getDatabasesDir()`); throw if it escapes.
- Centralise this in one `safeJoin(base, ...parts)` helper and replace every `path.join` in `fileSystem.js` with it.

**Severity:** Critical

---

## 2. No auth + permissive CORS on a privileged local server

**Why it is important**
`server/index.js:18` mounts `cors()` with default options — `Access-Control-Allow-Origin: *` and reflected credentials are not blocked at the browser layer for "simple" requests. The server has no auth at all, runs SQL against the user's databases, holds the LLM API key, and exposes `DELETE /api/config/all-data` (`server/routes/config.js:49`). Any web page the user visits while `vordbeste` is running can issue `fetch('http://localhost:3456/api/chat', { method: 'POST', body: ... })` and:
- Drive the LLM to enumerate tables and exfiltrate rows via the SSE stream.
- Wipe `~/.vordbeste` via `DELETE /api/config/all-data`.
- DNS-rebind a hostname to `127.0.0.1` and bypass even browser same-origin assumptions because `Host:` is unchecked.

For a "local-first, BYOK" product this directly contradicts the privacy promise in the constitution.

**How to fix it**
- Drop `cors()` entirely; the SPA is served from the same origin in production. In dev, scope it to `http://localhost:5173` only.
- Add an origin/host allowlist middleware: reject requests whose `Host` header is not `localhost:3456` / `127.0.0.1:3456` (defeats DNS rebinding).
- Generate a random per-launch token, inject it into the served `index.html`, and require it as an `Authorization` header on every `/api/*` route.
- Bind the listener to `127.0.0.1` explicitly — `app.listen(PORT, '127.0.0.1', ...)` — so it isn't reachable from LAN.

**Severity:** Critical

---

## 3. SQL safety is regex-based and bypassable

**Why it is important**
`server/ai/sqlSafety.js` strips quoted strings and comments, then keyword-matches against a fixed blocklist. Real attack surface that slips through:
- **PostgreSQL data-modifying CTEs:** `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x` — `DELETE` is in the list and matches, OK; but `WITH x AS (UPDATE ...) ...` matches too. However `COPY`, `SET`, `SHOW`, `LISTEN`, `NOTIFY`, `LOCK`, `VACUUM`, `ANALYZE`, `CLUSTER`, `REINDEX`, `RESET`, `DISCARD`, `LOAD`, `PREPARE`, `DEALLOCATE`, `CHECKPOINT` are **not** blocked. `COPY ... TO PROGRAM` on Postgres can run shell commands; `COPY ... FROM` on a superuser writes data.
- **Dollar-quoted strings** (`$$ ... $$`, `$tag$ ... $tag$`) are not stripped, so an attacker can hide a keyword inside, but more importantly literals like `$$;DROP TABLE x;$$` survive the string-stripping regex and can confuse downstream parsers.
- **Multi-statement queries**: `pg`/`mysql2` happily run `SELECT 1; <anything>` in `pool.query`. The blocklist matches the second statement's keyword, so this is mitigated — but `print_result`'s `enforceLimit` only trims a single trailing `;` and naively appends `LIMIT 100`, producing broken SQL when the input has multiple statements or a trailing `OFFSET`/`FOR UPDATE`/comment.
- **Filesystem reads via SELECT**: `SELECT pg_read_server_files(...)`, `lo_export(...)`, `SELECT * FROM pg_ls_dir(...)` are pure SELECTs and pass the check, but exfiltrate server files when the DB role has the privileges.

Trusting an LLM-generated string against a regex is the wrong defence model.

**How to fix it**
- Use a real SQL parser (`pgsql-ast-parser` for Postgres, `node-sql-parser` covering both) and reject anything whose top-level statement(s) aren't a single `SELECT` / `WITH ... SELECT`. Walk the AST to ensure no `INSERT`/`UPDATE`/`DELETE` CTEs and no calls to a denylist of dangerous functions (`pg_read_server_files`, `pg_read_binary_file`, `lo_export`, `pg_ls_dir`, `dblink*`, `copy`).
- Enforce read-only at the **connection** layer too. Postgres: `SET default_transaction_read_only = on` on every checkout, or wrap each query in `BEGIN READ ONLY; ... ROLLBACK;`. MySQL: `SET SESSION TRANSACTION READ ONLY`. This makes the DB the source of truth, not a regex.
- Recommend (in docs) connecting with a dedicated read-only DB user; surface it in the connect flow.
- Replace `enforceLimit`'s string concatenation with AST-based limit injection (or wrap as `SELECT * FROM (<user sql>) AS _v LIMIT 100`).

**Severity:** Critical

---

## 4. Secrets stored in plaintext, no permission hardening

**Why it is important**
`~/.vordbeste/config.json` contains the LLM API key in cleartext (`server/config.js:27`); `~/.vordbeste/databases/<slug>/.env` contains DB passwords in cleartext (`server/fileSystem.js:33-46`). Neither file is `chmod 600`d, so they default to the umask (typically 644) — readable by other local users on shared machines and trivially picked up by backup tools, Spotlight, time machine, or any package the user `npm install`s with a postinstall script. The API key is also POSTed from the SPA to the server in `POST /api/config` over plain HTTP (`server/routes/config.js:14`); fine on loopback today but means there's no path to remote-host the server later without leaking the key.

**How to fix it**
- Write config and `.env` files with explicit mode `0o600`; verify mode on read and refuse to load if it's wider.
- Use the OS keychain for the LLM key and DB passwords (`keytar` or shelling out to `security`/`secret-tool`/`wincred`). Keep the JSON for non-secret prefs only.
- If a file fallback is kept, encrypt with a key derived from `os.userInfo().username + machine-id` via `crypto.scryptSync` — not strong, but stops casual reads.
- Mask the key in any log path; today nothing logs it but there's no rule preventing it.

**Severity:** High

---

## 5. Session transcript persistence is O(N²) and dumps row data verbatim

**Why it is important**
`server/routes/chat.js:67` calls `fs.writeSessionTranscript(slug, activeSessionId, messages)` with the full message array on every request, and `writeSessionTranscript` (`server/fileSystem.js:161`) re-serialises the entire array and rewrites the markdown file. For a 50-turn session this is quadratic in disk I/O.

Worse, the persisted blob is the **raw Anthropic content array** including `tool_use` and tool-result strings. Tool results contain rows from `probe_table` and `print_result` — i.e. real user data lands in `~/.vordbeste/databases/*/sessions/*.md` in the clear, indefinitely, with no retention policy. The blob is also re-sent to the API on every turn, growing the prompt unbounded and matching neither Anthropic's nor OpenAI's expected message format on round-trip (the OpenRouter path at `server/ai/providers/openrouter.js:56` flattens content via `extractText` which silently drops `tool_use` blocks, so resumed sessions desync).

**How to fix it**
- Append-only transcript: store one JSONL file per session, append per turn. Keep frontmatter in a sibling `meta.json`.
- Store a **redacted** transcript on disk: keep user text, assistant text, tool *names* and *arg shapes*, but not raw rows. Keep rows in memory for the live session only, or behind an explicit "save sample data" toggle.
- Fix the round-trip: the assistant history sent back to the API needs to be the provider-native shape it was produced in (Anthropic blocks for Anthropic, OpenAI tool_calls for OpenAI). Persist a normalised form and rebuild for the active provider.
- Cap retained turns / total bytes per request with a sliding window so prompts don't grow unbounded.

**Severity:** High

---

## 6. Connection pools accumulate and `/api/databases` auto-connects everything

**Why it is important**
`server/db/index.js` keeps a module-level `connections` Map keyed by slug. There is **no eviction**: pools live until the process exits. `GET /api/databases` (`server/routes/databases.js:10-48`) iterates every saved DB and, if not currently connected, calls `dbDriver.connect(slug, creds)` — meaning every visit to the DB list page silently opens a live pool to every database the user ever connected to, including ones they never intend to use this session. Each pool is `connectionLimit: 5` (mysql) / unbounded (pg `Pool` default 10). Failed-then-recovered networks, expired credentials, or rotated passwords show as silent log noise, never surfaced to the UI.

There's also a subtle lifecycle bug: `chat.js:47-55` reconnects on demand but never disconnects on errors, and `executeConnectDb` (`server/ai/tools.js:204`) calls `dbDriver.connect` which itself disconnects-and-reconnects — fine — but the test connection at `tools.js:194` opens a *separate* pool that is then immediately ended, doubling the connect roundtrips on every connect_db call.

**How to fix it**
- Make `/api/databases` a pure listing endpoint: read `.env` files, return `status: 'unknown'`. Connect lazily only when the user opens a DB or starts a chat.
- Add an LRU with a max-pool count (e.g. 3) and an idle timeout (e.g. 5 min) that calls `disconnect(slug)` on eviction.
- Fold `testConnection` into `connect` so it doesn't open a throwaway pool — reuse the result of the first successful `connect`.
- Surface connect failures in the UI per-DB rather than swallowing in a `try/catch` with an `'offline'` string.

**Severity:** Medium

---

## 7. No tests, no linting, no CI quality gate

**Why it is important**
`package.json` has only `dev`, `build`, `start` — no `test`, no lint, no typecheck. There is no `eslint`, `prettier`, or test runner in `devDependencies`. For a tool whose entire job is to take LLM output and run it against the user's production database, this is the wrong risk posture: every bug in `sqlSafety.js`, `enforceLimit`, the path-traversal surface, and the SSE protocol is shipped untested, and there's no regression net for the next refactor. A single typo in the keyword regex or in `IDENT_RE` is silent.

**How to fix it**
- Add `vitest` (one runner for client + server). Start with the highest-leverage suites:
  - `sqlSafety.test.js`: a corpus of allowed SELECTs and a corpus of attacks (CTE writes, `COPY`, dollar quotes, `pg_read_server_files`, multi-statement, comments inside keywords). Each must pass/fail explicitly.
  - `fileSystem.test.js`: every helper must reject `..`, absolute paths, slashes, NULs, unicode dots.
  - `enforceLimit.test.js`: queries with existing LIMIT, OFFSET, ORDER BY in CTE, UNION, trailing comments, multi-statement.
- Add `eslint` with `eslint:recommended` + `plugin:react/recommended`. Add a `tsc --noEmit` against `// @ts-check`'d server files (cheap, catches the easy ones).
- Wire a GitHub Actions workflow on PR: `npm ci && npm run lint && npm test && npm run build`. The repo already has `.github/`, so the slot is there.
- Block release tags on green CI before publishing to npm — currently `v0.1.5` was tagged with no automated verification.

**Severity:** Medium

---

## Summary

| # | Problem | Severity |
|---|---------|----------|
| 1 | Path traversal in filesystem helpers | Critical |
| 2 | No auth + permissive CORS on privileged server | Critical |
| 3 | Regex-based SQL safety is bypassable | Critical |
| 4 | Plaintext secrets at rest, no perms hardening | High |
| 5 | Quadratic transcript writes, raw row data on disk | High |
| 6 | Pool lifecycle: auto-connect-everything, no eviction | Medium |
| 7 | No tests, no linting, no CI | Medium |

The first three are blockers for shipping this beyond a personal-use tool — they undermine the local-first/BYOK promise the README makes. #4 and #5 leak user data; #6 and #7 are the foundation for being able to fix the rest safely.
