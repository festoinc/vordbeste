'use strict';

const ZAI_BASE = 'https://api.z.ai/api/coding/paas/v4';

const FALLBACK_MODELS = [
  { value: 'glm-5.1', label: 'GLM 5.1' },
  { value: 'glm-5', label: 'GLM 5' },
  { value: 'glm-5-turbo', label: 'GLM 5 Turbo' },
  { value: 'glm-5v-turbo', label: 'GLM 5V Turbo' },
];

/**
 * Create an OpenAI-compatible client for z.ai.
 * Extracted into a function so tests can override it.
 */
let _createClient = (apiKey) => {
  const OpenAI = require('openai');
  return new OpenAI({ apiKey, baseURL: ZAI_BASE });
};

function _setCreateClient(fn) {
  _createClient = fn;
}

async function fetchModels() {
  // z.ai doesn't have a public /models endpoint — return hardcoded list
  return FALLBACK_MODELS;
}

/**
 * Convert Anthropic-style tool definitions to OpenAI format.
 */
function toOpenAITools(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/**
 * Extract plain text from a content field (string or array of blocks).
 */
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === 'text').map(b => b.text).join('');
  }
  return '';
}

/**
 * Run the agentic loop against z.ai's coding endpoint.
 */
async function runLoop({ apiKey, model, systemPrompt, messages, tools, onEvent, onToolCall }) {
  const c = _createClient(apiKey);
  const openAITools = toOpenAITools(tools);

  // Drop leading assistant messages — OpenAI requires user to go first after system
  const filtered = messages.filter((m, i, arr) => {
    if (m.role !== 'user' && arr.slice(0, i).every(p => p.role !== 'user')) return false;
    return true;
  });
  const history = [
    { role: 'system', content: systemPrompt },
    ...filtered.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : extractText(m.content) })),
  ];

  let finalText = '';
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await c.chat.completions.create({
      model,
      messages: [...history],
      tools: openAITools.length > 0 ? openAITools : undefined,
      tool_choice: 'auto',
      max_tokens: 4096,
      thinking: { type: 'enabled' },
    });

    const choice = response.choices[0];
    const msg = choice.message;

    if (msg.content) {
      finalText += msg.content;
      onEvent({ type: 'text', text: msg.content });
    }

    history.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });

    if (choice.finish_reason === 'stop' || !msg.tool_calls?.length) {
      break;
    }

    // Process tool calls
    for (const tc of msg.tool_calls) {
      const input = JSON.parse(tc.function.arguments || '{}');
      onEvent({ type: 'tool_call', tool: tc.function.name, input });
      const result = await onToolCall(tc.function.name, input);
      onEvent({ type: 'tool_result', tool: tc.function.name, result });
      history.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return finalText;
}

module.exports = { fetchModels, runLoop, _setCreateClient };
