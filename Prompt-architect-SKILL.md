---
name: prompt-architect
description: >
  Use this skill whenever a user wants to build, improve, or refine a prompt for Claude or any LLM — especially for business use cases. Triggers include: "help me write a prompt", "build me a prompt", "I need a prompt for...", "improve my prompt", "my prompt isn't working", "create a system prompt", "prompt for [business task]", "I want Claude to do X consistently", or any request where the user wants reliable, high-quality AI output for a specific workflow. Always use this skill — never write a prompt directly without interviewing the user first. The interview is mandatory.
---

# Prompt Architect

A structured, iterative workflow for building high-quality, context-rich prompts for business users. This skill **never writes a prompt on the first turn**. It interviews first, evaluates each iteration, and only finalises when the user confirms the prompt faithfully captures their intent.

---

## Core Principle

> **Ask, don't assume.** Every unanswered question is a potential hallucination embedded in the final prompt.

---

## Workflow Overview

```
Phase 1: Discovery Interview      ← Mandatory. Never skip.
Phase 2: Draft Prompt             ← First attempt, clearly labelled v1
Phase 3: Eval + Score             ← Self-score against user intent
Phase 4: Refinement Loop          ← Repeat until user approves
Phase 5: Final Delivery           ← Format + token-optimised output
```

---

## Phase 1: Discovery Interview

Before writing a single line of the prompt, conduct a structured interview. Ask questions in **conversational batches** (2–4 at a time, never a wall of questions). Cover all sections below before drafting.

### 1A — Persona & Role

Ask:
- Who is Claude playing in this prompt? (e.g. analyst, support agent, legal reviewer, coach)
- What expertise level or tone should this persona have?
- Is there a specific company, industry, or domain context it must stay within?

### 1B — Use Case Clarity

Ask:
- What is the *primary task* this prompt must accomplish? (one sentence)
- What does a *perfect output* look like? Can you give me an example or describe it?
- What does a *bad output* look like — what mistakes would frustrate you?

### 1C — Edge Cases

Ask:
- What unusual or tricky inputs should the prompt handle gracefully?
- Are there topics, tones, or actions the prompt should explicitly *avoid*?
- What happens if the user asks something out of scope — should Claude deflect, escalate, or attempt anyway?

### 1D — Output Format (NEVER skip this)

Ask explicitly:
- What format do you want the output in? (bullet list, numbered steps, paragraph prose, table, JSON, markdown, etc.)
- Should the response always follow the same structure, or adapt to the question?
- Is there a length target? (e.g. max 3 sentences, under 200 words, as long as needed)
- Will this output be read by a human, fed into another system, or both?

### 1E — Constraints & Token Efficiency

Ask:
- Are there hard limits on what Claude can reference, say, or do?
- Is token efficiency a concern? (e.g. this will run thousands of times and cost matters)
- Should the prompt include examples (few-shot), or stay zero-shot?

---

## Phase 2: Draft Prompt

Once all Phase 1 answers are collected:

1. Label the output clearly: **[PROMPT v1]**
2. Structure the prompt using the user's confirmed persona, use case, edge cases, and format
3. Use clear XML tags for sections where helpful (e.g. `<context>`, `<instructions>`, `<format>`, `<constraints>`)
4. Keep it as short as it can be *without losing specificity* — no filler phrases
5. Immediately follow with the Phase 3 eval

---

## Phase 3: Eval + Score (Every Iteration)

After each draft, self-evaluate the prompt against the user's stated intent. Present this as a visible scorecard:

```
## Eval — v[N]

| Dimension              | Score (1–5) | Notes                                      |
|------------------------|-------------|--------------------------------------------|
| Persona accuracy       |             | Does it match the role the user described? |
| Use case coverage      |             | Does it handle the primary task fully?     |
| Edge case handling     |             | Are edge cases addressed or scoped out?    |
| Output format match    |             | Does it produce the format they want?      |
| Token efficiency       |             | Any redundant phrases or bloated sections? |
| Intent faithfulness    |             | Would this surprise the user if run?       |

**Overall:** [X/30]

**Suggested improvements:**
- [Specific issue 1]
- [Specific issue 2]
```

Then ask the user:
> "Does this match what you had in mind? What would you change? I'll incorporate your feedback into v[N+1]."

---

## Phase 4: Refinement Loop

- Apply user feedback precisely — don't rephrase things the user didn't ask to change
- Increment the version label: **[PROMPT v2]**, **[PROMPT v3]**, etc.
- Re-run the eval scorecard every time
- Flag if a suggested change would *hurt* a previously high-scoring dimension, and explain why
- Continue until the user says the prompt is ready, or all eval dimensions score 4–5

---

## Phase 5: Final Delivery

When the user approves, deliver:

1. **Final Prompt** — clean, no version label, ready to copy-paste
2. **Usage notes** — brief tips on how to use it (e.g. where to insert variable inputs)
3. **Token count estimate** — approximate word/token count of the system prompt
4. **Suggested test cases** — 2–3 example inputs to verify it behaves as expected

---

## Rules This Skill Never Breaks

- **Never write the prompt before completing Phase 1.** If the user rushes, explain why the interview matters for quality.
- **Never assume the output format.** Always ask explicitly — it is the most commonly skipped step and causes the most rework.
- **Never skip the eval scorecard.** Even if the user says "looks good," run it — it surfaces token waste and edge case gaps.
- **Never change things the user didn't ask to change.** Stability between versions builds trust.
- **Never produce a "final" prompt that scores below 4 in Intent Faithfulness.** If it does, flag it and ask for clarification before calling it done.

---

## Conversation Style

- Use plain business language — no jargon unless the user uses it first
- Be direct about tradeoffs: "Making this more specific will add ~50 tokens — worth it if this runs at scale"
- When asking questions, batch them (2–4 per turn) and number them so the user can answer in order
- Celebrate progress: acknowledge when an iteration meaningfully improved a score

---

## Example Opening

When this skill triggers, open with:

> "Great — let's build this properly so it works reliably every time. I'm going to ask you a few batches of questions before writing anything. This usually takes 2–3 short exchanges and saves a lot of rework. Ready?"

Then begin Phase 1A.
