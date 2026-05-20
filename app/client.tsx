'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Lead {
  id: string;
  company: string;
  contactName: string;
  contactRole: string | null;
  contactEmail: string | null;
  country: string;
  industry: string;
  state: string;
  score: number | null;
  segment: string | null;
  campaignId: string | null;
  createdAt: Date;
  stateChangedAt: Date;
  meta: any;
  notes: Array<{ at: string; outcome: string; text?: string }> | null;
}

type PipelineFilter = 'all' | 'inbox' | 'new' | 'ready' | 'active' | 'attention';

// ── Helpers ────────────────────────────────────────────────────────────────────
const lastOutcome = (l: Lead) =>
  l.notes && l.notes.length > 0 ? l.notes[l.notes.length - 1] : null;

const buildMailto = (email: string, subject: string, body: string) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const getStateColor = (state: string) => {
  switch (state) {
    case 'new': return '#52525b';
    case 'enriched': return '#71717a';
    case 'scored': return '#a1a1aa';
    case 'queued': return '#a78bfa';
    case 'active': return '#ffffff';
    case 'lukewarm': return '#a1a1aa';
    case 'hot': return '#ffffff';
    case 'booked': return '#4ade80';
    case 'stalled': return '#27272a';
    default: return '#52525b';
  }
};

// ── Module-level outcome definitions ─────────────────────────────────────────
const OUTCOMES_LIST = [
  { outcome: 'replied',        label: 'They Replied',   color: '#4ade80' },
  { outcome: 'ignored',        label: 'No Response',    color: '#f59e0b' },
  { outcome: 'booked',         label: 'Call Booked',    color: '#818cf8' },
  { outcome: 'not_interested', label: 'Not Interested', color: '#f87171' },
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 1800);
    });
  }, []);
  return { copy, copied };
}

// ── CopyBtn ────────────────────────────────────────────────────────────────────
function CopyBtn({ text, label, id }: { text: string; label: string; id: string }) {
  const { copy, copied } = useCopy();
  const done = copied === id;
  return (
    <button onClick={() => copy(text, id)} style={{ padding: '3px 8px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: done ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${done ? '#4ade80' : 'var(--border)'}`, borderRadius: '3px', color: done ? '#4ade80' : 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {done ? '✓ Copied' : label}
    </button>
  );
}

// ── Message renderer ───────────────────────────────────────────────────────────
function renderMd(content: string) {
  if (!content) return null;
  return content.split('\n').map((line, i) => {
    const isBullet = /^[\-\*]\s/.test(line.trim());
    const clean = isBullet ? line.trim().replace(/^[-*]\s*/, '') : line;
    const parts = clean.split(/(\*\*.*?\*\*|`.*?`)/g).map((p, j) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={j} style={{ color: '#fff', fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
      if (p.startsWith('`') && p.endsWith('`')) return <code key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '3px' }}>{p.slice(1, -1)}</code>;
      return p;
    });
    if (isBullet) return <div key={i} style={{ display: 'flex', gap: '8px', margin: '6px 0', fontSize: '13.5px', lineHeight: 1.65, color: 'var(--muted)' }}><span style={{ color: '#444', flexShrink: 0 }}>—</span><span>{parts}</span></div>;
    return line.trim() ? <p key={i} style={{ margin: i > 0 ? '8px 0 0 0' : 0, fontSize: '13.5px', lineHeight: 1.75, color: 'var(--muted)' }}>{parts}</p> : null;
  });
}

// ── Live agent status bar ──────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  verifyLead: 'Verifying lead details',
  createLead: 'Creating lead record',
  enrichLead: 'Researching company online',
  scoreLead: 'Scoring & segmenting',
  generateOutreach: 'Writing personalised outreach',
  suggestReply: 'Drafting follow-up reply',
  queryLeads: 'Reading pipeline',
  getLead: 'Fetching lead details',
  reviewPipeline: 'Reviewing pipeline',
  logOutcome: 'Logging outcome',
  addSignal: 'Adding intelligence signal',
  updateLeadScore: 'Updating lead score',
  transitionState: 'Updating lead state',
};

