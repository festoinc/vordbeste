import { useState, useEffect, useRef } from 'react';
import Logo from '../components/Logo';
import ModelSwitcher from '../components/ModelSwitcher';
import ChatWindow from '../components/ChatWindow';
import { getDatabases, streamChat } from '../api';

const DB_TYPE_EMOJI = { postgres: '🐘', postgresql: '🐘', mysql: '🐬' };
const DB_TYPE_LABEL = { postgres: 'PostgreSQL', postgresql: 'PostgreSQL', mysql: 'MySQL' };

export default function DBListPage({ config, models, onSelectDB, onModelChange, onOpenSettings }) {
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I can help you connect a PostgreSQL or MySQL database. Just say something like \"I want to connect my database\" and I'll walk you through it." }
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => { loadDatabases(); }, []);

  async function loadDatabases() {
    setLoading(true);
    try {
      const data = await getDatabases();
      setDatabases(data.databases || []);
    } catch {}
    setLoading(false);
  }

  const send = async (text) => {
    if (!text.trim() || thinking) return;
    const userMsg = { role: 'user', content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setThinking(true);

    let assistantText = '';
    let resultData = null;

    try {
      await streamChat(
        { messages: nextMessages, isConnectPage: true },
        (event) => {
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
          if (event.type === 'db_connected') {
            resultData = event;
          }
        }
      );

      // Finalize streaming message
      setMessages(m => {
        const msgs = [...m];
        const lastIdx = msgs.length - 1;
        if (msgs[lastIdx]?.streaming) {
          msgs[lastIdx] = { role: 'assistant', content: assistantText };
        } else if (assistantText) {
          msgs.push({ role: 'assistant', content: assistantText });
        }
        return msgs;
      });

      // Refresh DB list if a new connection was made
      if (resultData) {
        await loadDatabases();
      }
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: "Something went wrong. Please try again." }]);
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
        <Logo />
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

      <div className="split-body">
        {/* Left: DB list */}
        <div className="left-panel">
          <div className="panel-head">
            <div>
              <div className="panel-head-title">Your Databases</div>
              <div className="panel-head-sub">
                {loading ? 'Loading…' : `${databases.length} database${databases.length !== 1 ? 's' : ''}`}
              </div>
            </div>
          </div>

          <div className="db-scroll">
            {databases.length === 0 && !loading && (
              <div style={{ padding: '20px 6px', textAlign: 'center', color: 'var(--text3)', fontSize: 13, lineHeight: 1.6 }}>
                No databases yet.<br/>Use the chat to add your first one.
              </div>
            )}
            {databases.map(db => (
              <div
                key={db.slug}
                className={`db-card ${selected === db.slug ? 'selected' : ''}`}
                onClick={() => {
                  setSelected(db.slug);
                  if (db.status === 'online') onSelectDB(db);
                }}
              >
                <div className="db-card-icon">{DB_TYPE_EMOJI[db.type] || '🗄️'}</div>
                <div className="db-card-body">
                  <div className="db-card-name">{db.label}</div>
                  <div className="db-card-meta">{db.tableCount} tables · {db.host}</div>
                  <span className={`db-card-tag tag-${db.type}`}>{DB_TYPE_LABEL[db.type] || db.type}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div className={`status-dot ${db.status}`}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: AI chat for setup */}
        <div className="chat-panel">
          <div className="chat-top">
            <div className="bot-avi">🤖</div>
            <div>
              <div className="chat-label">AI Assistant</div>
              <div className="chat-label-sub">Set up new database connections · {config.model}</div>
            </div>
          </div>

          <ChatWindow
            messages={messages}
            thinking={thinking}
            onChipSelect={(opt) => send(opt)}
            chipsDisabled={thinking}
          />

          <div className="chat-foot">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              rows={1}
              placeholder="e.g. I want to connect my PostgreSQL database"
              value={input}
              disabled={thinking}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="send-btn" disabled={!input.trim() || thinking} onClick={() => send(input)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
