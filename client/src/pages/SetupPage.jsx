import { useState } from 'react';
import Logo from '../components/Logo';
import { fetchModels, saveConfig } from '../api';

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', emoji: '🟣', desc: 'Claude models — great at understanding plain English', placeholder: 'sk-ant-api03-…' },
  { id: 'openai', label: 'OpenAI', emoji: '🟢', desc: 'GPT-4o and more', placeholder: 'sk-proj-…' },
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
            <div>
              {PROVIDERS.map(p => (
                <div
                  key={p.id}
                  className={`provider-card ${provider === p.id ? 'selected' : ''}`}
                  onClick={() => { setProvider(p.id); setModels([]); setModel(''); setApiKey(''); }}
                >
                  <span style={{ fontSize: 20 }}>{p.emoji}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{p.desc}</div>
                  </div>
                  {provider === p.id && (
                    <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
                      <path d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm-1.5 14.5l7-7-1.4-1.4-5.6 5.6-2.6-2.6-1.4 1.4 4 4z"/>
                    </svg>
                  )}
                </div>
              ))}
            </div>
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
              {models.map(m => (
                <div
                  key={m.value}
                  className={`model-row ${model === m.value ? 'selected' : ''}`}
                  onClick={() => setModel(m.value)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.label}</div>
                  </div>
                  {model === m.value && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
                      <path d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm-1.5 14.5l7-7-1.4-1.4-5.6 5.6-2.6-2.6-1.4 1.4 4 4z"/>
                    </svg>
                  )}
                </div>
              ))}
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
            No account needed &nbsp;·&nbsp; <a href="https://github.com/vordbeste/vordbeste" target="_blank" rel="noreferrer">GitHub ↗</a>
          </div>
        </div>
      </div>
    </div>
  );
}
