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
const buildMailto = (email: string, subject: string, body: string) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const getStateColor = (state: string) => {
  switch (state) {
    case 'new':      return '#52525b';
    case 'enriched': return '#71717a';
    case 'scored':   return '#a1a1aa';
    case 'queued':   return '#a78bfa';
    case 'active':   return '#ffffff';
    case 'lukewarm': return '#a1a1aa';
    case 'hot':      return '#ffffff';
    case 'booked':   return '#4ade80';
    case 'stalled':  return '#27272a';
    default:         return '#52525b';
  }
};

const OUTCOMES_LIST = [
  { outcome: 'replied',        label: 'They Replied',   color: '#4ade80' },
  { outcome: 'ignored',        label: 'No Response',    color: '#f59e0b' },
  { outcome: 'booked',         label: 'Call Booked',    color: '#818cf8' },
  { outcome: 'not_interested', label: 'Not Interested', color: '#f87171' },
];

// ── CopyBtn ────────────────────────────────────────────────────────────────────
function CopyBtn({ text, label, id }: { text: string; label: string; id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button onClick={copy} style={{ padding: '3px 8px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: copied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${copied ? '#4ade80' : 'var(--border)'}`, borderRadius: '3px', color: copied ? '#4ade80' : 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ── Markdown renderer ──────────────────────────────────────────────────────────
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

// ── Live tool status bar ───────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  verifyLead:       'Verifying lead details',
  createLead:       'Creating lead record',
  enrichLead:       'Researching company online',
  scoreLead:        'Scoring & segmenting',
  generateOutreach: 'Writing personalised outreach',
  suggestReply:     'Drafting follow-up reply',
  queryLeads:       'Reading pipeline',
  getLead:          'Fetching lead details',
  reviewPipeline:   'Reviewing pipeline',
  logOutcome:       'Logging outcome',
  addSignal:        'Adding intelligence signal',
  updateLeadScore:  'Updating lead score',
  transitionState:  'Updating lead state',
};

function ActiveToolBar({ messages, status }: { messages: any[]; status: string }) {
  const isActive = status === 'submitted' || status === 'streaming';
  if (!isActive) return null;

  let activeLabel: string | null = null;
  let activeTool: string | null = null;

  const lastMsg = [...messages].reverse().find((m: any) => m.role === 'assistant');
  if (lastMsg?.parts) {
    const inFlight = lastMsg.parts.filter((p: any) =>
      p.type?.startsWith('tool-') && p.state === 'call'
    );
    if (inFlight.length > 0) {
      const toolName = inFlight[inFlight.length - 1].type?.replace('tool-', '') ?? '';
      activeTool = toolName;
      activeLabel = TOOL_LABELS[toolName] ?? `Running ${toolName}`;
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 16px', borderTop: '1px solid var(--border)', background: 'rgba(167,139,250,0.04)', flexShrink: 0, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', gap: '3px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#a78bfa', animation: `blink 1.2s ${i * 0.2}s infinite` }} />
        ))}
      </div>
      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#a78bfa', letterSpacing: '0.04em' }}>
        {activeLabel ?? (status === 'submitted' ? 'Sending to agent…' : 'Thinking…')}
      </span>
      {activeTool && (
        <span style={{ marginLeft: 'auto', fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{activeTool}</span>
      )}
    </div>
  );
}

// ── Pipeline card ──────────────────────────────────────────────────────────────
function PipelineCard({ lead, onOutcome }: { lead: Lead; onOutcome: () => void }) {
  const stateColor = getStateColor(lead.state);
  const outreach = lead.meta?.outreach as { subject?: string; body?: string; cta?: string } | undefined;
  const research = lead.meta?.research as string | undefined;
  
  const [outreachExpanded, setOutreachExpanded] = useState(false);
  const [researchExpanded, setResearchExpanded] = useState(false);
  const [researchMode, setResearchMode] = useState<'view' | 'edit'>('view');
  const [researchText, setResearchText] = useState(research || '');
  const [savingResearch, setSavingResearch] = useState(false);

  const [logStage, setLogStage] = useState<'idle' | 'note' | 'done'>('idle');
  const [chosen, setChosen] = useState<typeof OUTCOMES_LIST[0] | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lastNote = lead.notes && lead.notes.length > 0 ? lead.notes[lead.notes.length - 1] : null;
  const daysSince = Math.floor((Date.now() - new Date(lead.stateChangedAt).getTime()) / 86400000);
  const isStale = ['queued', 'active'].includes(lead.state) && daysSince >= 5;

  const confirmOutcome = async () => {
    if (!chosen || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, outcome: chosen.outcome, notes: notes.trim() || undefined }),
      });
      setLogStage('done');
      onOutcome();
    } finally {
      setSubmitting(false);
    }
  };

  const saveResearch = async () => {
    setSavingResearch(true);
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ research: researchText }),
      });
      setResearchMode('view');
      onOutcome(); // to refresh data
    } catch (e) {
      console.error(e);
    } finally {
      setSavingResearch(false);
    }
  };

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{lead.country} · {lead.industry}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
          {lead.score != null && lead.score > 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>{lead.score}</div>
          )}
          {isStale && <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#f59e0b', textTransform: 'uppercase' }}>{daysSince}d stale</div>}
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: outreach?.subject ? '10px' : '0' }}>
        <span style={{ fontSize: '8px', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: stateColor, border: `1px solid ${stateColor}`, padding: '2px 5px', borderRadius: '3px', letterSpacing: '0.04em' }}>{lead.state}</span>
        {lead.segment && (
          <span style={{ fontSize: '8px', color: 'var(--muted)', border: '1px solid var(--border)', padding: '2px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.02)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.segment}>{lead.segment}</span>
        )}
        {lead.contactName && lead.contactName !== 'Unknown' && (
          <span style={{ fontSize: '8px', color: '#52525b', padding: '2px 5px' }}>{lead.contactName}{lead.contactRole ? ` · ${lead.contactRole}` : ''}</span>
        )}
        {lastNote && (
          <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: OUTCOMES_LIST.find(o => o.outcome === lastNote.outcome)?.color ?? '#888', border: `1px solid ${OUTCOMES_LIST.find(o => o.outcome === lastNote.outcome)?.color ?? '#888'}33`, padding: '2px 5px', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {OUTCOMES_LIST.find(o => o.outcome === lastNote.outcome)?.label ?? lastNote.outcome}
          </span>
        )}
      </div>

      {/* Enrichment panel */}
      {research && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.015)', overflow: 'hidden', marginBottom: outreach?.subject ? '10px' : '0' }}>
          <div onClick={() => setResearchExpanded(!researchExpanded)} style={{ padding: '7px 12px', borderBottom: researchExpanded ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#fff' }}>◈</span> Enrichment Data
            </div>
            <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase' }}>
              {researchExpanded ? 'Collapse' : 'Expand'}
            </span>
          </div>
          {researchExpanded && (
            <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
              {researchMode === 'view' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <button onClick={() => setResearchMode('edit')} style={{ padding: '3px 8px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--muted)', cursor: 'pointer' }}>Edit</button>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.55, maxHeight: '300px', overflowY: 'auto' }}>
                    {renderMd(researchText)}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <textarea
                    value={researchText}
                    onChange={(e) => setResearchText(e.target.value)}
                    rows={12}
                    style={{ width: '100%', padding: '8px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => { setResearchMode('view'); setResearchText(research); }} style={{ padding: '4px 10px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={saveResearch} disabled={savingResearch} style={{ padding: '4px 10px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', background: 'rgba(74,222,128,0.1)', border: '1px solid #4ade80', borderRadius: '3px', color: '#4ade80', cursor: 'pointer' }}>{savingResearch ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Outreach card */}
      {outreach?.subject && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.015)', overflow: 'hidden' }}>
          {/* Header toggle */}
          <div onClick={() => setOutreachExpanded(!outreachExpanded)} style={{ padding: '7px 12px', borderBottom: outreachExpanded ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#fff' }}>◈</span> Outreach Draft
            </div>
            <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase' }}>
              {outreachExpanded ? 'Collapse' : 'Expand'}
            </span>
          </div>

          {outreachExpanded && (
            <>
              {/* Subject */}
              <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Subject</div>
                  <div style={{ fontSize: '11.5px', color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{outreach.subject}</div>
                </div>
                <CopyBtn text={outreach.subject} label="Copy" id={`sub-${lead.id}`} />
              </div>
              {/* Body */}
              <div style={{ padding: '7px 12px', borderBottom: outreach.cta ? '1px solid var(--border)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Body</div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <CopyBtn text={outreach.body || ''} label="Copy" id={`body-${lead.id}`} />
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{outreach.body}</div>
              </div>
              {/* CTA */}
              {outreach.cta && (
                <div style={{ padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{outreach.cta}</div>
                  <CopyBtn text={`${outreach.subject}\n\n${outreach.body}\n\n${outreach.cta}`} label="Copy All" id={`all-${lead.id}`} />
                </div>
              )}
              {/* Action bar */}
              <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Send */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a
                    href={lead.contactEmail ? buildMailto(lead.contactEmail, outreach.subject ?? '', `${outreach.body ?? ''}\n\n${outreach.cta ?? ''}`) : '#'}
                    title={lead.contactEmail ? `Open mail client → ${lead.contactEmail}` : 'No email on file — ask the agent'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textDecoration: 'none', background: lead.contactEmail ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${lead.contactEmail ? '#4ade80' : 'var(--border)'}`, borderRadius: '3px', color: lead.contactEmail ? '#4ade80' : 'var(--faint)', pointerEvents: lead.contactEmail ? 'auto' : 'none', opacity: lead.contactEmail ? 1 : 0.5 }}
                  >
                    ✉ {lead.contactEmail ? 'Open in Mail' : 'No email on file'}
                  </a>
                  {lead.contactEmail && <span style={{ fontSize: '9px', color: '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.contactEmail}</span>}
                </div>
                {/* Log */}
                {logStage === 'idle' && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Log:</span>
                    {OUTCOMES_LIST.map(o => (
                      <button key={o.outcome} onClick={() => { setChosen(o); setLogStage('note'); }}
                        style={{ padding: '3px 8px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'transparent', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = o.color; e.currentTarget.style.color = o.color; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                {logStage === 'note' && chosen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: chosen.color, fontWeight: 700, textTransform: 'uppercase' }}>{chosen.label}</span>
                      <span style={{ fontSize: '9px', color: 'var(--faint)' }}>— add context?</span>
                      <button onClick={() => { setLogStage('idle'); setChosen(null); setNotes(''); }} style={{ marginLeft: 'auto', fontSize: '8px', color: 'var(--faint)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                    </div>
                    <textarea autoFocus value={notes} onChange={e => setNotes(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmOutcome(); } }}
                      placeholder="Optional — what did they say?" rows={2}
                      style={{ width: '100%', padding: '6px 8px', fontSize: '11px', fontFamily: 'var(--font-sans)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none', resize: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: '9px', color: 'var(--faint)', alignSelf: 'center' }}>Enter to confirm</span>
                      <button onClick={confirmOutcome} disabled={submitting} style={{ padding: '4px 10px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', background: chosen.color + '22', border: `1px solid ${chosen.color}`, borderRadius: '3px', color: chosen.color, cursor: 'pointer' }}>
                        {submitting ? '...' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
                {logStage === 'done' && chosen && (
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: chosen.color, fontWeight: 700, textTransform: 'uppercase' }}>✓ {chosen.label} logged</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inbox view — replied leads with editable agent drafts ─────────────────────
function InboxView({ leads, onSendToChat }: { leads: Lead[]; onSendToChat: (msg: string) => void }) {
  const repliedLeads = useMemo(() =>
    leads.filter(l => l.notes?.some(n => n.outcome === 'replied')),
    [leads]
  );

  if (repliedLeads.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px 24px' }}>
        <div style={{ fontSize: '22px', opacity: 0.15 }}>✉</div>
        <div style={{ fontSize: '13px', color: '#52525b' }}>Inbox is empty</div>
        <div style={{ fontSize: '11px', color: 'var(--faint)', textAlign: 'center', maxWidth: '220px', lineHeight: 1.7 }}>When a lead replies, log it as "They Replied" from the Pipeline and it'll appear here.</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
      {repliedLeads.map(lead => (
        <InboxThread key={lead.id} lead={lead} onSendToChat={onSendToChat} />
      ))}
    </div>
  );
}

function InboxThread({ lead, onSendToChat }: { lead: Lead; onSendToChat: (msg: string) => void }) {
  const outreach = lead.meta?.outreach as { subject?: string } | undefined;
  const draft = lead.meta?.replyDraft as { subject?: string; body?: string; cta?: string; theirReply?: string; intent?: string; reasoning?: string } | undefined;

  const replyNotes = lead.notes?.filter(n => n.outcome === 'replied') ?? [];
  const latestReply = replyNotes[replyNotes.length - 1];

  // Editable draft state — initialised from DB draft if available
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [body, setBody] = useState(draft?.body ?? '');
  const [cta, setCta] = useState(draft?.cta ?? '');

  // Sync if new draft arrives (e.g. after agent call)
  useEffect(() => {
    if (draft?.subject) setSubject(draft.subject);
    if (draft?.body) setBody(draft.body);
    if (draft?.cta) setCta(draft.cta);
  }, [draft?.subject, draft?.body, draft?.cta]);

  const fullBody = `${body}\n\n${cta}`.trim();
  const hasDraft = !!(subject || body);

  return (
    <div style={{ padding: '18px 0', borderBottom: '1px solid var(--border)' }}>
      {/* Lead header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
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

      {/* What we sent */}
      {outreach?.subject && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', paddingLeft: '2px' }}>
          <div style={{ width: '2px', borderRadius: '1px', background: 'var(--border)', flexShrink: 0, alignSelf: 'stretch' }} />
          <div>
            <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>We sent</div>
            <div style={{ fontSize: '11px', color: '#71717a' }}>{outreach.subject}</div>
          </div>
        </div>
      )}

      {/* Their reply */}
      {latestReply && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', paddingLeft: '2px' }}>
          <div style={{ width: '2px', borderRadius: '1px', background: '#4ade8055', flexShrink: 0, alignSelf: 'stretch' }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>↩ They replied</div>
              <div style={{ fontSize: '8px', color: '#3f3f46' }}>{new Date(latestReply.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
            </div>
            {latestReply.text && (
              <div style={{ fontSize: '12px', color: '#d4d4d8', lineHeight: 1.6, fontStyle: 'italic' }}>"{latestReply.text}"</div>
            )}
          </div>
        </div>
      )}

      {/* Draft section */}
      {hasDraft ? (
        <div style={{ border: '1px solid #a78bfa33', borderRadius: 'var(--radius)', background: 'rgba(167,139,250,0.03)', overflow: 'hidden' }}>
          {/* Draft header */}
          <div style={{ padding: '7px 12px', borderBottom: '1px solid #a78bfa22', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>AI Reply Draft — Edit &amp; Send</span>
            {draft?.intent && <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#52525b', fontStyle: 'italic' }}>{draft.intent}</span>}
          </div>

          {/* Editable subject */}
          <div style={{ padding: '7px 12px', borderBottom: '1px solid #a78bfa22' }}>
            <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Subject</div>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', fontSize: '12px', fontFamily: 'var(--font-sans)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Editable body */}
          <div style={{ padding: '7px 12px', borderBottom: '1px solid #a78bfa22' }}>
            <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Body</div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              style={{ width: '100%', padding: '6px 8px', fontSize: '12px', fontFamily: 'var(--font-sans)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
            />
          </div>

          {/* Editable CTA */}
          <div style={{ padding: '7px 12px', borderBottom: '1px solid #a78bfa22' }}>
            <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>CTA</div>
            <input
              value={cta}
              onChange={e => setCta(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', fontSize: '12px', fontFamily: 'var(--font-sans)', color: '#fff', background: '#09090b', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Reasoning */}
          {draft?.reasoning && (
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #a78bfa22' }}>
              <div style={{ fontSize: '9px', color: '#3f3f46', fontStyle: 'italic' }}>Why: {draft.reasoning}</div>
            </div>
          )}

          {/* Send */}
          <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <a
              href={lead.contactEmail ? buildMailto(lead.contactEmail, subject, fullBody) : '#'}
              title={lead.contactEmail ? `Opens mail client → ${lead.contactEmail}` : 'No email — ask the agent'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 14px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textDecoration: 'none', background: lead.contactEmail ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${lead.contactEmail ? '#4ade80' : 'var(--border)'}`, borderRadius: '3px', color: lead.contactEmail ? '#4ade80' : 'var(--faint)', pointerEvents: lead.contactEmail ? 'auto' : 'none', opacity: lead.contactEmail ? 1 : 0.5 }}
            >
              ✉ Send in Mail
            </a>
            <button
              onClick={() => onSendToChat(`Revise the reply draft for ${lead.company} — `)}
              style={{ padding: '5px 10px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'transparent', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--muted)', cursor: 'pointer' }}
            >
              Ask Agent to Revise
            </button>
            <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#27272a' }}>Edit above · then send</span>
          </div>
        </div>
      ) : (
        /* No draft yet */
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => onSendToChat(`Suggest a follow-up reply for ${lead.company}${latestReply?.text ? ` — they replied: "${latestReply.text}"` : ''}. Lead ID: ${lead.id}`)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(167,139,250,0.08)', border: '1px solid #a78bfa44', borderRadius: '3px', color: '#a78bfa', cursor: 'pointer', transition: 'all 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa'; e.currentTarget.style.background = 'rgba(167,139,250,0.14)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#a78bfa44'; e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; }}
          >
            ◈ Get AI Reply Draft
          </button>
          <span style={{ fontSize: '9px', color: '#3f3f46' }}>Agent drafts → you edit → send</span>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AgentConsole({ leads: initialLeads }: { leads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [input, setInput] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>('all');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const { messages, status, sendMessage, error } = useChat({
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

  const handleSendToChat = useCallback((msg: string) => {
    setInput(msg);
    // focus the input so user can see and optionally edit before sending
    setTimeout(() => {
      const el = document.getElementById('chat-input');
      el?.focus();
    }, 50);
  }, []);

  // ── Filters ──────────────────────────────────────────────────────────────
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
    { label: 'Add Lead',        desc: 'Research and add a company', cmd: 'Add Nile Cargo Limited, Uganda, freight forwarding — contact: David Ssekandi, Head of Operations' },
    { label: 'Review Pipeline', desc: 'What needs attention today?', cmd: 'Review my pipeline — what should I do today?' },
    { label: 'Enrich All',      desc: 'Research new leads',          cmd: 'Enrich all new leads in the pipeline' },
    { label: 'Score & Write',   desc: 'Score + generate outreach',   cmd: 'Score all enriched leads and generate outreach' },
  ];

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' }}>

      {/* Header */}
      <header className="app-header" style={{ height: '56px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#000', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fff', letterSpacing: '0.15em' }}>◈</span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Onboard GTM</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={isLoading ? 'active-pulse' : ''} style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLoading ? '#fff' : '#3f3f46', boxShadow: isLoading ? '0 0 8px #fff' : 'none', transition: 'all 0.2s' }} />
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: isLoading ? '#fff' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', transition: 'color 0.2s' }}>
            {isLoading ? 'Working' : 'Ready'}
          </span>
        </div>
      </header>

      <button type="button" className="mobile-drawer-toggle" onClick={() => setIsDrawerOpen(!isDrawerOpen)}>
        {isDrawerOpen ? '◈ Close' : `◈ Pipeline (${counts.all})`}
      </button>

      {/* 50/50 split or Mobile layout */}
      <main className="main-layout" style={{ flex: 1, height: 'calc(100vh - 56px)', padding: '16px', gap: '16px', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* ── LEFT: Chat ── */}
        <section className="chat-panel" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#09090b', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0 }}>
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '20px', maxWidth: '480px' }}>
                <div>
                  <p style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600, color: '#fff' }}>Good morning.</p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7 }}>Tell me about a company to add, ask me to review your pipeline, or click a lead in Inbox for a reply draft.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s.label} onClick={() => setInput(s.cmd)}
                      style={{ padding: '14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#52525b'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                    >
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

                return (
                  <div key={m.id} style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '92%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                    <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: '5px', letterSpacing: '0.08em' }}>
                      {isUser ? 'you' : 'onboard gtm'}
                    </div>
                    <div style={{ padding: isUser ? '10px 14px' : '12px 16px', borderRadius: 'var(--radius)', background: isUser ? '#18181b' : 'transparent', border: '1px solid var(--border)', width: '100%' }}>
                      {isUser
                        ? <span style={{ fontSize: '13.5px', lineHeight: 1.6, color: '#fff' }}>{textContent}</span>
                        : renderMd(textContent)
                      }
                    </div>
                  </div>
                );
              })
            )}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div className="active-pulse" style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#fff' }} />
                <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>thinking...</span>
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
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!input.trim() || isLoading) return;
              sendMessage({ role: 'user', parts: [{ type: 'text', text: input }] });
              setInput('');
            }}
            style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}
          >
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                id="chat-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask me anything about your pipeline…"
                disabled={isLoading}
                style={{ flex: 1, padding: '11px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#09090b', fontSize: '13px', fontFamily: 'var(--font-sans)', color: '#fff', outline: 'none' }}
              />
              <button type="submit" disabled={isLoading || !input.trim()}
                style={{ padding: '0 20px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: isLoading || !input.trim() ? 'transparent' : '#fff', color: isLoading || !input.trim() ? 'var(--faint)' : '#09090b', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer', height: '42px', flexShrink: 0, transition: 'all 0.15s' }}
              >
                Send
              </button>
            </div>
          </form>
        </section>

        {/* ── RIGHT: Pipeline / Inbox ── */}
        <div className={`mobile-drawer-overlay ${isDrawerOpen ? 'open' : ''}`} onClick={() => setIsDrawerOpen(false)} />
        <section className={`pipeline-panel ${isDrawerOpen ? 'open' : ''}`} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#09090b', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {/* Filter header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fff' }}>
                {pipelineFilter === 'inbox' ? 'Inbox' : 'Pipeline'}
              </span>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--faint)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {leads.length} leads
              </span>
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {([
                { key: 'all',       label: 'All',      title: 'Every lead' },
                { key: 'inbox',     label: '✉ Inbox',  title: 'Leads who replied' },
                { key: 'new',       label: 'New',      title: 'Not yet enriched or outreached' },
                { key: 'ready',     label: 'Ready',    title: 'Outreach drafted, not sent' },
                { key: 'active',    label: 'Active',   title: 'Sent, awaiting reply' },
                { key: 'attention', label: '⚠ Stale', title: '5+ days no update' },
              ] as { key: PipelineFilter; label: string; title: string }[]).map(({ key, label, title }) => {
                const isActive = pipelineFilter === key;
                const count = counts[key as keyof typeof counts] ?? 0;
                const isInboxAlert = key === 'inbox' && count > 0;
                const isStaleAlert = key === 'attention' && count > 0;
                const alertColor = isInboxAlert ? '#4ade80' : '#f59e0b';
                const isAlert = isInboxAlert || isStaleAlert;
                return (
                  <button key={key} onClick={() => setPipelineFilter(key)} title={title}
                    style={{ padding: '3px 8px', fontSize: '9px', fontFamily: 'var(--font-sans)', fontWeight: isActive ? 700 : 500, textTransform: 'uppercase', letterSpacing: '0.04em', background: isActive ? (isAlert ? `${alertColor}18` : 'rgba(255,255,255,0.08)') : 'transparent', color: isActive ? (isAlert ? alertColor : '#fff') : 'var(--muted)', border: `1px solid ${isActive ? (isAlert ? alertColor : 'rgba(255,255,255,0.2)') : 'transparent'}`, borderRadius: '4px', cursor: 'pointer', transition: 'all 0.12s' }}
                  >
                    {label} {count > 0 ? `(${count})` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
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
                filteredLeads.map(lead => <PipelineCard key={lead.id} lead={lead} onOutcome={fetchLeads} />)
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
