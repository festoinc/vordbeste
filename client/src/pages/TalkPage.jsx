import { useState, useEffect, useRef } from 'react';
import Logo from '../components/Logo';
import ModelSwitcher from '../components/ModelSwitcher';
import ChatWindow from '../components/ChatWindow';
import { getSessions, getSession, streamChat } from '../api';

export default function TalkPage({ config, models, db, onBack, onModelChange, onOpenSettings }) {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [tables, setTables] = useState([]);
  const [openTable, setOpenTable] = useState(null);
  const [readOnly, setReadOnly] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    loadSessions();
    startNewSession();
  }, [db.slug]);

  async function loadSessions() {
    try {
      const data = await getSessions(db.slug);
      setSessions(data.sessions || []);
    } catch {}
  }

  function startNewSession() {
    setActiveSessionId(null);
    setReadOnly(false);
    setMessages([{
      role: 'assistant',
      content: `You're connected to **${db.label}**. Ask me anything in plain English — like "show me the top customers" or "how many orders came in this week".`
    }]);
  }

  async function openSession(session) {
    if (session.id === activeSessionId) return;
    try {
      const data = await getSession(db.slug, session.id);
      setActiveSessionId(session.id);
      setReadOnly(true);
      // Convert stored messages to display format
      const displayMsgs = (data.messages || []).map(m => {
        if (m.role === 'assistant' && m.type === 'result') return m;
        return { role: m.role, content: m.content };
      });
      setMessages(displayMsgs.length ? displayMsgs : [{ role: 'assistant', content: 'This session has no messages.' }]);
    } catch {}
  }

  const send = async (text) => {
    if (!text.trim() || thinking || readOnly) return;
    const userMsg = { role: 'user', content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setThinking(true);

    let assistantText = '';
    let pendingResult = null;
    let currentSessionId = activeSessionId;

    try {
      await streamChat(
        {
          messages: nextMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m),
          })),
          slug: db.slug,
          sessionId: currentSessionId,
          isConnectPage: false,
        },
        (event) => {
          if (event.type === 'session_created') {
            currentSessionId = event.sessionId;
            setActiveSessionId(event.sessionId);
          }

          if (event.type === 'text') {
            assistantText += event.text;
            setMessages(m => {
              const last = m[m.length - 1];
              if (last?.role === 'assistant' && last?.streaming) {
                return [...m.slice(0, -1), { role: 'assistant', content: assistantText, streaming: true }];
              }
              return [...m, { role: 'assistant', content: assistantText, streaming: true }];
            });
          }

          if (event.type === 'print_result') {
            pendingResult = { sql: event.sql, rows: event.rows };
          }

          if (event.type === 'session_titled') {
            setSessions(prev => {
              const idx = prev.findIndex(s => s.id === currentSessionId);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], title: event.title };
                return updated;
              }
              return [{ id: currentSessionId, title: event.title, created_at: new Date().toISOString() }, ...prev];
            });
          }
        }
      );

      // Finalize: text bubble first, then result card if any
      setMessages(m => {
        const finalized = m
          .map(msg => {
            if (msg.role === 'assistant' && msg.streaming) {
              const trimmed = (msg.content || '').trim();
              if (!trimmed && !pendingResult) return null;
              return { role: 'assistant', content: msg.content };
            }
            return msg;
          })
          .filter(Boolean);

        if (pendingResult) {
          return [...finalized, { role: 'assistant', type: 'result', ...pendingResult }];
        }
        return finalized;
      });

      await loadSessions();
    } catch (err) {
      setMessages(m => {
        const filtered = m.filter(msg => !msg.streaming);
        return [...filtered, { role: 'assistant', content: 'Something went wrong. Please try again.' }];
      });
    }

    setThinking(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="back-btn" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 18 9 12 15 6"/></svg>
            All databases
          </button>
        </div>
        <div className="db-chip">
          <div className="db-chip-dot"></div>
          {db.label}
        </div>
        <div className="topbar-right">
          <ModelSwitcher config={config} models={models} onModelChange={onModelChange} />
          <button className="gear-btn" onClick={onOpenSettings} title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="three-body">
        {/* Left: History */}
        <div className="history-panel">
          <div className="panel-head">
            <div className="panel-head-title">Past Chats</div>
          </div>
          <div className="new-chat-row">
            <button className="new-chat-btn" onClick={startNewSession}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New question
            </button>
          </div>
          <div className="hist-list">
            {sessions.map(s => (
              <div
                key={s.id}
                className={`hist-item ${activeSessionId === s.id ? 'active' : ''}`}
                onClick={() => openSession(s)}
              >
                <div className="hist-title">{s.title}</div>
                <div className="hist-time">{formatTime(s.created_at)}</div>
              </div>
            ))}
            {sessions.length === 0 && (
              <div style={{ padding: '12px', fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
                No past chats yet
              </div>
            )}
          </div>
        </div>

        {/* Center: Query chat */}
        <div className="query-chat">
          <div className="chat-top">
            <div className="bot-avi" style={{ fontSize: 18 }}>💬</div>
            <div>
              <div className="chat-label">Ask your database</div>
              <div className="chat-label-sub">{db.label} · No SQL needed</div>
            </div>
          </div>

          <ChatWindow
            messages={messages}
            thinking={thinking}
            onChipSelect={(opt) => send(opt)}
            chipsDisabled={thinking || readOnly}
            readOnly={readOnly}
          />

          <div className="chat-foot">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              rows={1}
              placeholder={readOnly ? 'This is a read-only session view' : `Ask anything… e.g. "How many orders did we get this week?"`}
              value={input}
              disabled={thinking || readOnly}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="send-btn" disabled={!input.trim() || thinking || readOnly} onClick={() => send(input)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Right: Tables */}
        <TablesPanel slug={db.slug} />
      </div>
    </div>
  );
}

function TablesPanel({ slug }) {
  const [tables, setTables] = useState([]);
  const [modalTable, setModalTable] = useState(null); // { name, content }

  useEffect(() => {
    fetch(`/api/databases/${slug}`)
      .then(r => r.json())
      .then(data => setTables(data.tables || []));
  }, [slug]);

  const openTable = async (tableName) => {
    setModalTable({ name: tableName, content: null });
    try {
      const res = await fetch(`/api/databases/${slug}/tables/${tableName}`);
      const data = await res.json();
      setModalTable({ name: tableName, content: data.content || '' });
    } catch {
      setModalTable({ name: tableName, content: '_Could not load table info._' });
    }
  };

  return (
    <>
      <div className="tables-panel">
        <div className="panel-head">
          <div>
            <div className="panel-head-title">Tables</div>
            <div className="panel-head-sub">{tables.length} tables</div>
          </div>
        </div>
        <div className="tables-scroll">
          {tables.map(t => (
            <div key={t} className="ftree-row" onClick={() => openTable(t)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                style={{ flexShrink: 0, color: 'var(--text3)' }}>
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="9" x2="9" y2="21"/>
              </svg>
              <span className="ftree-name">{t}</span>
            </div>
          ))}
        </div>
      </div>

      {modalTable && (
        <TableModal
          name={modalTable.name}
          content={modalTable.content}
          onClose={() => setModalTable(null)}
        />
      )}
    </>
  );
}

function TableModal({ name, content, onClose }) {
  // Close on backdrop click or Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="9" x2="9" y2="21"/>
            </svg>
            <span className="modal-title">{name}.md</span>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {content === null
            ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text3)', fontSize: 13 }}>
                <div className="loading-dots"><div className="loading-dot"/><div className="loading-dot"/><div className="loading-dot"/></div>
                Loading…
              </div>
            : <MdRenderer content={content} />
          }
        </div>
      </div>
    </div>
  );
}

function MdRenderer({ content }) {
  const lines = content.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="md-h1">{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="md-h2">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="md-h3">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) {
      elements.push(<div key={i} className="md-li">{renderInline(line.slice(2))}</div>);
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 8 }} />);
    } else {
      elements.push(<p key={i} className="md-p">{renderInline(line)}</p>);
    }
    i++;
  }

  return <div className="md-content">{elements}</div>;
}

function renderInline(text) {
  // Handle **bold** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="md-code">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 172800000) return 'yesterday';
  return date.toLocaleDateString();
}
