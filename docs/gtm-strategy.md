# GTM Engineer — System Design, Strategy & Interview Readiness

**Built for:** Onboard (first GTM Engineer role)  
**What this is:** A complete autonomous outbound pipeline — from lead sourcing intent to HITL reply approval — built as a demo and interview artifact.

---

## 1. What We Built vs. What the JD Asks For

The JD asks for someone who can build the outbound revenue system from zero: enrichment pipelines, personalisation at scale, sequencing automation, feedback loops, and experiment infrastructure.

Here is an honest map of what exists:

### Demonstrated (Live in the App)

| JD Requirement | What Exists | Status |
|---|---|---|
| Enrichment pipeline | `enrichLead` agent: Tavily web research, FX signal detection, expansion/hiring/funding signals | ✅ Live |
| Personalisation at scale | `generateOutreach` agent: bespoke subject + body + CTA per lead, referencing the exact signals found — no templates | ✅ Live |
| Lead scoring | `scoreLead` agent: 0–100 score with breakdown reasoning + dynamic segment label (LLM-assigned, never boxed into static categories) | ✅ Live |
| Signal intelligence | Agent detects and labels signals from research — not constrained to a fixed list, LLM categorises dynamically | ✅ Live |
| Sequencing logic | Orchestrator reviews pipeline and reasons about next steps (which lead to send first, who to follow up with, who's gone cold) — runs as a colleague decision, not a cron rule | ✅ Live |
| Duplicate prevention | `verifyLead` runs before every lead creation | ✅ Live |
| Experiment infrastructure | `proposeExperiment` agent: A/B hypothesis generation from observed campaign metrics | ✅ Live |
| CRM-style pipeline view | Real-time lead dashboard — state badges, scores, segment labels, outreach copy, staleness alerts | ✅ Live |
| Agentic orchestration | Full AI SDK v6 `ToolLoopAgent` with streaming SSE, live tool status bar in the UI | ✅ Live |
| HITL (Human-in-the-Loop) | `suggestReply` tool with `needsApproval: true` — agent drafts a follow-up, BD reviews/edits, approves → email client opens | ✅ Live |
| Inbox / reply handling | Dedicated Inbox view (conversation thread per replied lead) separate from the Pipeline queue | ✅ Live |
| Outcome logging | BD logs what happened (replied / no response / call booked / not interested) — agent can also log from chat | ✅ Live |
| Streaming UI | `useChat` with `DefaultChatTransport`, real-time tool indicators, generative UI | ✅ Live |

### Production Gaps (Not Expected for Demo)

| Gap | Why | When |
|---|---|---|
| Email sending integration (Smartlead, Instantly) | External API + domain warming | Phase 2 |
| Webhook ingestion (opens, clicks, bounces) | Needs a sending tool first | Phase 2 |
| Bulk import (Apollo / Clay / CSV) | Data sourcing automation | Phase 2 |
| Statistical significance on A/B results | Math layer on experiment outcomes | Phase 2 |
| CRM sync (HubSpot / Salesforce) | External integration | Phase 2 |

### Interview Verdict

**This is enough — and more than most candidates will show.**

The JD says: *"The real signal: you've built something end-to-end that worked, and you can do it again."*

What we have is an end-to-end autonomous outbound system that goes from company name → research → score → bespoke outreach → send → inbox → HITL reply approval. That is the full motion compressed into one working demo. Run it live in the interview.

---

## 2. System Architecture

### Two-Panel Interface

The UI is split 50/50:

**Left — Chat (Agent Console)**  
A conversational interface with the GTM orchestrator. BD speaks to it like a colleague:
- "Add Nile Cargo Limited, Uganda, freight forwarding"
- "Review my pipeline — what should I do today?"
- "Suggest a reply for Flutterwave — they said they want pricing details"

The agent streams back its reasoning, runs tools in real-time (shown in a live status bar), and updates the pipeline automatically.

**Right — Pipeline / Inbox (switches by tab)**  
- **Pipeline view:** Scannable lead queue. State badge, score, segment, outreach copy (expand/collapse), mailto send button, and inline outcome logging.
- **Inbox view:** Conversation thread per lead who replied. Shows what we sent → what they said → AI reply draft (editable) → approve → send.

### The HITL Loop (Human-in-the-Loop)

This is the most architecturally interesting piece:

```
BD: "Suggest a reply for Flutterwave"
     ↓
Agent calls getLead → reads their original outreach + reply note
     ↓
Agent calls suggestReply (needsApproval: true)
     ↓                    ↑ pauses here
UI intercepts state: 'approval-requested'
Shows editable card: subject / body / CTA + "Why this draft"
     ↓
BD edits if needed → clicks "Approve"
addToolApprovalResponse({ id, approved: true })
     ↓
Agent resumes → stores approved reply → confirms to BD
Inbox shows ✉ Send in Mail → opens mail client pre-filled
```

The agent never sends email programmatically. BD is always the final sender. The agent's job is to eliminate the blank-page problem and compress the thinking time.

### The Feedback Loop Architecture

```
1. ENRICH
   Agent researches → detects signals (expansion, FX activity, funding, hires)
        ↓
2. SCORE & SEGMENT
   Agent scores 0–100, assigns a specific segment label
   (LLM-generated — e.g. "West Africa freight forwarder, high import volume")
        ↓
3. GENERATE OUTREACH
   Agent writes bespoke email referencing exact signal found
   ("Your Lagos warehouse expansion suggests you're scaling FX settlement...")
        ↓
4. BD SENDS
   Copies from Pipeline, sends from their inbox via mailto
   Or: uses the ✉ Open in Mail button
        ↓
5. LOG OUTCOME
   BD logs: They Replied / No Response / Call Booked / Not Interested
   Agent can also log from chat: "Flutterwave replied saying they're interested"
        ↓
6. INBOX — HITL REPLY
   Agent reads their reply → drafts follow-up → BD reviews → approves → sends
        ↓
7. LEARN (next iteration)
   Orchestrator, when asked to review pipeline, reasons over all outcomes
   "Expansion signal → 40% reply rate in freight" vs "funding signal → 12%"
   Next outreach for same segment gets better context
```

### Why No Static Segments or Signal Types

Earlier versions had hardcoded ICP buckets (`sme_importer`, `fintech`, `freight`) and signal enums (`funding`, `hire`). These were removed deliberately.

**The reason:** Africa's SME landscape is too varied and fast-moving to fit into six boxes. A hardcoded segment means you miss a category the moment the market produces something new — a BNPL player, a commodities desk, a cross-border logistics aggregator.

Instead, the LLM is given the ICP definition (African SMEs with FX volume) and asked to:
1. Research freely
2. Describe what it found in its own words
3. Assign a specific, descriptive segment label from scratch

This produces segments like *"East Africa freight forwarder with active import routes, expansion into DRC"* — which is far more useful to the BD team than `freight`.

The same logic applies to signals: the agent categorises what it finds rather than checking boxes.

---

## 3. Orchestrator Design — Colleague, Not Tool

The orchestrator is a `ToolLoopAgent` with a system prompt that frames it as a senior GTM colleague:

> "You are a senior GTM colleague to the BD/sales team — not a tool. Your job is to think commercially, surface the right opportunities, and make the BD team faster and sharper."

This means:
- It doesn't dump raw data — it interprets it
- When asked to review the pipeline, it gives a prioritised to-do list with reasoning
- When a lead replies, it doesn't just draft a template — it reads their intent and crafts a specific response
- When something needs attention, it says so explicitly: "This one's ready to send."

The agent handles five distinct workflows triggered by natural language:
1. **New lead** → verify → create → enrich → score → write outreach
2. **Pipeline review** → read all states → reason → prioritise → recommend
3. **Outcome logging** → find lead → log → transition state → suggest next move
4. **Inbox / reply** → read context → draft reply (HITL) → confirm after approval
5. **Questions** → query leads → summarise → interpret → answer directly

---

## 4. Application Response Drafts

### "Something you've built" (300 words or less)

> I built a complete outbound GTM intelligence system for Onboard — Africa's cross-border payments infrastructure — from scratch over the course of a few days as a proof of concept for this role.
>
> The problem it solves: outbound at an early-stage startup is person-dependent and doesn't compound. Someone Googles a prospect, writes a message, sends it from memory, forgets to follow up. There's no feedback loop. Every conversation lives in someone's inbox.
>
> What I built: a two-panel console — a conversational agent interface on the left, a real-time CRM pipeline on the right. You type a company name. The orchestrator (built on the AI SDK's ToolLoopAgent) autonomously verifies the lead isn't a duplicate, researches the company via web search detecting FX-relevant signals (import activity, market expansion, new hires, funding), scores it 0–100 against Onboard's ICP, and writes a bespoke outreach email referencing the specific signal found — no templates.
>
> The pipeline tracks every lead's state (new → enriched → scored → queued → active → booked) in PostgreSQL, updating live as the agent works. A real-time tool status bar shows what the agent is doing at every step.
>
> When a lead replies, they surface in the Inbox — a conversation-thread view. The agent reads their reply, drafts a follow-up, and pauses for Human-in-the-Loop approval: the BD person reviews the draft, edits it, and approves before anything is sent.
>
> What I'd do differently: instrument the outcome data from day one. The feedback loop exists in the architecture — the orchestrator can reason over reply rates per signal type when asked. But compounding only happens when that reasoning is automated and surfaces proactively, not on request.

### Top 3 Data Signals for African SME Cross-Border Payment Prospects

> **1. Import/export activity from trade data**  
> Bill of lading records (Volza, ImportGenius, African customs databases) show which companies are actively moving goods across borders. Any SME clearing $500K+ in annual customs declarations has live FX demand. This is the hardest signal to fake and the most commercially specific.
>
> **2. Market expansion announcements**  
> LinkedIn posts, press releases, or job postings mentioning "expanding to [new African market]" indicate a company about to face multi-currency complexity for the first time. They're in the pain discovery moment — the window is short and the timing is perfect.
>
> **3. New finance or ops hire at a growth-stage company**  
> A new CFO, Head of Finance, or Operations Manager often triggers a payments infrastructure review — they come in wanting to clean up how the business manages FX. Sourced via LinkedIn job change alerts filtered by company size (10–500 employees), industry (freight, ecommerce, agri-trade), and market (Nigeria, Kenya, Ghana, Uganda, Egypt).

---

## 5. What to Say in the Interview

**On the system:**  
"I built the full motion end-to-end — research, scoring, personalisation, pipeline tracking, outcome logging, and HITL reply drafting. The agent runs as a colleague you talk to, not a form you fill in. Run it live."

**On scale:**  
"Right now it's manual send — BD copies from the UI. The architecture is ready for Smartlead/Instantly integration: the outreach is already structured as subject + body + CTA in the DB. That's a two-hour integration in Phase 2."

**On the feedback loop:**  
"Every outcome is logged — replied, no response, booked, not interested. The orchestrator can already reason over those outcomes when asked. The next step is making that proactive: daily pattern analysis surfacing which signal types are converting per segment, feeding that back as context for the next batch of outreach."

**On why an agent vs. a workflow tool (Clay, Apollo sequences):**  
"Clay is excellent for enrichment at scale. We'd use it. But the personalisation step — writing an email that references the specific thing you found — that's where templates break down. The agent generates from the research, not from a `{{first_name}}` field. That's the difference between a 2% and a 12% reply rate."
