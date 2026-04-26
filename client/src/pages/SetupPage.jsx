import { useState } from 'react';
import Logo from '../components/Logo';
import { fetchModels, saveConfig } from '../api';

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', emoji: '🟣', desc: 'Claude models (direct)', placeholder: 'sk-ant-api03-…' },
  { id: 'openrouter', label: 'OpenRouter', emoji: '🌐', desc: 'GPT, Claude, Gemini, Llama & more', placeholder: 'sk-or-v1-…' },
];

export default function SetupPage({ onComplete }) {
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [saving, setSaving] = useState(false);

  const providerObj = PROVIDERS.find(p => p.id === provider);
  const keyReady = apiKey.length >= 10;

  const handleFetchModels = async () => {
    if (!keyReady) return;
    setLoadingModels(true);
    setModelsError('');
    setModels([]);
    setModel('');
    try {
      const data = await fetchModels(provider, apiKey);
      if (data.error) throw new Error(data.error);
      setModels(data.models || []);
      if (data.models?.length) setModel(data.models[0].value);
    } catch (err) {
      setModelsError('Could not load models. Check your API key and try again.');
    }
    setLoadingModels(false);
  };

  const handleGo = async () => {
    if (!model) return;
    setSaving(true);
    await saveConfig({ provider, apiKey, model });
    onComplete({ provider, model }, models);
  };

  return (
    <div className="page page-enter" style={{ background: 'var(--bg)' }}>
      <div className="topbar">
        <Logo />
        <div className="topbar-right">
          <span className="badge neutral">v0.1.0</span>
          <span className="badge">Open source</span>
        </div>
      </div>

      <div className="setup-bg">
        <div className="setup-card">
          <div className="setup-title">Connect your AI to your data</div>
          <div className="setup-sub">Ask questions about your database in plain English — no SQL or coding needed.</div>

          {/* Step 1 — Provider */}
          <div className="field-group">
            <label className="field-label"><span className="step-num">1</span>Choose your AI provider</label>
            <select
              className="select"
              value={provider}
              onChange={e => { setProvider(e.target.value); setModels([]); setModel(''); setApiKey(''); }}
            >
              {PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>{p.emoji} {p.label} — {p.desc}</option>
              ))}
            </select>
          </div>

          {/* Step 2 — API Key */}
          <div className="field-group">
            <label className="field-label"><span className="step-num">2</span>Enter your API key</label>
            <div className="input-wrap">
              <input
                className="input"
                type={showKey ? 'text' : 'password'}
                placeholder={providerObj?.placeholder || 'Your API key…'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setModels([]); setModel(''); }}
                onBlur={handleFetchModels}
              />
              <button className="input-icon" type="button" onClick={() => setShowKey(v => !v)}>
                {showKey
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            <div className="field-hint">
              Stored locally on your machine — never sent anywhere except {providerObj?.label}.
            </div>
            {keyReady && models.length === 0 && !loadingModels && !modelsError && (
              <button
                style={{ marginTop: 10, fontSize: 13, fontWeight: 500, color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--sans)' }}
                onClick={handleFetchModels}
              >
                Load models →
              </button>
            )}
            {loadingModels && (
              <div className="model-info" style={{ marginTop: 10 }}>
                <div className="loading-dots"><div className="loading-dot"/><div className="loading-dot"/><div className="loading-dot"/></div>
                Loading models…
              </div>
            )}
            {modelsError && (
              <div className="model-info" style={{ background: 'var(--red-light)', borderColor: 'var(--red)', color: 'var(--red)', marginTop: 10 }}>
                {modelsError}
              </div>
            )}
          </div>

          {/* Step 3 — Model */}
          {models.length > 0 && (
            <div className="field-group">
              <label className="field-label"><span className="step-num">3</span>Select a model</label>
              <select
                className="select"
                value={model}
                onChange={e => setModel(e.target.value)}
              >
                <option value="" disabled>Choose a model…</option>
                {models.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          <button
            className="btn-primary"
            disabled={!model || saving}
            onClick={handleGo}
          >
            {saving
              ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{ animation: 'spin 0.7s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg> Setting up…</>
              : <>Get started →</>
            }
          </button>

          <div className="setup-divider">
            No account needed &nbsp;·&nbsp; <a href="https://github.com/festoinc/vordbeste" target="_blank" rel="noreferrer">GitHub ↗</a>
          </div>
        </div>
      </div>
    </div>
  );
}
