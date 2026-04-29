'use strict';

const dbDriver = require('../db/index');
const fs = require('../fileSystem');
const { checkSelectOnly, enforceLimit } = require('./sqlSafety');

// ── Tool definitions (schema sent to LLM) ────────────────────────────

const CONNECT_DB_TOOL = {
  name: 'connect_db',
  description: 'Connect to a PostgreSQL or MySQL database. Collects credentials, tests the connection, and saves it. Call this only when the user wants to add a new database connection.',
  input_schema: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'A friendly name for this database (e.g. "Production DB")' },
      type: { type: 'string', enum: ['postgres', 'mysql'], description: 'Database type' },
      host: { type: 'string', description: 'Database host' },
      port: { type: 'string', description: 'Database port' },
      database: { type: 'string', description: 'Database name' },
      user: { type: 'string', description: 'Database username' },
      password: { type: 'string', description: 'Database password' },
      ssl: { type: 'boolean', description: 'Enable SSL/TLS encryption. Set to true for cloud databases (Aiven, RDS, Heroku, Supabase, etc.) that require secure connections.' },
    },
    required: ['type', 'host', 'database', 'user', 'password'],
  },
};

const LIST_TABLES_TOOL = {
  name: 'list_tables',
  description: 'List all tables available in the current database, including their documented status.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const PRINT_RESULT_TOOL = {
  name: 'print_result',
  description: 'Execute a SELECT query and display the result as a card with foldable SQL and a 5-row preview. ALWAYS write your explanation as plain text BEFORE calling this tool — never put narrative or commentary inside the tool input. The card is purely the data view.',
  input_schema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'The SELECT query to execute and show.' },
    },
    required: ['sql'],
  },
};

const PROBE_TABLE_TOOL = {
  name: 'probe_table',
  description: 'Silently fetch up to 10 sample rows from a table to inspect real values and shape (e.g. what statuses exist, date formats, enum-like columns). Results are visible to you only — never shown to the user. Use this during exploration before writing the final query, especially when a column might have a constrained set of values worth clarifying.',
  input_schema: {
    type: 'object',
    properties: {
      table_name: { type: 'string', description: 'Exact table name to sample from' },
    },
    required: ['table_name'],
  },
};

const RUN_DESCRIBE_TOOL = {
  name: 'run_describe',
  description: 'Run a DESCRIBE or information_schema query to inspect table structure.',
  input_schema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'The DESCRIBE or information_schema query' },
    },
    required: ['sql'],
  },
};

const UPDATE_TABLE_MD_TOOL = {
  name: 'update_table_md',
  description: 'Read or update the documentation file for a database table. Use this to read existing knowledge about a table, or to save new findings (column meanings, business rules, common patterns).',
  input_schema: {
    type: 'object',
    properties: {
      table_name: { type: 'string', description: 'Name of the table' },
      action: { type: 'string', enum: ['read', 'write'], description: 'Read the current doc or write an updated version' },
      content: { type: 'string', description: 'New markdown content to save (required when action is write)' },
    },
    required: ['table_name', 'action'],
  },
};

const NAME_CHAT_HISTORY_TOOL = {
  name: 'name_chat_history',
  description: 'Set a descriptive title for the current chat session based on what the user asked about. Call this after the first meaningful query.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short, descriptive title for this session (e.g. "Top customers by revenue")' },
    },
    required: ['title'],
  },
};

// ── Tool execution ────────────────────────────────────────────────────

