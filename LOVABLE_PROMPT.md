# Add this to the end of the SymStudio PRD before pasting it into Lovable

Copy everything inside the box:

```
Reference build (code): https://github.com/makaihurstjob-sys/firstbill
Reference build (try it on a phone): https://makaihurstjob-sys.github.io/firstbill/
Use that repo as the design and behavior reference for this PRD. Match its flow, numbers and copy where the PRD agrees. Keep every text short, like a real text message.

1) It's a text thread, not an app. On a phone it shows ONLY an iPhone Messages-style screen, full screen (works from Add to Home Screen, respects safe areas, has a Start over button). No dashboard.
2) Setup happens inside the texts. The user texts JOIN. FirstBill: "Hey! I'm FirstBill. I text you before a bill goes wrong. Free, no app." then "What should I call you?" The user types their name. "What day do you get paid?" with quick replies (1st, 15th, 18th, Not sure). "Now your student loans. On StudentAid.gov, tap Download My Aid Data, then send me the file." The user attaches the file. FirstBill: "Got it: 2 federal loans, $28,600, with Meridian. Your grace period ends Dec 2." Then a "Connect your bank" link opens a Plaid Sandbox sheet (First Platypus Bank, read-only). "Connected: checking ••6602."
3) Right after setup (no waiting months), FirstBill checks the next few weeks and texts FIRST: grace period ends in 12 days; $310.39 comes out Dec 4 and leaves $139.79 until payday; with the phone bill ($65, Dec 7) and car insurance ($98, Dec 11) the user would be $23.21 short on Dec 11, an overdraft fee often $25 to $35. It shows a checking timeline card, offers ONE fix (move the due date to the 20th, 2 days after payday, same payment), says the cost ($0, no credit hit), and asks for YES.
4) YES -> FirstBill drafts the message the user sends to their servicer (copy button). FirstBill never logs in or moves money.
5) Payday, FirstBill texts first again: "+$1,240 landed. After this month's bills you still have $1,216.79. Put $25 extra on your loan each month? You'd save about $891 in interest and be done 11 months sooner." Quick replies YES / Not now. YES = a reminder each payday, only when the bank can spare it, plus "tell your servicer the extra goes to principal".
6) Second feature: forward a confusing servicer notice -> Claude decodes it (plain English, credit clock: federal loans report at 90 days late, private at 30; bank overdraft check; one next action with its cost; YES to draft).

Build: React + Tailwind + shadcn. Put all money math (dates, balances, overdraft, payoff savings) in plain TypeScript, never in the AI. Call Claude only from a Supabase edge function (see supabase/functions/firstbill-ai; secret ANTHROPIC_API_KEY) and keep the built-in backup answers so the demo works with no key. Not a budgeting app: no charts, categories or dashboards. Fee-free, no data selling, no credit offers, education not advice. All data is sandbox data.
Bank and loan data: Plaid Sandbox only (sample data), using the custom Sandbox user in plaid/firstbill-sandbox-user.json through the supabase/functions/plaid-sandbox edge function (secrets PLAID_CLIENT_ID and PLAID_SECRET, host https://sandbox.plaid.com). Fall back to the same built-in numbers when it isn't set up.
```
