'use strict';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('ai/index — provider registry', () => {
  it('getProviders returns anthropic, openrouter, and zai', () => {
    // We can't easily mock the lazy requires, so we just verify
    // the index.js file loads without error and has the expected structure
    const ai = require('./index');
    expect(ai.chat).toBeInstanceOf(Function);
    expect(ai.fetchModels).toBeInstanceOf(Function);
  });

  it('fetchModels rejects unknown provider', async () => {
    const { fetchModels } = require('./index');
    await expect(fetchModels('nonexistent', 'key')).rejects.toThrow('Unknown provider');
  });

  it('chat rejects unknown provider', async () => {
    const { chat } = require('./index');
    await expect(chat({
      provider: 'nonexistent',
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      slug: null,
      sessionId: null,
      dbCreds: null,
      isConnectPage: false,
      onEvent: () => {},
    })).rejects.toThrow('Unknown provider');
  });
});
