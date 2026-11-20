// Sandbox data and the rule engine behind FirstBill's heads-up texts.
// All money math happens here, in code. Claude only writes words, never numbers we act on.
import type { Decode } from "../../../supabase/functions/_shared/firstbill-prompt";

export const DAY = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}
export function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
export function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const money = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/* ---------- The sandbox user ---------- */

export interface Loan {
  name: string;
  balance: number;
  rate: number; // percent
}

export interface Profile {
  firstName: string;
  servicer: string;
  accountLast4: string;
  loans: Loan[];
  graceEnds: Date;
  firstPull: Date; // autopay date of the first payment
  checkingLast4: string;
  balance: number;
  payday: Date;
  paycheck: number;
  upcoming: { label: string; amount: number; date: Date }[];
}

function nextWeekday(from: Date, weekday: number): Date {
  const d = startOfDay(from);
  const diff = (weekday - d.getDay() + 7) % 7;
  return addDays(d, diff === 0 ? 7 : diff);
}

function nextDayOfMonth(after: Date, dom: number): Date {
  const d = new Date(after.getFullYear(), after.getMonth(), dom);
  return d.getTime() > after.getTime() ? d : new Date(after.getFullYear(), after.getMonth() + 1, dom);
}

export const PAYDAY_DOM = 18;
export const NEW_DUE_DOM = 20;

export function makeProfile(today: Date, opts: { firstName?: string; balance?: number; payday?: number } = {}): Profile {
  const graceEnds = addDays(today, 12);
  const firstPull = nextWeekday(graceEnds, 5); // first Friday after grace ends
  const payDom = opts.payday ?? PAYDAY_DOM;
  let payday = nextDayOfMonth(firstPull, payDom);
  if (daysBetween(firstPull, payday) < 9) payday = nextDayOfMonth(addDays(payday, 1), payDom);
  return {
    firstName: opts.firstName?.trim() || "Tariq",
    servicer: "Meridian Loan Servicing",
    accountLast4: "4417",
    loans: [
      { name: "Direct Subsidized", balance: 9500, rate: 5.5 },
      { name: "Direct Unsubsidized", balance: 19100, rate: 5.5 },
    ],
    graceEnds,
    firstPull,
    checkingLast4: "6602",
    balance: opts.balance ?? 450.18,
    payday,
    paycheck: 1240,
    upcoming: [
      { label: "Phone bill", amount: 65, date: addDays(firstPull, 3) },
      { label: "Car insurance", amount: 98, date: addDays(firstPull, 7) },
    ],
  };
}

export const totalBalance = (p: Profile) => p.loans.reduce((s, l) => s + l.balance, 0);

/** 10-year standard payment, rounded to cents. */
export function standardPayment(p: Profile): number {
  const P = totalBalance(p);
  const r = p.loans[0].rate / 100 / 12;
  return Math.round(((P * r) / (1 - Math.pow(1 + r, -120))) * 100) / 100;
}

export const dailyInterest = (p: Profile) =>
  Math.round(p.loans.reduce((s, l) => s + (l.balance * l.rate) / 100 / 365, 0) * 100) / 100;

export interface TimelineRow {
  label: string;
  amount: number;
  date: Date;
  after: number;
}

export interface Alert {
  graceDays: number;
  payment: number;
  afterPull: number;
  rows: TimelineRow[];
  low: number;
  lowDate: Date;
  status: "overdraft" | "tight" | "ok";
  newDue: Date;
  daily: number;
}

