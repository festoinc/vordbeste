import { useState } from 'react';
import Logo from '../components/Logo';
import { patchConfig, deleteAllData, fetchModels } from '../api';

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', emoji: '🟣', placeholder: 'sk-ant-api03-…' },
  { id: 'openrouter', label: 'OpenRouter', emoji: '🌐', placeholder: 'sk-or-v1-…' },
];

export default function SettingsPage({ config, onBack, onConfigChange }) {
  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', msg: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activeProvider = PROVIDERS.find(p => p.id === config.provider);
  const inactiveProvider = PROVIDERS.find(p => p.id !== config.provider);

  const clearFeedback = () => setFeedback({ type: '', msg: '' });

  const handleSave = async () => {
    if (inputKey.length < 10) return;
    setSaving(true);
    clearFeedback();

    try {
      const data = await fetchModels(inactiveProvider.id, inputKey);
      if (data.error) throw new Error(data.error);
      const providerModels = data.models || [];

      const firstModel = providerModels.length ? providerModels[0].value : config.model;
      await patchConfig({ provider: inactiveProvider.id, apiKey: inputKey, model: firstModel });
      setInputKey('');
      setShowKey(false);
      onConfigChange({ provider: inactiveProvider.id, model: firstModel });
      setFeedback({ type: 'success', msg: `Switched to ${inactiveProvider.label}. ${providerModels.length} models loaded.` });
    } catch (err) {
      setFeedback({ type: 'error', msg: 'Could not verify key. Check it and try again.' });
    }
    setSaving(false);
  };

  const handleDeleteKey = async () => {
    if (!confirmDeleteKey) {
      setConfirmDeleteKey(true);
      return;
    }
    // Clear the config — user will be sent back to setup
    try {
      await deleteAllData();
      window.location.reload();
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
      setConfirmDeleteKey(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteAllData();
      window.location.reload();
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  return (
    <div className="page page-enter" style={{ background: 'var(--bg)' }}>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="back-btn" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
        </div>
        <Logo />
        <div className="topbar-right" />
      </div>

      <div className="settings-bg">
        <div className="settings-card">
          <div className="settings-title">Settings</div>
          <div className="settings-sub">Manage your API keys and data.</div>

          {/* Active provider */}
          <div className="settings-active-provider">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{activeProvider?.emoji}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{activeProvider?.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--green-light)', color: 'var(--green)' }}>
                    Active
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>
                  Model: <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{config.model}</span>
                </div>
              </div>
              <button
                className="settings-delete-key-btn"
                onClick={handleDeleteKey}
              >
                {confirmDeleteKey ? 'Confirm delete' : 'Delete key'}
              </button>
            </div>
          </div>

          {/* Set key for the other provider */}
          <div style={{ marginTop: 28 }}>
            <div className="settings-key-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{inactiveProvider?.emoji}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{inactiveProvider?.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>No key set</span>
              </div>
              <div className="input-wrap">
                <input
                  className="input"
                  type={showKey ? 'text' : 'password'}
                  placeholder={inactiveProvider?.placeholder}
                  value={inputKey}
                  onChange={e => { setInputKey(e.target.value); clearFeedback(); }}
                />
                <button className="input-icon" type="button" onClick={() => setShowKey(v => !v)} style={{ right: 48 }}>
                  {showKey
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
                <button
                  className="input-icon"
                  type="button"
                  onClick={handleSave}
                  disabled={inputKey.length < 10 || saving}
                  style={{
                    right: 8, color: inputKey.length >= 10 ? 'var(--accent-text)' : 'var(--text3)',
                    cursor: inputKey.length >= 10 ? 'pointer' : 'default',
                  }}
                >
                  {saving
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.7s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
                  }
                </button>
              </div>
            </div>
          </div>

          {/* Feedback */}
          {feedback.msg && (
            <div className="model-info" style={{
              marginTop: 16,
              background: feedback.type === 'error' ? 'var(--red-light)' : 'var(--green-light)',
              borderColor: feedback.type === 'error' ? 'var(--red)' : 'var(--green)',
              color: feedback.type === 'error' ? 'var(--red)' : 'var(--green)',
            }}>
              {feedback.msg}
            </div>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '32px 0 24px' }} />

          {/* Delete all data */}
          <div className="settings-danger-zone">
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/>
              </svg>
              Danger Zone
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
              Delete all local data including API keys, database connections, chat history, and settings. This cannot be undone.
            </div>
            {confirmDelete && (
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: 'var(--red-light)', border: '1.5px solid var(--red)',
                marginBottom: 12, fontSize: 13, color: 'var(--red)', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flexShrink: 0 }}>
                  <path d="M12 9v4m0 4h.01M10.29 3.86l-8.6 14.86A1 1 0 002.56 20h16.88a1 1 0 00.87-1.28l-8.6-14.86a1 1 0 00-1.72 0z"/>
                </svg>
                Are you sure? Click again to confirm.
              </div>
            )}
            <button
              className="btn-danger"
              disabled={deleting}
              onClick={handleDeleteAll}
            >
              {deleting
                ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{ animation: 'spin 0.7s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg> Deleting…</>
                : <>Delete all data</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
