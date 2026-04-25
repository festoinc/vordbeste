'use strict';

const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function init(apiKey) {
  client = new Anthropic({ apiKey });
}

async function fetchModels(apiKey) {
  const c = new Anthropic({ apiKey });
  try {
    const res = await c.models.list();
    return res.data
      .filter(m => m.id.startsWith('claude'))
      .map(m => ({ value: m.id, label: m.display_name || m.id }));
  } catch {
    // Fallback list
    return [
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ];
  }
}

/**
 * Run the agentic loop.
 * Calls onEvent({ type, ... }) for streaming updates.
 * Returns final assistant text.
 */
async function runLoop({ apiKey, model, systemPrompt, messages, tools, onEvent, onToolCall }) {
  const c = apiKey ? new Anthropic({ apiKey }) : client;
  if (!c) throw new Error('Anthropic client not initialized');

  // Convert messages to Anthropic format.
  // Anthropic requires the first message to be 'user' — drop any leading assistant messages
  // (these are UI-only greetings, not part of the real API conversation).
  const rawHistory = messages.map(m => ({ role: m.role, content: m.content }));
  let history = rawHistory;
  while (history.length > 0 && history[0].role !== 'user') {
    history = history.slice(1);
  }

  let finalText = '';
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await c.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: history,
      tools,
    });

    // Collect text from this response
    const textBlocks = response.content.filter(b => b.type === 'text');
    for (const block of textBlocks) {
      finalText += block.text;
      onEvent({ type: 'text', text: block.text });
    }

    // Add assistant message to history
    history.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn' || !response.content.some(b => b.type === 'tool_use')) {
      break;
    }

    // Process tool calls
    const toolResults = [];
    for (const block of response.content.filter(b => b.type === 'tool_use')) {
      onEvent({ type: 'tool_call', tool: block.name, input: block.input });
      const result = await onToolCall(block.name, block.input);
      onEvent({ type: 'tool_result', tool: block.name, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    history.push({ role: 'user', content: toolResults });
  }

  return finalText;
}

module.exports = { init, fetchModels, runLoop };
