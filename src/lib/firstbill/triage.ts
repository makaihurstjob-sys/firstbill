/* "Pay This First" triage, from the SymStudio PRD (One-Tap Delinquency Shield Triage).
   Plain deterministic TypeScript, never the AI:
   Tier 1 survival (rent, food, utilities) -> Tier 2 credit cards and private loans (reported at 30 days late)
   -> other bills -> Tier 3 federal student loans (reported at 90 days late). */

export type BillKind = "rent" | "food" | "utility" | "card" | "private" | "other" | "federal";
export type TriageBill = { kind: BillKind; label: string; amount: number };
export type TriagePlan = {
  cash: number;
  reserve: number;
  pay: { bill: TriageBill; amount: number }[];
  partial: { bill: TriageBill; amount: number } | null;
  hold: TriageBill[];
  left: number;
  scriptFor: TriageBill | null;
};

const TIER: Record<BillKind, number> = { rent: 1, food: 1, utility: 1, card: 2, private: 2, other: 3, federal: 4 };
const FOOD_RESERVE = 50;

const n = (s: string) => Number(s.replace(/,/g, ""));
const usd = (x: number) => `$${(Math.round(x * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function classify(raw: string): TriageBill["kind"] | null {
  const s = raw.toLowerCase();
  if (/rent|housing|landlord|mortgage/.test(s)) return "rent";
  if (/food|grocer/.test(s)) return "food";
  if (/electric|power|water|gas bill|heat|utilit|light/.test(s)) return "utility";
  if (/private|sallie|sofi|discover loan|bank loan/.test(s)) return "private";
  if (/card|credit|visa|amex|mastercard|capital one|chase/.test(s)) return "card";
  if (/student|federal|loan|servicer|meridian|fafsa/.test(s)) return "federal";
  if (/phone|insurance|car|internet|wifi|gym|subscription|netflix|spotify|bill|medical|doctor|daycare|child/.test(s)) return "other";
  return null;
}

const NICE: Record<BillKind, string> = { rent: "rent", food: "groceries", utility: "electric", card: "card minimum", private: "private loan", other: "bill", federal: "student loan" };

/** Reads texts like "I have $180. Rent 550, card 40, loan 310, electric 60". Returns null if it isn't one. */
export function parseTriage(text: string): { cash: number; bills: TriageBill[] } | null {
  const t = text.replace(/\$/g, " ").replace(/\s+/g, " ");
  const cashM = t.match(/(?:have|got|left|cash|balance|checking|only)\D{0,14}?(\d[\d,]*(?:\.\d{1,2})?)/i);
  if (!cashM) return null;
  const cash = n(cashM[1]);
  const rest = t.slice((cashM.index ?? 0) + cashM[0].length);
  const bills: TriageBill[] = [];
  const re = /([a-z][a-z' ]{1,28}?)\s*(?:is|=|:|-|of|for)?\s*(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:for|on|to)?\s*(?:my\s|the\s)?([a-z][a-z' ]{1,20})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) && bills.length < 5) {
    const label = (m[1] ?? m[4] ?? "").trim().replace(/^(and|plus|my|the|a|then|also)\s+/i, "").replace(/\s+(is|due|bill)$/i, "");
    const amount = n(m[2] ?? m[3] ?? "0");
    const kind = classify(label);
    if (!kind || !amount) continue;
    const pretty = kind === "card" ? "card minimum" : kind === "federal" ? "student loan" : label.toLowerCase().split(" ").slice(-2).join(" ");
    bills.push({ kind, label: pretty || NICE[kind], amount });
  }
  return bills.length ? { cash, bills } : null;
}

export function triage(cash: number, bills: TriageBill[]): TriagePlan {
  const sorted = [...bills].sort((a, b) => TIER[a.kind] - TIER[b.kind] || a.amount - b.amount);
  const hasFood = bills.some((b) => b.kind === "food");
  const reserve = hasFood ? 0 : Math.min(FOOD_RESERVE, Math.max(0, cash));
  let left = cash - reserve;
  const pay: TriagePlan["pay"] = [];
  const skipped: TriageBill[] = [];
  for (const b of sorted) {
    if (b.kind === "federal") { skipped.push(b); continue; }
    if (b.amount <= left) { pay.push({ bill: b, amount: b.amount }); left -= b.amount; }
    else skipped.push(b);
  }
  // Leftover goes toward the most urgent survival bill we couldn't cover in full.
  let partial: TriagePlan["partial"] = null;
  const urgent = skipped.find((b) => TIER[b.kind] === 1);
  if (urgent && left >= 10) { partial = { bill: urgent, amount: Math.floor(left) }; left -= Math.floor(left); }
  const hold = skipped.filter((b) => b !== partial?.bill);
  const scriptFor = partial?.bill ?? hold.find((b) => b.kind !== "federal") ?? hold[0] ?? null;
  return { cash, reserve, pay, partial, hold, left: Math.round(left * 100) / 100, scriptFor };
}

/** The reply, as a few short texts. */
export function triageTexts(p: TriagePlan): string[] {
  const out: string[] = [];
  if (p.pay.length) out.push(`Do this today: pay ${p.pay.map((x) => `${x.bill.label} ${usd(x.amount)}`).join(" and ")}.`);
  else out.push("Do this today: don't pay a bill yet. Keep your cash for food and essentials.");
  const keep: string[] = [];
  if (p.reserve) keep.push(`Keep ${usd(p.reserve)} for food`);
  if (p.partial) keep.push(`put ${usd(p.partial.amount)} toward ${p.partial.bill.label} and ask for a payment plan`);
  if (keep.length) out.push(`${keep.join(". Then ")}.`);
  for (const h of p.hold) {
    if (h.kind === "federal") out.push(`Hold the ${usd(h.amount)} student loan. Federal loans don't hit your credit until 90 days late. Ask your servicer for a short forbearance or a later due date.`);
    else if (h.kind === "card" || h.kind === "private") out.push(`The ${usd(h.amount)} ${h.label} can wait a few days, but not 30. That's when it's reported.`);
    else out.push(`Push the ${usd(h.amount)} ${h.label} to payday and call them first.`);
  }
  out.push("Why: lights, food and housing first. Cards report at 30 days late, federal loans at 90.");
  if (p.scriptFor) out.push(`Reply YES and I'll write the message to your ${p.scriptFor.kind === "rent" ? "landlord" : p.scriptFor.kind === "federal" ? "loan servicer" : p.scriptFor.kind === "card" ? "card company" : p.scriptFor.label + " company"}.`);
  return out;
}

