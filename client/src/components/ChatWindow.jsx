import { useRef, useEffect, useState } from 'react';
import ResultCard from './ResultCard';

function parseMessage(text) {
  // Extract clarification block if present
  const clarMatch = text.match(/<clarification>([\s\S]*?)<\/clarification>/);
  let clarification = null;
  let cleanText = text;
  if (clarMatch) {
    try {
      clarification = JSON.parse(clarMatch[1]);
      cleanText = text.replace(/<clarification>[\s\S]*?<\/clarification>/, '').trim();
    } catch {}
  }

  // Extract learnings block
  let learnings = null;
  const learnMatch = cleanText.match(/<learnings>([\s\S]*?)<\/learnings>/);
  if (learnMatch) {
    try {
      const parsed = JSON.parse(learnMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        learnings = parsed;
      }
    } catch {}
    cleanText = cleanText.replace(/<learnings>[\s\S]*?<\/learnings>/, '').trim();
  }
  // Strip NO_NEW_LEARNINGS marker
  if (cleanText.includes('NO_NEW_LEARNINGS')) {
    cleanText = cleanText.replace(/\bNO_NEW_LEARNINGS\b/g, '').trim();
  }

  return { text: cleanText, clarification, learnings };
}

function renderMarkdown(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br/>');
}

function BotMessage({ content, onChipSelect, chipsDisabled }) {
  const { text, clarification } = parseMessage(content);

  return (
    <div className="msg bot">
      <div className="msg-av bot-av">🤖</div>
      <div className="msg-content">
        {text && (
          <div className="bubble" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
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

function LearningsWidget({ learnings, onComplete }) {
  const [reviews, setReviews] = useState({});
  const submittedRef = useRef(false);

  const review = (index, decision) => {
    setReviews(prev => ({ ...prev, [index]: decision }));
  };

  const allReviewed = learnings.every((_, i) => reviews[i]);

  useEffect(() => {
    if (allReviewed && !submittedRef.current && learnings.length > 0) {
      submittedRef.current = true;
      const confirmed = learnings.filter((_, i) => reviews[i] === 'confirmed');
      const rejected = learnings.filter((_, i) => reviews[i] === 'rejected');
      onComplete(confirmed, rejected);
    }
  }, [allReviewed]);

  return (
    <div className="learnings-widget">
      <div className="learnings-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        Proposed Learnings
      </div>
      {learnings.map((l, i) => (
        <div key={i} className={`learnings-row ${reviews[i] || ''}`}>
          <div className="learnings-row-content">
            <span className="learnings-table">{l.table}</span>
            <span className="learnings-text">{l.learning}</span>
          </div>
          {!reviews[i] && (
            <div className="learnings-actions">
              <button className="learnings-btn confirm" onClick={() => review(i, 'confirmed')}>Confirm</button>
              <button className="learnings-btn reject" onClick={() => review(i, 'rejected')}>Reject</button>
            </div>
          )}
          {reviews[i] === 'confirmed' && <span className="learnings-badge confirmed">✓ Saved</span>}
          {reviews[i] === 'rejected' && <span className="learnings-badge rejected">✗ Skipped</span>}
        </div>
      ))}
      {allReviewed && (
        <div className="learnings-done">All learnings reviewed</div>
      )}
    </div>
  );
}

export default function ChatWindow({ messages, thinking, onChipSelect, chipsDisabled, readOnly, onLearningsReviewed }) {
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
      {(() => {
        let pendingLearnings = null;
        return messages.flatMap((m, i) => {
          const els = [];
          if (m.role === 'user') {
            els.push(
              <div key={i} className="msg user">
                <div className="msg-av user-av">U</div>
                <div className="msg-content">
                  <div className="bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                </div>
              </div>
            );
          } else if (m.type === 'result') {
            els.push(<ResultCard key={i} sql={m.sql} rows={m.rows} rowCount={m.rowCount} />);
            if (pendingLearnings) {
              els.push(<LearningsWidget key={`learnings-${i}`} learnings={pendingLearnings} onComplete={onLearningsReviewed} />);
              pendingLearnings = null;
            }
          } else if (m.type === 'write_warning') {
            els.push(
              <div key={i} className="msg bot">
                <div className="msg-av bot-av">🤖</div>
                <WriteWarning sql={m.sql} />
              </div>
            );
          } else {
            const parsed = parseMessage(typeof m.content === 'string' ? m.content : '');
            if (parsed.learnings) {
              pendingLearnings = parsed.learnings;
            }
            els.push(
              <BotMessage
                key={i}
                content={typeof m.content === 'string' ? m.content : ''}
                onChipSelect={onChipSelect}
                chipsDisabled={chipsDisabled}
              />
            );
            // If no result card follows, render learnings right after the text
            const next = messages[i + 1];
            if (pendingLearnings && (!next || next.type !== 'result')) {
              els.push(<LearningsWidget key={`learnings-${i}`} learnings={pendingLearnings} onComplete={onLearningsReviewed} />);
              pendingLearnings = null;
            }
          }
          return els;
        });
      })()}
      {thinking && (
        <div className="msg bot">
          <div className="msg-av bot-av">🤖</div>
          <div className="msg-content">
            <div className="bubble" style={{ width: 'auto' }}>
              <div className="thinking">
                <div className="thinking-dot"/><div className="thinking-dot"/><div className="thinking-dot"/>
              </div>
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
