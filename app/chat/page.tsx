'use client';

import { useChat } from '@ai-sdk/react';
import { useRef, useEffect } from 'react';
import Link from 'next/link';

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loading = status === 'submitted' || status === 'streaming';

  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = inputRef.current;
    if (!input?.value.trim() || loading) return;
    sendMessage({ text: input.value });
    input.value = '';
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', maxWidth: 720, margin: '0 auto', background: 'var(--surface)' }}>
      <header style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--faint)', textDecoration: 'none', fontWeight: 500 }}>← Pipeline</Link>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: loading ? 'var(--accent)' : 'var(--green)', boxShadow: loading ? '0 0 6px var(--accent)40' : 'none', transition: 'all 300ms' }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>GTM Agent</span>
      </header>

      <div ref={ref} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg)' }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40, textAlign: 'center' }}>
            <p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>Onboard GTM Pipeline Agent</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 380 }}>
              Add leads, enrich data, score prospects, generate outreach, and manage campaigns.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 8 }}>
              {['Add Kobo360, Nigeria, freight','Show all leads','Enrich all new leads'].map(s => (
                <button key={s} onClick={() => sendMessage({ text: s })} style={{
                  padding: '4px 10px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-light)',
                  background: 'var(--surface)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--fg)',
                }}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {m.parts.map((part, i) => {
                if (part.type === 'text' && part.text) {
                  return <div key={i} style={{ padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.role === 'user' ? 'var(--accent)' : 'var(--surface)', color: m.role === 'user' ? '#fff' : 'var(--fg)', border: m.role === 'user' ? 'none' : '1px solid var(--border-light)', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{part.text}</div>;
                }
                if (part.type.startsWith('tool-')) {
                  const name = part.type.replace('tool-', '');
                  const tp = part as { state?: string; output?: Record<string, unknown> };
                  const summary = tp.state === 'output-available' && tp.output
                    ? (tp.output.summary as string) ?? (tp.output.company as string) ?? (tp.output.enrichment as string) ?? `${name} done`
                    : `${name}`;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 5, background: 'var(--accent-bg)', border: '1px solid var(--accent)15', fontSize: 10, color: 'var(--accent)', fontWeight: 500, width: 'fit-content' }}>
                      <span>▸</span><span>{summary}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))
        )}
        {loading && <div style={{ alignSelf: 'flex-start', padding: '10px 14px', fontSize: 11, color: 'var(--faint)' }}>Processing...</div>}
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 8 }}>
        <input ref={inputRef} placeholder="Add a lead or ask a question..." autoFocus style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', fontSize: 12, fontFamily: 'inherit', color: 'var(--fg)' }} />
        <button type="submit" disabled={loading} style={{ padding: '0 18px', border: 'none', borderRadius: 'var(--radius-sm)', background: loading ? 'var(--border)' : 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>Send</button>
      </form>
    </div>
  );
}