function ActiveToolBar({ messages, status }: { messages: any[]; status: string }) {
  const isActive = status === 'submitted' || status === 'streaming';
  if (!isActive) return null;

  let activeLabel: string | null = null;
  let activeTool: string | null = null;
  const lastMsg = [...messages].reverse().find((m: any) => m.role === 'assistant');
  if (lastMsg?.parts) {
    const inFlight = lastMsg.parts.filter((p: any) =>
      p.type === 'tool-invocation' && p.toolInvocation?.state === 'call'
    );
    if (inFlight.length > 0) {
      const t = inFlight[inFlight.length - 1].toolInvocation;
      activeTool = t.toolName;
      activeLabel = TOOL_LABELS[t.toolName] ?? `Running ${t.toolName}`;
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 16px', borderTop: '1px solid var(--border)', background: 'rgba(167,139,250,0.04)', flexShrink: 0, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', gap: '3px' }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#a78bfa', animation: `blink 1.2s ${i * 0.2}s infinite` }} />)}
      </div>
      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#a78bfa', letterSpacing: '0.04em' }}>
        {activeLabel ?? (status === 'submitted' ? 'Sending to agent…' : 'Thinking…')}
      </span>
      {activeTool && <span style={{ marginLeft: 'auto', fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{activeTool}</span>}
    </div>
  );
}

// ── HITL Approval widget (shown inline in chat for suggestReply) ───────────────
function HITLApprovalCard({
  part, addToolApprovalResponse
}: {
  part: any;
  addToolApprovalResponse: (opts: { id: string; approved: boolean; reason?: string }) => void;
}) {
  const inv = part.toolInvocation;
  const input = inv?.input as {
    leadId?: string; theirReply?: string; intent?: string;
    suggestedSubject?: string; suggestedBody?: string; suggestedCta?: string; reasoning?: string;
  } | undefined;

  const [subject, setSubject] = useState(input?.suggestedSubject ?? '');
  const [body, setBody] = useState(input?.suggestedBody ?? '');
  const [cta, setCta] = useState(input?.suggestedCta ?? '');
  const [rejected, setRejected] = useState(false);
  const [reason, setReason] = useState('');

  if (!input) return null;

  if (rejected) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px', marginTop: '8px', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '8px' }}>Why isn't this right?</div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Too long, doesn't address their pricing question..." rows={2} style={{ width: '100%', padding: '7px 10px', fontSize: '11px', fontFamily: 'var(--font-sans)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
          <button onClick={() => setRejected(false)} style={{ padding: '4px 10px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'transparent', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--muted)', cursor: 'pointer' }}>Back</button>
          <button onClick={() => addToolApprovalResponse({ id: inv.approval.id, approved: false, reason })} style={{ padding: '4px 10px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: '3px', color: '#f87171', cursor: 'pointer' }}>Ask Agent to Revise</button>
        </div>
      </div>
    );
  }

  const approvedMailto = buildMailto(
    '', // user will have email in lead card; this is just for chat preview
    subject,
    `${body}\n\n${cta}`
  );

  return (
    <div style={{ border: '1px solid #a78bfa44', borderRadius: 'var(--radius)', marginTop: '10px', background: 'rgba(167,139,250,0.04)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #a78bfa22', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} />
        <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Reply Draft — Review Before Sending</span>
        {input.intent && <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#52525b', fontStyle: 'italic' }}>Intent: {input.intent}</span>}
      </div>

      {/* Their reply context */}
      {input.theirReply && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #a78bfa22', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>They said:</div>
          <div style={{ fontSize: '11px', color: '#71717a', fontStyle: 'italic', lineHeight: 1.5 }}>"{input.theirReply}"</div>
        </div>
      )}

      {/* Editable subject */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #a78bfa22' }}>
        <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Subject</div>
        <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', fontFamily: 'var(--font-sans)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* Editable body */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #a78bfa22' }}>
        <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Body</div>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', fontFamily: 'var(--font-sans)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }} />
      </div>

      {/* Editable CTA */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #a78bfa22' }}>
        <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>CTA</div>
        <input value={cta} onChange={e => setCta(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', fontFamily: 'var(--font-sans)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* Reasoning */}
      {input.reasoning && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #a78bfa22' }}>
          <div style={{ fontSize: '9px', color: '#3f3f46', fontStyle: 'italic' }}>Why this draft: {input.reasoning}</div>
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => addToolApprovalResponse({ id: inv.approval.id, approved: true })} style={{ padding: '5px 14px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(74,222,128,0.1)', border: '1px solid #4ade80', borderRadius: '3px', color: '#4ade80', cursor: 'pointer' }}>
          Approve Draft
        </button>
        <button onClick={() => setRejected(true)} style={{ padding: '5px 14px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'transparent', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--muted)', cursor: 'pointer' }}>
          Ask to Revise
        </button>
        <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#3f3f46' }}>Edit above, then approve</span>
      </div>
    </div>
  );
}

// ── Pipeline LeadCard (clean, focused) ────────────────────────────────────────
function PipelineCard({ lead, onOutcome, onReply }: { lead: Lead; onOutcome: () => void; onReply: (l: Lead) => void }) {
  const stateColor = getStateColor(lead.state);
  const outreach = lead.meta?.outreach as { subject?: string; body?: string; cta?: string } | undefined;
  const [expanded, setExpanded] = useState(false);
  const [logStage, setLogStage] = useState<'idle' | 'note' | 'done'>('idle');
  const [chosen, setChosen] = useState<typeof OUTCOMES_LIST[0] | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const last = lastOutcome(lead);
  const daysSince = Math.floor((Date.now() - new Date(lead.stateChangedAt).getTime()) / 86400000);
  const isStale = ['queued', 'active'].includes(lead.state) && daysSince >= 5;

  const confirmOutcome = async () => {
    if (!chosen || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/outcome', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, outcome: chosen.outcome, notes: notes.trim() || undefined }) });
      setLogStage('done');
      onOutcome();
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{lead.country} · {lead.industry}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
          {lead.score != null && lead.score > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>{lead.score}</div>}
          {isStale && <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#f59e0b', textTransform: 'uppercase' }}>{daysSince}d stale</div>}
        </div>
      </div>

      {/* State + segment */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
        <span style={{ fontSize: '8px', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: stateColor, border: `1px solid ${stateColor}`, padding: '2px 5px', borderRadius: '3px', letterSpacing: '0.04em' }}>{lead.state}</span>
        {lead.segment && <span style={{ fontSize: '8px', color: 'var(--muted)', border: '1px solid var(--border)', padding: '2px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.02)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.segment}>{lead.segment}</span>}
        {last && <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: OUTCOMES_LIST.find(o => o.outcome === last.outcome)?.color ?? '#888', border: `1px solid ${OUTCOMES_LIST.find(o => o.outcome === last.outcome)?.color ?? '#888'}33`, padding: '2px 5px', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{OUTCOMES_LIST.find(o => o.outcome === last.outcome)?.label ?? last.outcome}</span>}
      </div>

      {/* Outreach panel */}
      {outreach?.subject && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.015)', overflow: 'hidden', marginBottom: '10px' }}>
          <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Subject</div>
              <div style={{ fontSize: '11.5px', color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{outreach.subject}</div>
            </div>
            <CopyBtn text={outreach.subject} label="Copy" id={`sub-${lead.id}`} />
          </div>
          <div style={{ padding: '7px 12px', borderBottom: outreach.cta ? '1px solid var(--border)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Body</div>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => setExpanded(e => !e)} style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', background: 'transparent', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{expanded ? 'Collapse' : 'Expand'}</button>
                <CopyBtn text={outreach.body || ''} label="Copy" id={`body-${lead.id}`} />
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: expanded ? '400px' : '48px', overflow: 'hidden', transition: 'max-height 0.2s ease' }}>{outreach.body}</div>
          </div>
          {outreach.cta && (
            <div style={{ padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{outreach.cta}</div>
              <CopyBtn text={`${outreach.subject}\n\n${outreach.body}\n\n${outreach.cta}`} label="Copy All" id={`all-${lead.id}`} />
            </div>
          )}

          {/* Send + log */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Send row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <a href={lead.contactEmail ? buildMailto(lead.contactEmail, outreach.subject ?? '', `${outreach.body ?? ''}\n\n${outreach.cta ?? ''}`) : '#'} title={lead.contactEmail ? `Open mail client → ${lead.contactEmail}` : 'No email — ask agent'} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textDecoration: 'none', background: lead.contactEmail ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${lead.contactEmail ? '#4ade80' : 'var(--border)'}`, borderRadius: '3px', color: lead.contactEmail ? '#4ade80' : 'var(--faint)', pointerEvents: lead.contactEmail ? 'auto' : 'none', opacity: lead.contactEmail ? 1 : 0.45 }}>
                ✉ {lead.contactEmail ? 'Open in Mail' : 'No email on file'}
              </a>
              {lead.contactEmail && <span style={{ fontSize: '9px', color: '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.contactEmail}</span>}
            </div>

            {/* Log outcome — compact inline */}
            {logStage === 'idle' && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Log:</span>
                {OUTCOMES_LIST.map(o => (
                  <button key={o.outcome} onClick={() => { setChosen(o); setLogStage('note'); }} style={{ padding: '3px 8px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'transparent', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }} onMouseEnter={e => { e.currentTarget.style.borderColor = o.color; e.currentTarget.style.color = o.color; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {logStage === 'note' && chosen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: chosen.color, fontWeight: 700, textTransform: 'uppercase' }}>{chosen.label}</span>
                  <span style={{ fontSize: '9px', color: 'var(--faint)' }}>— context?</span>
                  <button onClick={() => { setLogStage('idle'); setChosen(null); setNotes(''); }} style={{ marginLeft: 'auto', fontSize: '8px', color: 'var(--faint)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
                <textarea autoFocus value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmOutcome(); } }} placeholder="Optional notes..." rows={2} style={{ width: '100%', padding: '6px 8px', fontSize: '11px', fontFamily: 'var(--font-sans)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none', resize: 'none', lineHeight: 1.5, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '9px', color: 'var(--faint)', alignSelf: 'center' }}>Enter to confirm</span>
                  <button onClick={confirmOutcome} disabled={submitting} style={{ padding: '4px 10px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', background: chosen.color + '22', border: `1px solid ${chosen.color}`, borderRadius: '3px', color: chosen.color, cursor: 'pointer' }}>{submitting ? '...' : 'Confirm'}</button>
                </div>
              </div>
            )}
            {logStage === 'done' && chosen && (
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: chosen.color, fontWeight: 700, textTransform: 'uppercase' }}>✓ {chosen.label} logged</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── InboxView — conversation thread per replied lead ──────────────────────────
function InboxView({ leads, onSendToChat }: { leads: Lead[]; onSendToChat: (msg: string) => void }) {
  const repliedLeads = useMemo(() =>
    leads.filter(l => l.notes && l.notes.some(n => n.outcome === 'replied')),
    [leads]
  );

  if (repliedLeads.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '32px' }}>
        <div style={{ fontSize: '24px', opacity: 0.2 }}>✉</div>
        <div style={{ fontSize: '13px', color: '#52525b', textAlign: 'center' }}>Inbox is empty</div>
        <div style={{ fontSize: '11px', color: 'var(--faint)', textAlign: 'center', maxWidth: '240px', lineHeight: 1.6 }}>When a lead replies, log it with "They Replied" on any outreach card and it will appear here.</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
      {repliedLeads.map(lead => {
        const outreach = lead.meta?.outreach as { subject?: string; body?: string; cta?: string } | undefined;
        const approvedReply = lead.meta?.approvedReply as { subject?: string; body?: string; cta?: string; at?: string } | undefined;
        const replyNotes = lead.notes?.filter(n => n.outcome === 'replied') ?? [];
        const latestReply = replyNotes[replyNotes.length - 1];

        return (
          <div key={lead.id} style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
            {/* Lead header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{lead.company}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                  {lead.country} · {lead.industry}
                  {lead.contactName && lead.contactName !== 'Unknown' && ` · ${lead.contactName}`}
                  {lead.contactRole && ` (${lead.contactRole})`}
                </div>
              </div>
              {lead.score != null && lead.score > 0 && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', flexShrink: 0 }}>{lead.score}</div>
              )}
            </div>

            {/* Thread: what we sent */}
            {outreach?.subject && (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid var(--border)', paddingLeft: '12px', marginBottom: '8px' }}>
                <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>We sent:</div>
                <div style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 500 }}>{outreach.subject}</div>
              </div>
            )}

            {/* Thread: they replied */}
            {latestReply && (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid #4ade8044', paddingLeft: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>↩ They replied</div>
                  <div style={{ fontSize: '8px', color: '#3f3f46' }}>{new Date(latestReply.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                </div>
                {latestReply.text && (
                  <div style={{ fontSize: '12px', color: '#d4d4d8', lineHeight: 1.6, fontStyle: 'italic' }}>"{latestReply.text}"</div>
                )}
              </div>
            )}

            {/* Approved reply (if agent drafted + BD approved) */}
            {approvedReply?.subject ? (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid #818cf844', paddingLeft: '12px', marginBottom: '10px' }}>
                <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', fontWeight: 700 }}>◈ Approved reply ready</div>
                <div style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '6px' }}>{approvedReply.subject}</div>
                <a href={lead.contactEmail ? buildMailto(lead.contactEmail, approvedReply.subject ?? '', `${approvedReply.body ?? ''}\n\n${approvedReply.cta ?? ''}`) : '#'} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 12px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textDecoration: 'none', background: 'rgba(74,222,128,0.1)', border: '1px solid #4ade80', borderRadius: '3px', color: '#4ade80', pointerEvents: lead.contactEmail ? 'auto' : 'none' }}>
                  ✉ Send in Mail
                </a>
              </div>
            ) : (
              /* Get AI reply suggestion */
              <div style={{ marginLeft: '12px' }}>
                <button
                  onClick={() => onSendToChat(`Suggest a follow-up reply for ${lead.company}${latestReply?.text ? ` — they replied: "${latestReply.text}"` : ''}. Lead ID: ${lead.id}`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(167,139,250,0.08)', border: '1px solid #a78bfa44', borderRadius: '3px', color: '#a78bfa', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa'; e.currentTarget.style.background = 'rgba(167,139,250,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#a78bfa44'; e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; }}
                >
                  ◈ Get AI Reply Suggestion
                </button>
                <span style={{ marginLeft: '8px', fontSize: '9px', color: '#3f3f46' }}>Agent drafts → you review → send</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AgentConsole({ leads: initialLeads }: { leads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [input, setInput] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>('all');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const { messages, status, sendMessage, addToolApprovalResponse, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onFinish: () => { fetchLeads(); },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/leads');
      if (res.ok) setLeads(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  // Send a pre-built message from InboxView button
  const handleSendToChat = useCallback((msg: string) => {
    sendMessage({ role: 'user', parts: [{ type: 'text', text: msg }] });
    // Scroll chat into view on mobile
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sendMessage]);

  // ── Pipeline filters ──────────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    switch (pipelineFilter) {
      case 'inbox':   return leads.filter(l => l.notes?.some(n => n.outcome === 'replied'));
      case 'new':     return leads.filter(l => ['new', 'enriched', 'scored'].includes(l.state));
      case 'ready':   return leads.filter(l => l.state === 'queued');
      case 'active':  return leads.filter(l => ['active', 'hot', 'lukewarm'].includes(l.state) && !l.notes?.some(n => n.outcome === 'replied'));
      case 'attention': {
        const cutoff = Date.now() - 5 * 86400000;
        return leads.filter(l => ['queued', 'active'].includes(l.state) && new Date(l.stateChangedAt).getTime() < cutoff);
      }
      default: return leads;
    }
  }, [leads, pipelineFilter]);

  const counts = useMemo(() => {
    const cutoff = Date.now() - 5 * 86400000;
    return {
      all:       leads.length,
      inbox:     leads.filter(l => l.notes?.some(n => n.outcome === 'replied')).length,
      new:       leads.filter(l => ['new', 'enriched', 'scored'].includes(l.state)).length,
      ready:     leads.filter(l => l.state === 'queued').length,
      active:    leads.filter(l => ['active', 'hot', 'lukewarm'].includes(l.state) && !l.notes?.some(n => n.outcome === 'replied')).length,
      attention: leads.filter(l => ['queued', 'active'].includes(l.state) && new Date(l.stateChangedAt).getTime() < cutoff).length,
    };
  }, [leads]);

  const SUGGESTIONS = [
    { label: 'Add Lead',      desc: 'Research and add a company', cmd: 'Add Nile Cargo Limited, Uganda, freight forwarding — contact: David Ssekandi, Head of Operations' },
    { label: 'Review Pipeline', desc: "What needs attention today?",  cmd: 'Review my pipeline — what should I do today?' },
    { label: 'Enrich All',    desc: 'Research new leads',            cmd: 'Enrich all new leads in the pipeline' },
    { label: 'Score & Write', desc: 'Score + generate outreach',     cmd: 'Score all enriched leads and generate outreach' },
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' }}>

      {/* Header */}
      <header style={{ height: '56px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#000', zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fff', letterSpacing: '0.15em' }}>◈</span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Onboard GTM</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={isLoading ? 'active-pulse' : ''} style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLoading ? '#fff' : '#3f3f46', boxShadow: isLoading ? '0 0 8px #fff' : 'none' }} />
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: isLoading ? '#fff' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isLoading ? 'Working' : 'Ready'}</span>
        </div>
      </header>

      {/* Main 50/50 */}
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', height: 'calc(100vh - 56px)', padding: '16px', gap: '16px', background: '#000', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* ── LEFT: Chat ── */}
        <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#09090b', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
          <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: '24px', minHeight: 0 }}>

            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '20px', maxWidth: '480px', width: '100%' }}>
                <div>
                  <p style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600, color: '#fff' }}>Good morning.</p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7 }}>Tell me about a company to reach, ask me to review your pipeline, or click a lead in Inbox to get a reply draft.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s.label} onClick={() => setInput(s.cmd)} style={{ padding: '14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#52525b'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#fff', marginBottom: '3px' }}>{s.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(m => {
                const isUser = m.role === 'user';
                const textContent = m.parts
                  ? m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('')
                  : (m as any).content ?? '';

                // Check for approval-requested parts (HITL)
                const approvalParts = m.parts
                  ? m.parts.filter((p: any) =>
                      (p.type === 'tool-suggestReply' || p.type === 'dynamic-tool') &&
                      p.state === 'approval-requested'
                    )
                  : [];

                return (
                  <div key={m.id} style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '90%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                    <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: '5px', letterSpacing: '0.08em' }}>
                      {isUser ? 'you' : 'onboard gtm'}
                    </div>
                    <div style={{ padding: isUser ? '12px 16px' : '14px 18px', borderRadius: 'var(--radius)', background: isUser ? '#18181b' : 'transparent', border: '1px solid var(--border)', width: '100%' }}>
                      {isUser
                        ? <span style={{ fontSize: '13.5px', lineHeight: 1.6, color: '#fff' }}>{textContent}</span>
                        : renderMd(textContent)
                      }
                      {/* HITL approval widgets */}
                      {approvalParts.map((part: any, i: number) => (
                        <HITLApprovalCard key={i} part={part} addToolApprovalResponse={addToolApprovalResponse} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div className="active-pulse" style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#fff' }} />
                <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>thinking...</span>
              </div>
            )}

            {error && (
              <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid #f87171', background: 'rgba(248,113,113,0.06)', fontSize: '12px', color: '#f87171' }}>
                {error.message}
              </div>
            )}
          </div>

          <ActiveToolBar messages={messages} status={status} />

          {/* Input */}
          <form onSubmit={e => { e.preventDefault(); if (!input.trim() || isLoading) return; sendMessage({ role: 'user', parts: [{ type: 'text', text: input }] }); setInput(''); }} style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: '#09090b', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask me anything about your pipeline…" disabled={isLoading} style={{ flex: 1, padding: '11px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#09090b', fontSize: '13px', fontFamily: 'var(--font-sans)', color: '#fff', outline: 'none' }} />
              <button type="submit" disabled={isLoading || !input.trim()} style={{ padding: '0 20px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: isLoading || !input.trim() ? 'transparent' : '#fff', color: isLoading || !input.trim() ? 'var(--faint)' : '#09090b', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer', height: '42px', flexShrink: 0 }}>Send</button>
            </div>
          </form>
        </section>

        {/* ── RIGHT: Pipeline / Inbox ── */}
        <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#09090b', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {/* Filter tabs */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fff' }}>
                {pipelineFilter === 'inbox' ? 'Inbox' : 'Pipeline'}
              </span>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>{leads.length} leads</span>
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {([
                { key: 'all',       label: 'All',           title: 'Every lead' },
                { key: 'inbox',     label: '✉ Inbox',       title: 'Leads who replied' },
                { key: 'new',       label: 'New',           title: 'Not yet outreached' },
                { key: 'ready',     label: 'Ready',         title: 'Outreach drafted, not sent' },
                { key: 'active',    label: 'Active',        title: 'Sent, no reply yet' },
                { key: 'attention', label: '⚠ Stale',      title: '5+ days no update' },
              ] as { key: PipelineFilter; label: string; title: string }[]).map(({ key, label, title }) => {
                const isActive = pipelineFilter === key;
                const count = counts[key as keyof typeof counts] ?? 0;
                const isInboxAlert = key === 'inbox' && count > 0;
                const isStaleAlert = key === 'attention' && count > 0;
                const alertColor = isInboxAlert ? '#4ade80' : '#f59e0b';
                const isAlert = isInboxAlert || isStaleAlert;
                return (
                  <button key={key} onClick={() => setPipelineFilter(key)} title={title} style={{ padding: '3px 8px', fontSize: '9px', fontFamily: 'var(--font-sans)', fontWeight: isActive ? 700 : 500, textTransform: 'uppercase', letterSpacing: '0.04em', background: isActive ? (isAlert ? `${alertColor}18` : 'rgba(255,255,255,0.08)') : 'transparent', color: isActive ? (isAlert ? alertColor : '#fff') : 'var(--muted)', border: `1px solid ${isActive ? (isAlert ? alertColor : 'rgba(255,255,255,0.2)') : 'transparent'}`, borderRadius: '4px', cursor: 'pointer', transition: 'all 0.12s ease' }}>
                    {label} {count > 0 ? `(${count})` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content — switches between Inbox view and Pipeline list */}
          {pipelineFilter === 'inbox' ? (
            <InboxView leads={leads} onSendToChat={handleSendToChat} />
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
              {filteredLeads.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#52525b' }}>Nothing here</span>
                  <span style={{ fontSize: '11px', color: 'var(--faint)' }}>{pipelineFilter === 'all' ? 'Add a lead in the chat to get started.' : 'Switch filters to see other leads.'}</span>
                </div>
              ) : (
                filteredLeads.map(lead => (
                  <PipelineCard
                    key={lead.id}
                    lead={lead}
                    onOutcome={fetchLeads}
                    onReply={l => { setPipelineFilter('inbox'); }}
                  />
                ))
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
