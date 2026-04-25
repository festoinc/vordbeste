import { useState } from 'react';

function highlightSql(sql) {
  const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'INNER', 'OUTER', 'RIGHT',
    'ON', 'GROUP BY', 'ORDER BY', 'LIMIT', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
    'INTERVAL', 'DESC', 'ASC', 'SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'NOW', 'DISTINCT',
    'HAVING', 'UNION', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'];
  const re = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  return sql
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(re, '<span class="sql-kw">$1</span>')
    .replace(/'([^']*)'/g, "<span class='sql-str'>'$1'</span>");
}

function copyAs(rows, format) {
  if (!rows || rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  if (format === 'csv') {
    const lines = [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))];
    navigator.clipboard.writeText(lines.join('\n'));
  } else if (format === 'json') {
    navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
  } else if (format === 'md') {
    const header = `| ${cols.join(' | ')} |`;
    const sep = `| ${cols.map(() => '---').join(' | ')} |`;
    const body = rows.map(r => `| ${cols.map(c => String(r[c] ?? '')).join(' | ')} |`).join('\n');
    navigator.clipboard.writeText([header, sep, body].join('\n'));
  }
}

export default function ResultCard({ sql, rows, text }) {
  const [sqlOpen, setSqlOpen] = useState(false);
  const [copied, setCopied] = useState(null);

  const handleCopy = (format) => {
    copyAs(rows, format);
    setCopied(format);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!rows || rows.length === 0) {
    return (
      <div className="msg bot">
        <div className="msg-av bot-av">🤖</div>
        <div className="result-card">
          {text && (
            <div style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)', lineHeight: 1.6, borderBottom: sql ? '1px solid var(--border)' : 'none' }}>
              {text}
            </div>
          )}
          {sql && (
            <>
              <div className="result-card-head" onClick={() => setSqlOpen(v => !v)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span className="result-card-head-label">No results</span>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text3)' }}>{sqlOpen ? 'Hide SQL' : 'View SQL'}</span>
              </div>
              {sqlOpen && <div className="sql-snippet" dangerouslySetInnerHTML={{ __html: highlightSql(sql) }} />}
              <div className="result-foot">No rows returned</div>
            </>
          )}
        </div>
      </div>
    );
  }

  const cols = Object.keys(rows[0]);

  return (
    <div className="msg bot">
      <div className="msg-av bot-av">🤖</div>
      <div className="result-card">
        {text && (
          <div style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)', lineHeight: 1.6, borderBottom: '1px solid var(--border)' }}>
            {text}
          </div>
        )}
        {sql && (
          <div className="result-card-head" onClick={() => setSqlOpen(v => !v)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <span className="result-card-head-label">Query Result</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text3)' }}>
              <svg style={{ transition: 'transform 0.18s', transform: sqlOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              {sqlOpen ? 'Hide SQL' : 'View SQL'}
            </span>
          </div>
        )}
        {sqlOpen && sql && (
          <div className="sql-snippet" dangerouslySetInnerHTML={{ __html: highlightSql(sql) }} />
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="result-table">
            <thead>
              <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {cols.map(c => <td key={c} title={String(row[c] ?? '')}>{String(row[c] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="result-foot">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {rows.length} row{rows.length !== 1 ? 's' : ''}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button className="copy-btn" onClick={() => handleCopy('csv')}>{copied === 'csv' ? '✓' : 'CSV'}</button>
            <button className="copy-btn" onClick={() => handleCopy('json')}>{copied === 'json' ? '✓' : 'JSON'}</button>
            <button className="copy-btn" onClick={() => handleCopy('md')}>{copied === 'md' ? '✓' : 'Markdown'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
