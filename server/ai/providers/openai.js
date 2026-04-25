'use strict';

const OpenAI = require('openai');

async function fetchModels(apiKey) {
  try {
    const c = new OpenAI({ apiKey });
    const res = await c.models.list();
    const gptModels = res.data
      .filter(m => m.id.startsWith('gpt') || m.id.startsWith('o1') || m.id.startsWith('o3'))
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, 8)
      .map(m => ({ value: m.id, label: m.id }));
    return gptModels;
  } catch {
    return [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
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
  const c = new OpenAI({ apiKey });
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
