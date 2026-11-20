// Shared by the web app and the Supabase edge function. No imports on purpose,
// so it runs unchanged in the browser (Vite) and in Deno.

export type LoanKind = "federal" | "private" | "other_bill" | "unknown";

export interface Decode {
  is_notice: boolean;
  servicer: string;
  loan_kind: LoanKind;
  what_it_means: string;
  amount_to_catch_up: number | null;
  monthly_payment: number | null;
  due_date: string | null; // YYYY-MM-DD
  days_late: number | null;
  next_action_short: string;
  next_action: string;
  cost_of_action: string;
  draft_message: string;
  jargon: { term: string; meaning: string }[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const FIRSTBILL_RULES = `You are PayPing, a calm text-message assistant for new and first-generation college grads.
How you talk: plain English a 15-year-old understands, short like a text, warm, never shaming, no markdown, no emoji.
What you never do: log in to accounts, move money, push credit cards or new loans, sell data, or give investment advice. You only draft messages the user sends themselves. You are education, not financial advice.
Facts you can rely on: federal student loans are reported to credit bureaus once a payment is 90 or more days late; private lenders can report at 30 days. Federal loans default at 270 days late, which allows tax-refund offset and wage garnishment up to 15% of disposable pay; those involuntary collections have been paused since Jan 16, 2026 but can restart. Credit cards and most other bills can be reported at 30 days late. A forbearance is a pause the servicer approves; it can cover months already missed so the account becomes current, but interest keeps adding up. Most servicers let borrowers change their monthly due date, though a change can take a billing cycle to apply. Since July 1, 2026, the income-driven option for new federal loans is the Repayment Assistance Plan (RAP), applied for free at StudentAid.gov; never tell anyone to pay a company for help with it.
Always pick exactly ONE next action, and say what it costs before asking the user to approve it.`;

export function buildDecodePrompt(notice: string, todayISO: string): string {
  return `${FIRSTBILL_RULES}

Today is ${todayISO}. A user forwarded the notice below. Decode it.

Reply with ONLY one JSON object, no other text, in exactly this shape:
{"is_notice": true, "servicer": "name or 'your servicer'", "loan_kind": "federal" | "private" | "other_bill" | "unknown", "what_it_means": "1-2 short sentences", "amount_to_catch_up": number or null, "monthly_payment": number or null, "due_date": "YYYY-MM-DD" or null, "days_late": number or null, "next_action_short": "3-6 words", "next_action": "1-2 sentences, ONE action", "cost_of_action": "1 sentence on what this action costs in dollars or tradeoffs", "draft_message": "the message the user sends their servicer, first person, under 110 words, use [Your name] and [account number] when unknown", "jargon": [{"term": "...", "meaning": "under 15 words"}]}
Use at most 3 jargon items. Numbers are plain numbers without $ or commas. If the text is not a bill, loan or money notice, set "is_notice": false and fill the other text fields with empty strings.

Notice:
"""
${notice}
"""`;
}

export function buildReplyPrompt(context: string, turns: ChatTurn[]): ChatTurn[] {
  const rules = `${FIRSTBILL_RULES}

What you know about this user right now:
${context}

Answer the user's latest text in under 55 words, as one text message. If they ask you to pay, log in or change their account, say you can draft the message for them to send instead. If they say YES, tell them to tap the YES button above.`;
  const recent = turns.slice(-8);
  return [{ role: "user", content: rules }, ...recent];
}

/** Pull the first JSON object out of a model reply (whole text, a code fence, or first { to last }). */
export function extractJson(text: string): unknown {
  const tries: string[] = [text.trim()];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]);
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a !== -1 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) {
    try {
      return JSON.parse(t);
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown, max = 900): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Check and clean a decode from any model. Returns null if it can't be used. */
export function normalizeDecode(raw: unknown): Decode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kinds: LoanKind[] = ["federal", "private", "other_bill", "unknown"];
  const loan_kind = kinds.includes(r.loan_kind as LoanKind) ? (r.loan_kind as LoanKind) : "unknown";
  const is_notice = r.is_notice !== false;
  const d: Decode = {
    is_notice,
    servicer: str(r.servicer, 80) || "your servicer",
    loan_kind,
    what_it_means: str(r.what_it_means),
    amount_to_catch_up: num(r.amount_to_catch_up),
    monthly_payment: num(r.monthly_payment),
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(str(r.due_date)) ? str(r.due_date) : null,
    days_late: num(r.days_late),
    next_action_short: str(r.next_action_short, 80),
    next_action: str(r.next_action),
    cost_of_action: str(r.cost_of_action),
    draft_message: str(r.draft_message, 1400),
    jargon: Array.isArray(r.jargon)
      ? r.jargon
          .map((j) => ({ term: str((j as Record<string, unknown>)?.term, 40), meaning: str((j as Record<string, unknown>)?.meaning, 160) }))
          .filter((j) => j.term && j.meaning)
          .slice(0, 3)
      : [],
  };
  if (!d.is_notice) return d;
  if (!d.what_it_means || !d.next_action || !d.draft_message) return null;
  return d;
}
