# Add this to the end of the SymStudio PRD before pasting it into Lovable

Copy everything inside the box:

```
Reference build: https://github.com/makaihurstjob-sys/firstbill
Use that repo as a design and behavior reference for this PRD. Match its flow, names and copy where the PRD agrees:
1) JOIN by text to 34778 -> FirstBill replies with a link -> one-page mobile signup (first name, payday, StudentAid.gov loan file, Plaid sandbox bank connect, consent) -> everything else happens in the text thread, no app download.
2) FirstBill texts FIRST: "Heads up, your grace period ends in 12 days. Your first $310.39 payment pulls Fri, Dec 4 and leaves you $139.79 until payday. Your phone bill and car insurance would overdraft you by $23.21." It shows a checking timeline card, offers ONE fix (move the due date to the 20th), says what it costs ($0 fees, interest about $4.31 a day either way), and asks the user to reply YES.
3) YES -> FirstBill drafts the message the user sends to their servicer (copy button). FirstBill never logs in or moves money.
4) Second feature: forward a confusing servicer notice -> Claude decodes it (plain English, credit clock: federal loans report at 90 days late, bank overdraft check, one next action with its cost, YES to draft).
Build it as an iPhone Messages-style screen in React + Tailwind + shadcn. Put all money math (dates, balances, overdraft) in plain TypeScript, never in the AI. Call Claude only from a Supabase edge function (see supabase/functions/firstbill-ai in the repo; secret ANTHROPIC_API_KEY), and keep the built-in backup answers so the demo works with no key. Not a budgeting app: no charts, categories or dashboards. Fee-free, no data selling, no credit offers, education not advice. All data is sandbox data.
Bank and loan data: use Plaid Sandbox only (sample data), with the custom Sandbox user in plaid/firstbill-sandbox-user.json logged in by the supabase/functions/plaid-sandbox edge function (secrets PLAID_CLIENT_ID and PLAID_SECRET, host https://sandbox.plaid.com), and fall back to the same built-in numbers when it is not set up.
```