async function executeTool(toolName, toolInput, context) {
  // context: { slug, sessionId, dbCreds, emit }
  const { slug, sessionId, dbCreds, emit } = context;
  const dbType = dbCreds?.type;

  switch (toolName) {
    case 'connect_db':
      return await executeConnectDb(toolInput, context);

    case 'list_tables': {
      const tables = fs.listTableMds(slug);
      if (tables.length === 0) {
        return { result: 'No tables documented yet. The database may need to be connected first.' };
      }
      return { result: `Available tables: ${tables.join(', ')}` };
    }

    case 'print_result': {
      const { sql } = toolInput;
      if (!sql) {
        return { error: 'print_result requires a SELECT query in "sql".' };
      }
      const check = checkSelectOnly(sql, dbType);
      if (!check.safe) {
        return { error: `Blocked: ${check.reason}. This app is read-only.` };
      }
      const safeSql = enforceLimit(sql);
      try {
        const result = await dbDriver.runSelect(slug, safeSql);
        emit({ type: 'print_result', sql: safeSql, rows: result.rows });
        return { success: true, rowCount: result.rowCount, rows: result.rows };
      } catch (err) {
        return { error: friendlyDbError(err) };
      }
    }

    case 'run_describe': {
      const { sql } = toolInput;
      const check = checkSelectOnly(sql, dbType, { allowDescribe: true });
      if (!check.safe) {
        return { error: `Blocked: ${check.reason}.` };
      }
      try {
        const result = await dbDriver.runDescribe(slug, sql);
        return { rows: result.rows, rowCount: result.rowCount };
      } catch (err) {
        return { error: friendlyDbError(err) };
      }
    }

    case 'probe_table': {
      const { table_name } = toolInput;
      try {
        const result = await dbDriver.probeTable(slug, table_name, 10);
        return { rows: result.rows, rowCount: result.rowCount };
      } catch (err) {
        return { error: friendlyDbError(err) };
      }
    }

    case 'update_table_md': {
      const { table_name, action, content } = toolInput;
      if (action === 'read') {
        const existing = fs.readTableMd(slug, table_name);
        if (!existing) {
          return { result: `No documentation found for table "${table_name}" yet.` };
        }
        return { result: existing };
      } else {
        fs.writeTableMd(slug, table_name, content);
        return { result: `Documentation for "${table_name}" saved.` };
      }
    }

    case 'name_chat_history': {
      const { title } = toolInput;
      if (slug && sessionId) {
        fs.updateSessionTitle(slug, sessionId, title);
        emit({ type: 'session_titled', title });
      }
      return { result: 'Session title saved.' };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function executeConnectDb(input, context) {
  const { emit } = context;
  const { label, type, host, port, database, user, password, ssl } = input;

  const creds = { label, type, host, port: port || (type === 'mysql' ? '3306' : '5432'), database, user, password, ssl: !!ssl };

  const slug = fs.makeDbSlug({ host, port: creds.port, database });

  try {
    await dbDriver.connect(slug, creds);
  } catch (err) {
    return { error: friendlyConnectionError(err) };
  }

  // Only persist credentials after a successful connect
  fs.writeDbEnv(slug, creds);

  try {
    const schema = await dbDriver.introspectSchema(slug);

    // Write initial table docs
    const tableNames = Object.keys(schema);
    for (const tableName of tableNames) {
      const cols = schema[tableName];
      const existing = fs.readTableMd(slug, tableName);
      if (!existing) {
        const md = buildInitialTableMd(tableName, cols);
        fs.writeTableMd(slug, tableName, md);
      }
    }

    emit({ type: 'db_connected', slug, label: label || database, tableCount: tableNames.length });

    return {
      result: `Successfully connected to "${label || database}"! Found ${tableNames.length} tables: ${tableNames.join(', ')}. The connection has been saved.`,
      slug,
    };
  } catch (err) {
    return { error: friendlyConnectionError(err) };
  }
}

function buildInitialTableMd(tableName, cols) {
  const colLines = cols.map(c => {
    const pk = c.pk ? ' (Primary Key)' : '';
    const nullable = c.nullable ? ' nullable' : '';
    return `- **${c.name}** — ${c.type}${pk}${nullable}`;
  });
  return `# Table: ${tableName}\n\n## Columns\n${colLines.join('\n')}\n\n## Notes\n\n_No additional notes yet._\n`;
}

function friendlyDbError(err) {
  const msg = err.message || '';
  if (msg.includes('column') && msg.includes('does not exist')) return 'That column doesn\'t seem to exist in the table. Let me check the table structure.';
  if (msg.includes('relation') && msg.includes('does not exist')) return 'That table doesn\'t seem to exist. Let me check what tables are available.';
  if (msg.includes('syntax error')) return 'There was an issue with the query syntax. Let me try a different approach.';
  if (msg.includes('permission denied')) return 'The database user doesn\'t have permission to access that data.';
  if (msg.includes('timeout')) return 'The query took too long. Try asking for a smaller date range or fewer results.';
  return 'Something went wrong with the query. Let me try again.';
}

function friendlyConnectionError(err) {
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('ssl') || msg.includes('tls') || msg.includes('sslmode')) return 'SSL_REQUIRED: This database requires an encrypted SSL connection. Retry the connection with ssl: true.';
  if (msg.includes('password') || msg.includes('authentication')) return 'The password or username is incorrect. Please double-check your credentials.';
  if (msg.includes('econnrefused') || msg.includes('connect econnrefused')) return `Can't reach the database server. Make sure the host and port are correct and the server is running.`;
  if (msg.includes('enotfound') || msg.includes('getaddrinfo')) return 'The database host was not found. Check the hostname and your network connection.';
  if (msg.includes('database') && msg.includes('does not exist')) return 'That database name doesn\'t exist on the server. Check the database name.';
  if (msg.includes('timeout')) return 'Connection timed out. The server may be unreachable or the host/port may be wrong.';
  return `Couldn't connect: ${err.message}`;
}

module.exports = {
  CONNECT_DB_TOOL,
  LIST_TABLES_TOOL,
  PRINT_RESULT_TOOL,
  PROBE_TABLE_TOOL,
  RUN_DESCRIBE_TOOL,
  UPDATE_TABLE_MD_TOOL,
  NAME_CHAT_HISTORY_TOOL,
  executeTool,
};
