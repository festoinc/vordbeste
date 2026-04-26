'use strict';

const OpenAI = require('openai');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

async function fetchModels(apiKey) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data || [])
      .filter(m => m.id) // skip entries without id
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
      .map(m => ({ value: m.id, label: m.name || m.id }));
  } catch (err) {
    console.error('[openrouter] fetchModels failed:', err.message);
    return [
      { value: 'openai/gpt-4o', label: 'GPT-4o' },
      { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
      { value: 'anthropic/claude-haiku-4', label: 'Claude Haiku 4' },
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    ];
  }
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

async function runLoop({ apiKey, model, systemPrompt, messages, tools, onEvent, onToolCall }) {
  const c = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE });
  const openAITools = toOpenAITools(tools);

  // Drop leading assistant messages — OpenAI also requires user to go first after system
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
      messages: history,
      tools: openAITools,
      tool_choice: 'auto',
      max_tokens: 4096,
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

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === 'text').map(b => b.text).join('');
  }
  return '';
}

module.exports = { fetchModels, runLoop };
