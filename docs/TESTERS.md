# Scenario KB — 5-minute tester guide

You've been invited to try **Scenario KB**, an internal tool that indexes every Make.com scenario in our org and lets you ask, browse, and adapt them in plain English.

**URL:** `<paste your localhost / Vercel URL here when sharing>`
**Sign in:** Click *Continue with Google*. Use your `@make.com` account.

If you land on a page saying *"No org access yet"* — give it a minute, then refresh. Auto-grant should kick in. If it still shows after a refresh, ping Oleksii (`o.chekalov@make.com`).

---

## 5 things to try in 5 minutes

### 1. Ask a real question

Go to **Ask KB** (the default page after sign-in). Try one of:

- *"Do we have a scenario that syncs HubSpot deals to Facebook CAPI?"*
- *"What webhook receivers do we have?"*
- *"Show me anything that uses Google Sheets and amoCRM together"*
- *"Which scenarios send Slack notifications?"*
- *"Find scenarios that store data in a datastore"*

✅ **Expected:** streaming answer with `[1]` `[2]` citations + source cards below showing matching scenarios with a match-% pill.

### 2. Click a citation

Click any `[1]` / `[2]` pill or any *Open* button on a source card → lands on the scenario detail page with the full LLM analysis (business purpose, data flow step-by-step, branches, reuse notes).

### 3. Browse + filter

Click **Browse** in the top bar. Try:
- Type *webhook* in the search box → semantic-ranked results with match-%
- Drag the **Match ≥** slider to 30% → narrows to better matches
- Pick a **Team** from the dropdown → only that team's scenarios
- Copy the URL → it's shareable, all filters persist

### 4. Adapt a scenario

On any detail page, scroll down to the right-side **Adapt with AI** panel. Type something like:

- *"Swap Google Sheets for Airtable, keep everything else"*
- *"Add a Slack notification at the end"*
- *"Replace the trigger with a webhook"*

Click **Generate variant**. ~10-15s later you get a change summary + warnings + a downloadable blueprint JSON.

✅ **Expected:** download a JSON file, open it in Make.com (Create scenario → Import blueprint), verify the structure looks right.
⚠️ **Important:** AI-generated blueprints **always** need human review. The warnings list things the model was uncertain about.

### 5. Re-sync (admins only)

If you have admin access: click **Re-sync** top-right. Pulls the latest from Make. Most scenarios will be "unchanged" (hash-cached). New / edited ones get re-analyzed.

---

## What works ✅

- Ask / chat with citations
- Browse / search / filter
- Scenario detail page with full LLM analysis
- Adapt with AI (download blueprint JSON)
- Re-sync from Make (admin only)
- Real org/team/folder names from Make

## What doesn't work yet ⏳

- The **History** button in the top bar (decorative)
- The **Patterns** section in browse (needs ≥100 scenarios to be meaningful)
- Direct import to Make from the Adapt panel — for now you **download** the JSON and import manually
- Mobile — desktop-first, looks rough on a phone
- Conversation history (each chat session is fresh)

---

## Tell us what's broken / weird / confusing

**Feedback:** click *Give feedback* in the bottom-left sidebar, or email `o.chekalov@make.com`.

Things we especially want to know:
- Questions you asked that returned weird answers
- Scenarios that have wrong / off LLM descriptions
- Anything that looked broken or felt slow
- Features you expected to be there but weren't

This is a v1. Honest feedback >>> polite feedback. Thanks for testing.
