# FirstBill

**ChatGPT answers questions. FirstBill catches the ones you didn't know to ask.**

FirstBill is a texting assistant for new and first-generation college grads. It watches your student loans and your bank, texts you *before* a bill goes wrong, and drafts the fix you approve by replying **YES**. You send every message yourself: FirstBill never logs in to an account or moves money.

Built by Team Ambassadors (Oakwood University) for the BE Smart Hackathon, Financial Access and Wealth challenge, Nov 20, 2026. This repo is the reference build for the Lovable version generated from our SymStudio PRD. See [LOVABLE_PROMPT.md](LOVABLE_PROMPT.md).

## The demo

The page shows an iPhone Messages thread plus a presenter panel. Three flows:

1. **JOIN by text.** The user texts JOIN to 34778. FirstBill replies with a link to a one-page mobile signup: first name, payday, the StudentAid.gov "Download My Aid Data" loan file, a read-only bank connection through Plaid (sandbox), and consent. After that, everything happens in texts. There's no app to download.
2. **FirstBill texts first.** About 12 days before the grace period ends, it sends a heads-up. The first $310.39 autopay on Dec 4, plus a phone bill and car insurance, would overdraft checking by $23.21 before the Dec 18 payday. It offers one fix (move the due date to the 20th), says what that costs ($0 in fees and no credit hit; interest is about $4.31 a day either way), and asks for YES. Then it drafts the due-date request.
3. **Forward a confusing notice.** A grad who's already behind forwards a delinquency letter. Claude decodes it into plain English. A credit clock shows that federal loans are reported at 90 days late. A bank check shows whether paying would overdraft. It suggests one next action with its cost, and YES drafts the forbearance request.

Free-text questions ("why not just pay it?", "what's a grace period?") go to Claude, with built-in answers as a backup.

**Play full demo, hands-free** runs flows 1 and 2 plus the payday nudge by itself in about 50 seconds, for screen recordings. The script is in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## How it's built

| Piece | Where |
|---|---|
| Chat engine (scenes, typing, YES, questions) | `src/hooks/useFirstBill.ts` |
| Money math and sandbox data (dates, payment, overdraft timeline, sample notice) | `src/lib/firstbill/data.ts` |
| Claude calls: claude.ai artifact runtime, then Supabase edge function, then built-in backup | `src/lib/firstbill/ai.ts` |
| Prompt, rules and JSON checks, shared by browser and server | `supabase/functions/_shared/firstbill-prompt.ts` |
| Edge function that calls the Claude API | `supabase/functions/firstbill-ai/index.ts` |
| Phone UI (thread, cards, signup sheet, Plaid sandbox sheet) | `src/components/phone/` |
| Presenter panel | `src/components/DemoPanel.tsx` |

Design rules we kept to:

- **The AI never does the math.** Dates, balances and overdraft checks are plain TypeScript. Claude only turns them into plain English and decodes notices.
- **One next action, with its cost, before asking YES.**
- **Not a budgeting app.** No charts, categories or dashboards.
- Fee-free, no data selling, no credit offers. Education, not financial advice.
- **All data is sandbox data.** "Meridian Loan Servicing" is a fictional servicer, and "First Platypus Bank" is Plaid's test bank.

## Run it

```bash
npm install
npm run dev        # http://localhost:8080
npm run build      # static site in dist/
```

With no keys it runs on the built-in answers, so the demo can't break.

### Turn on live Claude (Lovable Cloud or Supabase)

1. Deploy the function: `supabase functions deploy firstbill-ai`
2. Set the secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` (optional `CLAUDE_MODEL`, default `claude-opus-5-5`)
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (Lovable Cloud does this for you).

The function enables Claude's server-side refusal fallback, so a declined request is rerouted instead of failing the demo.

### Plaid Sandbox data

The bank and loan numbers come from Plaid's public **Sandbox**: sample data only, never a real account. `plaid/firstbill-sandbox-user.json` is a Plaid custom Sandbox user for the story (First Platypus Bank `ins_109508`, checking ••6602 at $450.18, recent bills, a $1,240 paycheck on the 18th, and the two Direct loans as Liabilities). The `plaid-sandbox` edge function logs it in with `user_custom`, reads `/accounts/balance/get` and `/liabilities/get`, and returns the mapped numbers. Its host is hardcoded to `https://sandbox.plaid.com`.

1. In the Plaid Dashboard (Developers → Keys), copy **your own Sandbox** `client_id` and secret.
2. Set them as Supabase secrets, never in a file: `supabase secrets set PLAID_CLIENT_ID=... PLAID_SECRET=...`
3. Deploy: `supabase functions deploy plaid-sandbox`

The presenter panel then shows "Bank data from: Plaid Sandbox (live)". With no keys it says "Built-in copy of the Plaid Sandbox user" and uses the same numbers from `src/lib/firstbill/data.ts`. Plaid's test login `user_good` / `pass_good` and the custom user are public sample data.

### GitHub Pages (optional)

`.github/workflows/pages.yml` builds and deploys on every push to `main`. Turn it on once under **Settings → Pages → Source: GitHub Actions**.

## Facts the copy relies on

- Federal student loans are reported to credit bureaus at 90+ days late. Private lenders can report at 30.
- Federal loans default at 270 days late, which allows tax refund offset and wage garnishment of up to 15% of disposable pay.
- A forbearance can cover past-due months so the account becomes current, but interest keeps accruing.
- The Repayment Assistance Plan (RAP) began July 1, 2026. Applying at StudentAid.gov is free.
- Sources are in the team's research file, compiled Nov 20, 2026 (NY Fed, Fed SHED 2025, CFPB, NPR).

## How the AI is powered (and why it stays cheap)

FirstBill texts from a server (iMessage/SMS go through a provider like Sendblue or Twilio), so the AI runs server-side, not on the phone. Most of what FirstBill does needs no AI at all: payday, overdraft and payoff math, reminders and YES/STOP handling are plain code, and most texts are templates filled with numbers. The AI only writes words when someone forwards a letter or asks a free-form question, a few times a month per user.

- Today: Claude (small, fast tier) through the `firstbill-ai` edge function, with built-in answers if it's down. The model only sees the letter or question text, never logins, SSNs or full account numbers.
- Later, for schools that want self-hosting: a small open model on a single GPU server can take the routine replies, with Claude kept for decoding letters, where accuracy matters most. A cheap CPU-only VPS is too slow for a chat model at real volume.
