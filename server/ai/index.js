'use strict';

const { buildSystemPrompt } = require('./systemPrompt');
const tools = require('./tools');

function getProviders() {
  return {
    anthropic: require('./providers/anthropic'),
    openrouter: require('./providers/openrouter'),
    zai: require('./providers/zai'),
  };
}

const ALL_TOOLS = [
  tools.LIST_TABLES_TOOL,
  tools.PRINT_RESULT_TOOL,
  tools.PROBE_TABLE_TOOL,
  tools.RUN_DESCRIBE_TOOL,
  tools.UPDATE_TABLE_MD_TOOL,
  tools.NAME_CHAT_HISTORY_TOOL,
];

const CONNECT_PAGE_TOOLS = [
  tools.CONNECT_DB_TOOL,
  tools.NAME_CHAT_HISTORY_TOOL,
];

/**
 * Run a chat turn.
 * @param {object} opts
 * @param {string} opts.provider - 'anthropic' | 'openrouter'
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {object[]} opts.messages - prior conversation [{role, content}]
 * @param {string|null} opts.slug - current DB slug (null on connect page)
 * @param {string|null} opts.sessionId
 * @param {object|null} opts.dbCreds
 * @param {boolean} opts.isConnectPage
 * @param {function} opts.onEvent - called for each streaming event
 */
async function chat({ provider, apiKey, model, messages, slug, sessionId, dbCreds, isConnectPage, onEvent }) {
  const systemPrompt = buildSystemPrompt({
    dbLabel: dbCreds?.label || slug || 'your database',
    dbType: dbCreds?.type || 'database',
    isConnectPage,
  });

  const activeTools = isConnectPage ? CONNECT_PAGE_TOOLS : ALL_TOOLS;

  const toolContext = { slug, sessionId, dbCreds, emit: onEvent };

  const onToolCall = (toolName, toolInput) =>
    tools.executeTool(toolName, toolInput, toolContext);

  const providers = getProviders();
  const runner = providers[provider];
  if (!runner) throw new Error(`Unknown provider: ${provider}`);

  const finalText = await runner.runLoop({
    apiKey,
    model,
    systemPrompt,
    messages,
    tools: activeTools,
    onEvent,
    onToolCall,
  });

  return finalText;
}

async function fetchModels(provider, apiKey) {
  const providers = getProviders();
  const p = providers[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  return p.fetchModels(apiKey);
}

module.exports = { chat, fetchModels };
