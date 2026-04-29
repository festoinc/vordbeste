'use strict';

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('zai provider — fetchModels', () => {
  it('returns hardcoded glm-5.x models', async () => {
    const zai = require('./zai');
    const models = await zai.fetchModels('any-key');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.value).toMatch(/^glm-5/);
      expect(m.label).toBeTruthy();
    }
    expect(models.some(m => m.value === 'glm-5.1')).toBe(true);
    expect(models.some(m => m.value === 'glm-5')).toBe(true);
    expect(models.some(m => m.value === 'glm-5-turbo')).toBe(true);
  });

  it('each model has value and label', async () => {
    const zai = require('./zai');
    const models = await zai.fetchModels('any-key');
    for (const m of models) {
      expect(m).toHaveProperty('value');
      expect(m).toHaveProperty('label');
      expect(typeof m.value).toBe('string');
      expect(typeof m.label).toBe('string');
    }
  });
});

describe('zai provider — runLoop', () => {
  let mockCompletions;
  let lastApiKey;
  let lastBaseURL;

  beforeEach(() => {
    mockCompletions = { create: vi.fn() };
    const zai = require('./zai');
    zai._setCreateClient((apiKey) => {
      lastApiKey = apiKey;
      lastBaseURL = null; // We'll capture via mock
      return { chat: { completions: mockCompletions } };
    });
  });

  afterAll(() => {
    const zai = require('./zai');
    // Reset to real implementation after all tests
    zai._setCreateClient((apiKey) => {
      const OpenAI = require('openai');
      return new OpenAI({ apiKey, baseURL: 'https://api.z.ai/api/coding/paas/v4' });
    });
  });

  it('passes correct API key to client', async () => {
    const zai = require('./zai');
    mockCompletions.create.mockResolvedValue({
      choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
    });

    await zai.runLoop({
      apiKey: 'test-key',
      model: 'glm-5.1',
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [],
      onEvent: () => {},
      onToolCall: () => {},
    });

    expect(lastApiKey).toBe('test-key');
  });

  it('sends system prompt as first message', async () => {
    const zai = require('./zai');
    mockCompletions.create.mockResolvedValue({
      choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
    });

    await zai.runLoop({
      apiKey: 'key',
      model: 'glm-5',
      systemPrompt: 'Be concise.',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [],
      onEvent: () => {},
      onToolCall: () => {},
    });

    const callArgs = mockCompletions.create.mock.calls[0][0];
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'Be concise.' });
  });

  it('enables thinking by default', async () => {
    const zai = require('./zai');
    mockCompletions.create.mockResolvedValue({
      choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
    });

    await zai.runLoop({
      apiKey: 'key',
      model: 'glm-5.1',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [],
      onEvent: () => {},
      onToolCall: () => {},
    });

    const callArgs = mockCompletions.create.mock.calls[0][0];
    expect(callArgs.thinking).toEqual({ type: 'enabled' });
  });

  it('emits text events and returns final text', async () => {
    const zai = require('./zai');
    const events = [];

    mockCompletions.create.mockResolvedValue({
      choices: [{ message: { content: 'Hello world' }, finish_reason: 'stop' }],
    });

    const result = await zai.runLoop({
      apiKey: 'key',
      model: 'glm-5.1',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [],
      onEvent: (e) => events.push(e),
      onToolCall: () => {},
    });

    expect(result).toBe('Hello world');
    expect(events).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('converts Anthropic-style tools to OpenAI format', async () => {
    const zai = require('./zai');
    const tools = [
      {
        name: 'list_tables',
        description: 'List tables',
        input_schema: { type: 'object', properties: {} },
      },
    ];

    mockCompletions.create.mockResolvedValue({
      choices: [{ message: { content: null, tool_calls: [] }, finish_reason: 'stop' }],
    });

    await zai.runLoop({
      apiKey: 'key',
      model: 'glm-5.1',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'Hi' }],
      tools,
      onEvent: () => {},
      onToolCall: () => {},
    });

    const callArgs = mockCompletions.create.mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(1);
    expect(callArgs.tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'list_tables',
        description: 'List tables',
        parameters: { type: 'object', properties: {} },
      },
    });
  });

  it('handles tool calls in agentic loop', async () => {
    const zai = require('./zai');
    const events = [];
    const tools = [
      {
        name: 'run_describe',
        description: 'Describe a table',
        input_schema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
      },
    ];

    mockCompletions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'tc_1',
            type: 'function',
            function: { name: 'run_describe', arguments: '{"sql":"DESCRIBE users"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    });

    mockCompletions.create.mockResolvedValueOnce({
      choices: [{
        message: { content: 'The users table has 5 columns.' },
        finish_reason: 'stop',
      }],
    });

    const toolResults = { rows: [{ col: 'id' }], rowCount: 1 };

    const result = await zai.runLoop({
      apiKey: 'key',
      model: 'glm-5.1',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'Describe users' }],
      tools,
      onEvent: (e) => events.push(e),
      onToolCall: (name, input) => {
        expect(name).toBe('run_describe');
        expect(input).toEqual({ sql: 'DESCRIBE users' });
        return toolResults;
      },
    });

    expect(result).toBe('The users table has 5 columns.');
    expect(mockCompletions.create).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'tool_call', tool: 'run_describe', input: { sql: 'DESCRIBE users' } });
    expect(events).toContainEqual({ type: 'tool_result', tool: 'run_describe', result: toolResults });
  });

  it('drops leading assistant messages (must start with user)', async () => {
    const zai = require('./zai');

    // Verify mock is fresh
    expect(mockCompletions.create.mock.calls.length).toBe(0);

    mockCompletions.create.mockResolvedValue({
      choices: [{ message: { content: 'Hi!' }, finish_reason: 'stop' }],
    });

    await zai.runLoop({
      apiKey: 'key',
      model: 'glm-5.1',
      systemPrompt: 'test',
      messages: [
        { role: 'assistant', content: 'Welcome!' },
        { role: 'user', content: 'Hello' },
      ],
      tools: [],
      onEvent: () => {},
      onToolCall: () => {},
    });

    expect(mockCompletions.create).toHaveBeenCalledTimes(1);
    const callArgs = mockCompletions.create.mock.calls[0][0];
    const roles = callArgs.messages.map(m => m.role);
    // system prompt + filtered user message (assistant dropped)
    expect(roles).toEqual(['system', 'user']);
  });

  it('respects MAX_ITERATIONS and stops', async () => {
    const zai = require('./zai');

    mockCompletions.create.mockResolvedValue({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'tc_loop',
            type: 'function',
            function: { name: 'some_tool', arguments: '{}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    });

    await zai.runLoop({
      apiKey: 'key',
      model: 'glm-5.1',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'test' }],
      tools: [{
        name: 'some_tool',
        description: 'A tool',
        input_schema: { type: 'object', properties: {} },
      }],
      onEvent: () => {},
      onToolCall: () => ({}),
    });

    expect(mockCompletions.create.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('passes model name through to API', async () => {
    const zai = require('./zai');
    mockCompletions.create.mockResolvedValue({
      choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
    });

    await zai.runLoop({
      apiKey: 'key',
      model: 'glm-5-turbo',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [],
      onEvent: () => {},
      onToolCall: () => {},
    });

    const callArgs = mockCompletions.create.mock.calls[0][0];
    expect(callArgs.model).toBe('glm-5-turbo');
  });
});