export function computeAlert(p: Profile, today: Date): Alert {
  const payment = standardPayment(p);
  let bal = p.balance;
  const events = [
    { label: `First loan payment`, amount: -payment, date: p.firstPull },
    ...p.upcoming.map((u) => ({ label: u.label, amount: -u.amount, date: u.date })),
  ]
    .filter((e) => e.date < p.payday)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const rows: TimelineRow[] = [];
  let low = bal;
  let lowDate = today;
  for (const e of events) {
    bal = Math.round((bal + e.amount) * 100) / 100;
    rows.push({ ...e, after: bal });
    if (bal < low) {
      low = bal;
      lowDate = e.date;
    }
  }
  const status = low < 0 ? "overdraft" : low < 100 ? "tight" : "ok";
  const newDue = new Date(p.payday.getFullYear(), p.payday.getMonth(), NEW_DUE_DOM);
  return {
    graceDays: daysBetween(today, p.graceEnds),
    payment,
    afterPull: rows[0]?.after ?? p.balance - payment,
    rows,
    low,
    lowDate,
    status,
    newDue,
    daily: dailyInterest(p),
  };
}

export function dueDateDraft(p: Profile, a: Alert): string {
  return `Hi, this is ${p.firstName} [last name], account ending ${p.accountLast4}. My grace period ends ${fmtShort(p.graceEnds)} and my first payment of ${money(a.payment)} is set to pull on ${fmtShort(p.firstPull)}. I get paid on the ${ordinal(p.payday.getDate())}, so I'd like to change my monthly due date to the ${ordinal(NEW_DUE_DOM)}. Please tell me if this can apply to my first payment, and confirm the new due date and my autopay date in writing. Thank you.`;
}

/* ---------- Forwarded notice (second feature) ---------- */

export interface SampleNotice {
  servicer: string;
  title: string;
  noticeDate: Date;
  dueDate: Date;
  text: string;
}

export function makeSampleNotice(today: Date): SampleNotice {
  const noticeDate = addDays(today, -2);
  const dueDate = addDays(today, 14);
  return {
    servicer: "Meridian Loan Servicing",
    title: "Notice of Delinquency",
    noticeDate,
    dueDate,
    text: `MERIDIAN LOAN SERVICING
Notice of Delinquency
Notice date: ${fmtShort(noticeDate)}, ${noticeDate.getFullYear()}
Account ending 9083 · Direct Subsidized / Unsubsidized

Dear Borrower,
Our records indicate your account is 45 days delinquent. The total past due amount of $620.78 must be remitted to bring your account current. Your next scheduled installment of $310.39 is due ${fmtShort(dueDate)}, ${dueDate.getFullYear()}.

Delinquency of 90 days or more will be reported to the national consumer reporting agencies and may adversely affect your credit rating. Continued delinquency may result in default, at which point collection activity, including administrative wage garnishment and Treasury offset, may begin.

If you are experiencing financial hardship, you may be eligible for deferment, forbearance, or an alternative repayment plan, including the Repayment Assistance Plan (RAP).

Current principal: $28,600.00 · Interest rate: 5.50% fixed
Questions? Call 1-888-555-0142, Mon-Fri 8am-9pm ET.`,
  };
}

export function sampleDecode(n: SampleNotice): Decode {
  return {
    is_notice: true,
    servicer: "Meridian",
    loan_kind: "federal",
    what_it_means: "You've missed 2 payments on your federal student loans. You're 45 days behind, and it takes $620.78 to catch up.",
    amount_to_catch_up: 620.78,
    monthly_payment: 310.39,
    due_date: iso(n.dueDate),
    days_late: 45,
    next_action_short: "Ask for a 2-month forbearance",
    next_action: "Ask Meridian for a forbearance that covers the 2 missed months. That makes your account current and stops the credit clock.",
    cost_of_action: "About $262 in interest builds up over those 2 months ($131 a month). You still owe it later, but there's no fee and no credit hit.",
    draft_message:
      "Hi, this is [Your name], account ending 9083. My federal Direct Loans are 45 days past due ($620.78), and I can't pay the full amount right now. Please apply a forbearance to cover the past-due months and bring my account current, so the delinquency is not reported to the credit bureaus. Please confirm in writing when it's applied and tell me my next payment amount and due date. I'd also like to know if I qualify for the Repayment Assistance Plan (RAP). Thank you.",
    jargon: [
      { term: "Delinquent", meaning: "Behind on payments." },
      { term: "Forbearance", meaning: "A pause your servicer approves. It can cover months you missed." },
      { term: "Default", meaning: "270 days late. Then they can take tax refunds and part of your pay." },
    ],
  };
}

