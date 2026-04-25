#vorDBeste — Project Constitution

> *vorbește* (Romanian) — to speak. + **DB**. = Speak to your database with AI.

---

## Mission

vorDBeste helps **non-technical users** explore and understand their databases using natural language. No SQL knowledge required. No command line. Just talk.

---

## Core Principles

### 1. Non-Technical First
Every error, every empty result, every ambiguity triggers a helpful human-readable explanation. Raw SQL errors, stack traces, and technical jargon are never shown to users. The app holds the user's hand through every step.

### 2. Read-Only by Design
Only `SELECT` and `DESCRIBE` queries are ever executed against the database. Write operations (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`) are **never** sent to the database. If a user wants to modify data, the AI writes the query for them to share with their tech team.

### 3. Bounded Results
Every `SELECT` query automatically gets `LIMIT 100` appended unless the user explicitly requests a different limit. Hard cap: `LIMIT 1000`. No unbounded queries. Ever.

### 4. Clarify Before Executing
The AI must confirm its understanding of the user's intent before running queries. Ambiguous business logic must be resolved through conversation first:
- "Do you mean all orders or just the completed ones?"
- "Should I include cancelled transactions too?"
- "Which date range are you interested in?"

### 5. Learn and Document
Everything discovered during a session (table structures, business rules, useful queries, insights) is saved to markdown files `(table-name).md`. Each database gets its own project folder with sessions and tables.

### 6. One Command to Run
`npm install -g vordbeste && vordbeste` installs and runs everything. UI + backend + AI orchestration in a single process. Server starts on `localhost:3456` and auto-opens the browser.

### 7. Bring Your Own Key
The user provides their own LLM API key. The app never sends it anywhere except to the chosen AI provider. Supported providers: **Anthropic**, **OpenAI**, **Ollama cloud** .


### 8. All user data stored locally
Data stored in local files and not shared anywhere 