export function triageScript(p: TriagePlan, name: string, payday: string): { to: string; text: string } | null {
  const b = p.scriptFor;
  if (!b) return null;
  const who = name || "[your name]";
  if (b.kind === "rent")
    return { to: "Landlord", text: `Hi, this is ${who} in [unit]. I can pay ${usd(p.partial?.amount ?? 0)} toward rent today and the remaining ${usd(b.amount - (p.partial?.amount ?? 0))} by ${payday}. Can we set that up as a payment plan and waive the late fee? Thank you.` };
  if (b.kind === "federal")
    return { to: "Loan servicer", text: `Hi, this is ${who}. I can't make my ${usd(b.amount)} federal student loan payment this month. Can you move my due date to after my payday (${payday}) or put me in a short forbearance? Please confirm in writing. Thank you.` };
  if (b.kind === "card" || b.kind === "private")
    return { to: b.kind === "card" ? "Card company" : "Lender", text: `Hi, this is ${who}. I can't make my ${usd(b.amount)} payment by the due date. I can pay it on ${payday}. Can you move my due date or waive the late fee, and confirm it won't be reported late? Thank you.` };
  return { to: b.label, text: `Hi, this is ${who}. I can pay my ${usd(b.amount)} bill on ${payday}. Can you hold off any late fee or shutoff until then? Thank you.` };
}