/** Rough local reader for pasted notices, used only when Claude is unavailable. */
export function heuristicDecode(text: string, today: Date): Decode {
  const t = text.replace(/\s+/g, " ");
  const known = ["Aidvantage", "MOHELA", "Nelnet", "EdFinancial", "CRI", "Sallie Mae", "SoFi", "Navient", "Earnest", "Discover", "College Ave", "Meridian"];
  const servicer = known.find((k) => new RegExp(k, "i").test(t)) ?? "your servicer";
  const federal = /direct (sub|unsub|loan|plus)|federal|department of education|studentaid|aidvantage|mohela|nelnet|edfinancial|\bcri\b|meridian/i.test(t);
  const privateL = /sallie mae|sofi|earnest|college ave|private (student )?loan|citizens|discover student/i.test(t);
  const loan_kind = federal ? "federal" : privateL ? "private" : /student loan/i.test(t) ? "unknown" : "other_bill";
  const amt = (re: RegExp) => {
    const m = t.match(re);
    return m ? Number(m[m.length - 1].replace(/,/g, "")) : null;
  };
  const pastDue = amt(/(?:past due|amount due|total (?:amount )?due|balance due)[^$]{0,40}\$\s?([\d,]+(?:\.\d{2})?)/i) ?? amt(/\$\s?([\d,]+\.\d{2})/);
  const lateM = t.match(/(\d{1,3})\s*days?\s*(?:past due|delinquent|late|overdue)/i);
  const days_late = lateM ? Number(lateM[1]) : null;
  const threshold = loan_kind === "federal" ? 90 : 30;
  const late = days_late && days_late > 0;
  const next_action = late
    ? loan_kind !== "federal"
      ? `Call ${servicer} today and ask for a hardship plan or a short payment pause. If you're past ${threshold} days, acting now keeps it from getting worse.`
      : `Ask ${servicer} for a forbearance that covers the missed months. That makes your account current and stops the credit clock.`
    : `Pay ${pastDue ? money(pastDue) : "the amount due"} before the due date, or ask ${servicer} to move your due date to right after payday.`;
  return {
    is_notice: true,
    servicer,
    loan_kind,
    what_it_means: late
      ? `You're ${days_late} days behind${pastDue ? ` and it takes ${money(pastDue)} to catch up` : ""}. ${loan_kind === "federal" ? "Federal loans get reported to credit bureaus at 90 days late." : "Most lenders can report a late payment at 30 days."}`
      : `This is a bill${pastDue ? ` for ${money(pastDue)}` : ""}. Nothing is late yet.`,
    amount_to_catch_up: pastDue,
    monthly_payment: null,
    due_date: null,
    days_late,
    next_action_short: late ? "Ask for a pause to catch up" : "Pay on time or move the date",
    next_action,
    cost_of_action: late
      ? "A pause has no fee and protects your credit, but interest keeps adding up while it's paused."
      : "Moving your due date is free. Paying late can cost a late fee and, after enough days, your credit.",
    draft_message: late
      ? `Hi, this is [Your name], account [account number]. I received your notice that my account is ${days_late} days past due${pastDue ? ` (${money(pastDue)})` : ""}. I can't pay the full amount right now. Please tell me my options to bring my account current without it being reported to the credit bureaus, such as a forbearance or hardship plan, and confirm in writing. Thank you.`
      : `Hi, this is [Your name], account [account number]. I get paid on the [day] of each month. Please change my monthly due date to [new day] so my payment lines up with my paycheck, and confirm in writing. Thank you.`,
    jargon: [],
  };
  void today;
}

export function looksLikeNotice(text: string): boolean {
  const t = text.trim();
  return t.length > 160 || (/\$\s?\d/.test(t) && /(due|past due|delinquen|balance|payment)/i.test(t) && t.length > 60);
}
