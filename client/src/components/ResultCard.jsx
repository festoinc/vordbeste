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

const PREVIEW_ROWS = 5;
const MAX_INLINE_ROWS = 100;

function downloadAs(rows, format) {
  if (!rows || rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  let mime, ext, content;
  if (format === 'csv') {
    mime = 'text/csv';
    ext = 'csv';
    content = [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  } else if (format === 'json') {
    mime = 'application/json';
    ext = 'json';
    content = JSON.stringify(rows, null, 2);
  } else {
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vordbeste-result-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ResultCard({ sql, rows }) {
  const [sqlOpen, setSqlOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
        <div className="msg-content"><div className="result-card">
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
        </div></div>
      </div>
    );
  }

  const cols = Object.keys(rows[0]);
  const total = rows.length;
  const tooBigToExpand = total > MAX_INLINE_ROWS;
  const showCount = expanded
    ? Math.min(total, MAX_INLINE_ROWS)
    : Math.min(total, PREVIEW_ROWS);
  const visibleRows = rows.slice(0, showCount);
  const canExpand = total > PREVIEW_ROWS && !tooBigToExpand;

  return (
    <div className="msg bot">
      <div className="msg-av bot-av">🤖</div>
      <div className="msg-content"><div className="result-card">
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
              {visibleRows.map((row, i) => (
                <tr key={i}>
                  {cols.map(c => <td key={c} title={String(row[c] ?? '')}>{String(row[c] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(canExpand || tooBigToExpand) && (
          <div className="result-expander">
            {canExpand && (
              <button className="expander-btn" onClick={() => setExpanded(v => !v)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}><polyline points="6 9 12 15 18 9"/></svg>
                {expanded ? `Collapse to ${PREVIEW_ROWS} rows` : `Show all ${total} rows`}
              </button>
            )}
            {tooBigToExpand && (
              <div className="expander-note">
                Showing first {PREVIEW_ROWS} of {total} rows — download CSV or JSON to see them all.
              </div>
            )}
          </div>
        )}
        <div className="result-foot">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {total} row{total !== 1 ? 's' : ''}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button className="copy-btn" onClick={() => downloadAs(rows, 'csv')}>Download CSV</button>
            <button className="copy-btn" onClick={() => downloadAs(rows, 'json')}>Download JSON</button>
            <button className="copy-btn" onClick={() => handleCopy('md')}>{copied === 'md' ? '✓' : 'Copy MD'}</button>
          </div>
        </div>
      </div></div>
    </div>
  );
}
