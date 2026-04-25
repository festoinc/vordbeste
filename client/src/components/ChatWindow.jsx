import { useRef, useEffect, useState } from 'react';
import ResultCard from './ResultCard';

function parseMessage(text) {
  // Extract clarification block if present
  const clarMatch = text.match(/<clarification>([\s\S]*?)<\/clarification>/);
  if (clarMatch) {
    try {
      const data = JSON.parse(clarMatch[1]);
      const cleanText = text.replace(/<clarification>[\s\S]*?<\/clarification>/, '').trim();
      return { text: cleanText, clarification: data };
    } catch {}
  }
  return { text, clarification: null };
}

function BotMessage({ content, onChipSelect, chipsDisabled }) {
  const { text, clarification } = parseMessage(content);

  return (
    <div className="msg bot">
      <div className="msg-av bot-av">🤖</div>
      <div style={{ maxWidth: '72%' }}>
        {text && (
          <div className="bubble" dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br/>') }} />
        )}
        {clarification && (
          <ClarificationWidget
            data={clarification}
            disabled={chipsDisabled}
            onSubmit={onChipSelect}
          />
        )}
      </div>
    </div>
  );
}

function ClarificationWidget({ data, disabled, onSubmit }) {
  const type = data.type || (Array.isArray(data.options) ? 'single' : 'text');

  if (type === 'multi') return <MultiSelectClarification data={data} disabled={disabled} onSubmit={onSubmit} />;
  if (type === 'text') return <TextClarification data={data} disabled={disabled} onSubmit={onSubmit} />;
  return <SingleSelectClarification data={data} disabled={disabled} onSubmit={onSubmit} />;
}

function SingleSelectClarification({ data, disabled, onSubmit }) {
  return (
    <div className="clarification-wrap">
      {(data.options || []).map((opt, i) => (
        <button
          key={i}
          className="chip"
          disabled={disabled}
          onClick={() => onSubmit(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function MultiSelectClarification({ data, disabled, onSubmit }) {
  const [picked, setPicked] = useState(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const options = data.options || [];

  const toggle = (opt) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt); else next.add(opt);
      return next;
    });
  };

  const submit = () => {
    if (picked.size === 0 || disabled || submitted) return;
    setSubmitted(true);
    const ordered = options.filter(o => picked.has(o));
    onSubmit(ordered.join(', '));
  };

  const isDisabled = disabled || submitted;

  return (
    <div className="clarification-multi">
      <div className="clarification-options">
        {options.map((opt, i) => (
          <label key={i} className={`check-chip ${picked.has(opt) ? 'on' : ''} ${isDisabled ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={picked.has(opt)}
              disabled={isDisabled}
              onChange={() => toggle(opt)}
            />
            <span className="check-box">
              {picked.has(opt) && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </span>
            <span>{opt}</span>
          </label>
        ))}
      </div>
      <button
        className="continue-btn"
        disabled={isDisabled || picked.size === 0}
        onClick={submit}
      >
        Continue
      </button>
    </div>
  );
}

function TextClarification({ data, disabled, onSubmit }) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const isDisabled = disabled || submitted;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isDisabled) return;
    setSubmitted(true);
    onSubmit(trimmed);
  };

  return (
    <div className="clarification-text">
      <input
        className="clarification-input"
        type="text"
        value={value}
        placeholder={data.placeholder || 'Your answer'}
        disabled={isDisabled}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
      />
      <button
        className="continue-btn"
        disabled={isDisabled || !value.trim()}
        onClick={submit}
      >
        Continue
      </button>
    </div>
  );
}

export default function ChatWindow({ messages, thinking, onChipSelect, chipsDisabled, readOnly }) {
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollTop = endRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  return (
    <div className="msgs" ref={endRef}>
      {readOnly && (
        <div className="read-only-banner">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Read-only view
        </div>
      )}
      {messages.map((m, i) => {
        if (m.role === 'user') {
          return (
            <div key={i} className="msg user">
              <div className="msg-av user-av">U</div>
              <div className="bubble">{m.content}</div>
            </div>
          );
        }
        if (m.type === 'result') {
          return <ResultCard key={i} sql={m.sql} rows={m.rows} text={m.text} />;
        }
        if (m.type === 'write_warning') {
          return (
            <div key={i} className="msg bot">
              <div className="msg-av bot-av">🤖</div>
              <WriteWarning sql={m.sql} />
            </div>
          );
        }
        return (
          <BotMessage
            key={i}
            content={typeof m.content === 'string' ? m.content : ''}
            onChipSelect={onChipSelect}
            chipsDisabled={chipsDisabled}
          />
        );
      })}
      {thinking && (
        <div className="msg bot">
          <div className="msg-av bot-av">🤖</div>
          <div className="bubble">
            <div className="thinking">
              <div className="thinking-dot"/><div className="thinking-dot"/><div className="thinking-dot"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WriteWarning({ sql }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="write-warning">
      <div className="write-warning-head">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Share with your tech team to run this
      </div>
      <pre>{sql}</pre>
      <button className="write-warning-copy" onClick={copy}>
        {copied ? '✓ Copied!' : 'Copy SQL'}
      </button>
    </div>
  );
}
