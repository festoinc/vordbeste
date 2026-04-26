import { useState, useRef, useEffect, useCallback } from 'react';
import { fetchCurrentModels } from '../api';

const PROVIDERS = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

export default function ModelSwitcher({ config, models, onModelChange }) {
  const [open, setOpen] = useState(false);
  const [dropdownModels, setDropdownModels] = useState(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const loadModels = useCallback(async () => {
    if (dropdownModels) return;
    setLoading(true);
    try {
      const data = await fetchCurrentModels();
      setDropdownModels(data.models || []);
    } catch {
      // keep showing current model only
      setDropdownModels([{ value: config.model, label: config.model }]);
    }
    setLoading(false);
  }, [dropdownModels, config.model]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentLabel = (dropdownModels || models).find(m => m.value === config.model)?.label || config.model;

  const handleToggle = () => {
    if (!open) loadModels();
    setOpen(v => !v);
  };

  return (
    <div ref={ref} className="model-switcher-wrap">
      <span
        className="badge green"
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}
        onClick={handleToggle}
      >
        ● {currentLabel}
        <svg style={{ opacity: 0.6 }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </span>
      {open && (
        <div className="model-dropdown">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 8px 6px' }}>
            Switch model
          </div>
          <div className="model-dropdown-section">{PROVIDERS[config.provider] || config.provider}</div>
          {loading && (
            <div style={{ padding: '12px 10px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>
              <div className="loading-dots" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
                <div className="loading-dot"/><div className="loading-dot"/><div className="loading-dot"/>
              </div>
            </div>
          )}
          {!loading && (dropdownModels || models).map(m => (
            <div
              key={m.value}
              className={`model-option ${config.model === m.value ? 'active' : ''}`}
              onClick={() => { onModelChange(m.value); setOpen(false); }}
            >
              {m.label}
              {config.model === m.value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
                  <path d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm-1.5 14.5l7-7-1.4-1.4-5.6 5.6-2.6-2.6-1.4 1.4 4 4z"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
