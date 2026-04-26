<div align="center">
  <img src="https://github.com/festoinc/vordbeste/blob/main/logo.png" alt="vorDBeste logo" width="320" />

  <h3>Talk to your database and learn with it </h3>

  <p>
    <em>vorbește</em> (Romanian) — to speak. + <strong>DB</strong>. = Speak to your database with AI.
  </p>

  <br />
</div>

---

vorDBeste helps **non-technical users** explore and understand their databases using natural language. No SQL knowledge required. No command line. Just talk.

## Features

- 🗣️ **Natural language interface** — ask questions in plain English, get answers from your database
- 🔒 **Read-only by design** — only `SELECT` and `DESCRIBE` queries are ever executed. Write operations are never sent to the database
- 🧠 **Clarify before executing** — the AI confirms its understanding of your intent before running queries, resolving ambiguity through conversation
- 📁 **Auto-documentation** — everything discovered during a session (table structures, business rules, useful queries, insights) is saved to markdown files
- 🌐 **Web UI** — clean browser-based interface, no CLI needed
- 🔑 **Bring your own key** — supports **Anthropic**, **OpenAI**, and **Ollama**
- 💾 **All data stored locally** — nothing is sent anywhere except your prompts to the chosen AI provider

## Install & Run with one command

```bash
npm install -g vordbeste && vordbeste
```

That's it. The server starts on `localhost:3456` and the browser opens automatically.

## Setup

On first launch, you'll be guided through a setup page to configure:

1. **Database connection** — PostgreSQL or MySQL
2. **AI provider** — Anthropic, OpenAI, or Ollama, and your API key

## Safety Guarantees

| Rule | Detail |
|------|--------|
| **Read-only** | Only `SELECT` and `DESCRIBE` queries are executed. Write operations (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`) are never sent to the database |
| **Bounded results** | Every query automatically gets `LIMIT 100`. Hard cap: `LIMIT 1000`. No unbounded queries |
| **Human-friendly errors** | Raw SQL errors and stack traces are never shown. Every situation triggers a clear, helpful explanation |
| **Clarification first** | Ambiguous questions are resolved through conversation before any query runs |

## How It Works

```
You ask a question in plain English
        ↓
  AI clarifies your intent (if needed)
        ↓
  AI generates a safe SELECT query
        ↓
  Query is executed against your database
        ↓
  Results are returned in a readable table
        ↓
  Session context is saved locally as markdown
```

## Session & Project Files

Each database gets its own project folder with:

```
~/.vordbeste/projects/
  └── my-database/
      ├── sessions/
      │   └── 2024-01-15-orders-analysis.md
      └── tables/
          ├── orders.md
          ├── customers.md
          └── products.md
```

Table files document discovered structure, column meanings, and useful queries. Session files capture the full conversation and insights.

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** React, Vite
- **AI:** Anthropic / OpenAI / Ollama
- **Databases:** PostgreSQL, MySQL

## License

MIT
