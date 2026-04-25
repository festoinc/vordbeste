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
          <div className="clarification-wrap">
            {clarification.options.map((opt, i) => (
              <button
                key={i}
                className="chip"
                disabled={chipsDisabled}
                onClick={() => onChipSelect(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
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
