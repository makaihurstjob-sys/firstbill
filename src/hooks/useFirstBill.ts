import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatTurn, Decode } from "../../supabase/functions/_shared/firstbill-prompt";
import { aiDecode, aiReply, detectAiMode, type AiMode } from "@/lib/firstbill/ai";
import { parseTriage, triage, triageScript, triageTexts, type TriagePlan } from "@/lib/firstbill/triage";
import {
  addDays,
  computeAlert,
  daysBetween,
  dueDateDraft,
  fmtDate,
  fmtShort,
  fromISO,
  heuristicDecode,
  iso,
  looksLikeNotice,
  makeProfile,
  makeSampleNotice,
  money,
  ordinal,
  sampleDecode,
  totalBalance,
  boostMath,
  afterPayday,
  BOOST,
  type Alert,
  type Profile,
  type SampleNotice,
} from "@/lib/firstbill/data";

export type MsgBody =
  | { kind: "text"; from: "bot" | "me"; text: string }
  | { kind: "notice"; from: "me"; title: string; servicer: string; text: string }
  | { kind: "link"; from: "bot"; title: string; url: string; action?: "plaid" | "aid"; brand?: "firstbill" | "studentaid" | "plaid" }
  | { kind: "timeline"; from: "bot"; alert: Alert; profile: Profile }
  | { kind: "clock"; from: "bot"; daysLeft: number; lateToday: number; threshold: number; hitDate: string; federal: boolean }
  | { kind: "bank"; from: "bot"; amount: number; balance: number; last4: string; payday: string }
  | { kind: "draft"; from: "bot"; to: string; text: string }
  | { kind: "file"; from: "me"; name: string; size: string }
  | { kind: "divider"; text: string; lead?: string; sub?: string };
/** disc: the "This is not financial advice." text PayPing sends as its own message after every reply. */
type Out = MsgBody & { nfa?: boolean; disc?: boolean };
export const DISCLAIMER = "This is not financial advice.";
/** The disclaimer follows only replies that talk real money: dollar amounts, rates, interest, balances, payment plans. */
const MONEY_TALK = /\$\s?\d|\d\s?%|\binterest\b|payment plan|\bbalance\b|overdraft/i;
const talksMoney = (items: MsgBody[]) => items.some((m) => (m.kind === "text" || m.kind === "draft") && m.from === "bot" && MONEY_TALK.test(m.text));
export type Msg = Out & { id: string };

export type Chip = { label: string; onPick: () => void; primary?: boolean };
export type Banner = { title: string; body: string } | null;
export type Source = "claude" | "backup" | null;

type Stage = "start" | "stopped" | "followUp" | "remindAsk" | "wrapped" | "noBank" | "triageAsk" | "triageDone" | "askName" | "askPay" | "askLoans" | "askBank" | "joined" | "signedUp" | "alerted" | "covered" | "drafted" | "boost" | "boosted" | "noticeAsk" | "noticeDrafted";

let idSeq = 0;
const nid = () => `m${++idSeq}`;
/** The check-ins PayPing promised ("I'll check on Dec 1…"), each one actually sent later. */
type FuKey = "due" | "balance" | "triage" | "notice";
type DueState = "asked" | "confirmed" | "pending" | "declined" | null;
type Onboard = { firstName: string; payday: number; guess?: boolean; bankOffered?: boolean; bank?: boolean };
const EXAMPLE = "I have $180. Rent 550, card 40, loan 310, electric 60";
/** The whole conversation is saved in this browser, so leaving and coming back resumes it. Only Start over clears it. */
const SAVE_KEY = "payping-chat-v1";
type Saved = {
  v: 1;
  today: string;
  msgs: Msg[];
  stage: Stage;
  onboard: Onboard;
  plan: TriagePlan | null;
  decode: Decode | null;
  contactName: string;
  boostAmt: number;
  due: DueState;
  fu: FuKey | null;
  seq: number;
};
function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (s?.v !== 1 || !Array.isArray(s.msgs) || !s.msgs.length) return null;
    return s;
  } catch {
    return null;
  }
}
function clearSaved() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage blocked */
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GAP_DAYS = 2;
/** ?fast in the link: quicker texting, only for recording the promo video. */
const FAST = typeof location !== "undefined" && /[?&]fast\b/.test(location.search);
const signed = (n: number) => (n < 0 ? `-${money(-n)}` : money(n));
/** The checking breakdown as a plain text message, the way a real text would show it. */
function breakdown(p: Profile, a: Alert) {
  const lines = [`Your checking, next few weeks:`, `Today ${money(p.balance)}`];
  const short = (l: string) => l.replace(/first loan payment|student loan.*/i, "Loan").replace(/ bill$/i, "").replace(/car insurance/i, "Car ins.");
  const m0 = (n: number) => money(n).replace(".00", "");
  for (const r of a.rows) lines.push(`${fmtShort(r.date)} ${short(r.label)} ${m0(r.amount)} → ${signed(r.after)}${r.after < 0 ? " ⚠️" : ""}`);
  lines.push(`${fmtShort(p.payday)} Payday +${m0(p.paycheck)}`);
  return lines.join("\n");
}
const usd0 = (n: number) => money(n).replace(/\.00$/, "");
/** One short line per bill, each sent as its own text so it's easy to read. */
function breakdownLines(p: Profile, a: Alert) {
  const name = (l: string) => l.replace(/first loan payment|student loan.*/i, "Loan payment").replace(/ bill$/i, "");
  const m0 = (n: number) => money(n).replace(".00", "");
  return [
    ...a.rows.map((r) => `${fmtShort(r.date)} · ${name(r.label)} ${m0(r.amount)} → ${r.after < 0 ? `${signed(r.after)} ⚠️` : `${money(r.after)} left`}`),
    `${fmtShort(p.payday)} · Payday +${m0(p.paycheck)}`,
  ];
}
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface SignupInfo {
  firstName: string;
  paydayDom: number;
}

export function useFirstBill() {
  const saved = useRef<Saved | null | undefined>(undefined);
  if (saved.current === undefined) {
    saved.current = FAST ? null : loadSaved();
    if (saved.current) idSeq = Math.max(idSeq, saved.current.seq || 0, ...saved.current.msgs.map((m) => Number(String(m.id).replace(/\D/g, "")) || 0));
  }
  const sv = saved.current;
  const today = useMemo(() => (sv?.today ? new Date(sv.today) : new Date()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [msgs, setMsgs] = useState<Msg[]>(() => sv?.msgs ?? []);
  const [typing, setTyping] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latest = useRef<Record<string, (...args: any[]) => any>>({});
  const startChip: Chip = useMemo(() => ({ label: "JOIN", primary: true, onPick: () => void latest.current.join() }), []);
  const [chips, setChipsState] = useState<Chip[]>(sv ? [] : [startChip]);
  const chipsRef = useRef<Chip[]>(sv ? [] : [startChip]);
  const setChips = useCallback((c: Chip[]) => {
    chipsRef.current = c;
    setChipsState(c);
  }, []);
  const [banner, setBanner] = useState<Banner>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode | "checking">("checking");
  const [liveOn, setLiveOn] = useState(true);
  const [lastSource, setLastSource] = useState<Source>(null);
  const [balance, setBalance] = useState(450.18);
  const [busy, setBusy] = useState(false);
  const [autoplaying, setAutoplaying] = useState(false);
  const [contactName, setContactName] = useState(sv?.contactName ?? "34778");

  const run = useRef(0); // bumps on reset so stale sequences stop
  const stage = useRef<Stage>(sv?.stage ?? "start");
  const profile = useRef<Profile>(makeProfile(today, sv ? { firstName: sv.onboard.firstName || undefined, payday: sv.onboard.payday } : {}));
  const alert = useRef<Alert>(computeAlert(profile.current, today));
  if (sv && sv.msgs.some((m) => m.kind === "divider" && m.sub === `${GAP_DAYS} days later`)) {
    // The heads-up already happened, so keep its "N days from now" in step with what was said.
    alert.current = { ...alert.current, graceDays: daysBetween(addDays(today, GAP_DAYS), profile.current.graceEnds) };
  }
  const decode = useRef<Decode | null>(sv?.decode ?? null);
  const turns = useRef<ChatTurn[]>(
    sv ? sv.msgs.filter((m) => m.kind === "text").map((m) => ({ role: m.from === "me" ? "user" : "assistant", content: (m as { text: string }).text }) as ChatTurn) : [],
  );
  const skipLive = useRef<(() => void) | null>(null);
  const autoRef = useRef(false);
  const onboard = useRef<Onboard>(sv?.onboard ?? { firstName: "", payday: 18 });
  const decodeCtl = useRef<AbortController | null>(null);
  const boostAmt = useRef(sv?.boostAmt ?? BOOST);
  const plan = useRef<TriagePlan | null>(sv?.plan ?? null);
  const due = useRef<DueState>(sv?.due ?? null);
  const fu = useRef<FuKey | null>(sv?.fu ?? null);

  // Save after every change (not while recording with ?fast).
  useEffect(() => {
    if (FAST) return;
    try {
      if (!msgs.length) return void localStorage.removeItem(SAVE_KEY);
      const s: Saved = {
        v: 1,
        today: today.toISOString(),
        msgs,
        stage: stage.current,
        onboard: onboard.current,
        plan: plan.current,
        decode: decode.current,
        contactName,
        boostAmt: boostAmt.current,
        due: due.current,
        fu: fu.current,
        seq: idSeq,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {
      /* storage full or blocked: the chat still works, it just won't resume */
    }
  }, [msgs, chips, contactName, today]);

  useEffect(() => {
    let alive = true;
    detectAiMode().then((m) => alive && setAiMode(m));
    return () => {
      alive = false;
    };
  }, []);

  const useLive = aiMode !== "checking" && aiMode !== "none" && liveOn;

  const push = useCallback((m: Out | Out[]) => {
    const list = (Array.isArray(m) ? m : [m]).map((x) => ({ ...x, id: nid() }) as Msg);
    setMsgs((prev) => [...prev, ...list]);
    for (const x of list) {
      if (x.kind === "text" && !x.disc) turns.current.push({ role: x.from === "me" ? "user" : "assistant", content: x.text });
    }
  }, []);

  /** Bot "types" each item, then sends it. Returns false if a reset happened meanwhile. */
  const botSays = useCallback(
    async (items: MsgBody[], myRun: number) => {
      for (const item of items) {
        if (run.current !== myRun) return false;
        const len = item.kind === "text" ? item.text.length : 90;
        setTyping(true);
        await sleep(reduceMotion() ? 120 : FAST ? Math.min(1100, 380 + len * 4.5) : Math.min(2100, 720 + len * 9.5));
        if (run.current !== myRun) return false;
        setTyping(false);
        push(item);
        await sleep(reduceMotion() ? 40 : FAST ? 150 : 520);
      }
      if (run.current !== myRun) return false;
      const last = items[items.length - 1];
      if (last && last.kind !== "divider" && last.from === "bot" && talksMoney(items)) {
        // Replies about real numbers end with the disclaimer as its own short text.
        setTyping(true);
        await sleep(reduceMotion() ? 80 : FAST ? 300 : 600);
        if (run.current !== myRun) return false;
        setTyping(false);
        push({ kind: "text", from: "bot", text: DISCLAIMER, disc: true });
        await sleep(reduceMotion() ? 40 : FAST ? 120 : 300);
      }
      return run.current === myRun;
    },
    [push],
  );

  const recompute = useCallback(
    (info?: Partial<SignupInfo>, bal = balance) => {
      profile.current = makeProfile(today, {
        firstName: info?.firstName ?? profile.current.firstName,
        payday: info?.paydayDom ?? profile.current.payday.getDate(),
        balance: bal,
      });
      alert.current = computeAlert(profile.current, today);
    },
    [today, balance],
  );

  const reset = useCallback((opts?: { idle?: boolean }) => {
    run.current++;
    autoRef.current = false;
    setAutoplaying(false);
    decodeCtl.current?.abort();
    decodeCtl.current = null;
    stage.current = "start";
    decode.current = null;
    plan.current = null;
    due.current = null;
    fu.current = null;
    clearSaved();
    turns.current = [];
    skipLive.current = null;
    setMsgs([]);
    setTyping(false);
    setBanner(null);
    setSignupOpen(false);
    setPlaidOpen(false);
    onboard.current = { firstName: "", payday: 18 };
    setBusy(false);
    setLastSource(null);
    setContactName("34778");
    setChips(opts?.idle === false ? [] : [startChip]);
  }, [setChips, startChip]);

  /* ---------------- Scene 1: JOIN by text ---------------- */

  const join = useCallback(async (said = "JOIN") => {
    const myRun = run.current;
    setChips([]);
    if (turns.current.length === 0) push({ kind: "divider", lead: "Today", text: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) });
    push({ kind: "text", from: "me", text: said });
    stage.current = "askName";
    setContactName("PayPing");
    await botSays(
      [
        { kind: "text", from: "bot", text: "Hey! I'm PayPing. I text you before a bill goes wrong. Free, no app." },
        { kind: "text", from: "bot", text: "What should I call you?" },
      ],
      myRun,
    );
  }, [botSays, push]);

  /* ---------------- Setup, all inside the texts ---------------- */

  const answerName = useCallback(
    async (raw: string) => {
      const myRun = run.current;
      const word = (raw.trim().replace(/^(i'?m|im|it'?s|my name is|call me)\s+/i, "").match(/[A-Za-z\u00C0-\u024F'-]+/) || [""])[0].slice(0, 20);
      push({ kind: "text", from: "me", text: raw.trim() });
      if (!word) {
        await botSays([{ kind: "text", from: "bot", text: "Just your first name is fine." }], myRun);
        return;
      }
      const name = word.charAt(0).toUpperCase() + word.slice(1);
      onboard.current.firstName = name;
      stage.current = "askPay";
      const ok = await botSays([{ kind: "text", from: "bot", text: `Nice to meet you, ${name}. What day do you get paid?` }], myRun);
      if (!ok) return;
      setChips(chipsFor("askPay"));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [botSays, push, setChips],
  );

  const answerPay = useCallback(
    async (dom: number, said: string) => {
      const myRun = run.current;
      if (stage.current !== "askPay") return;
      setChips([]);
      push({ kind: "text", from: "me", text: said });
      onboard.current.payday = dom >= 1 && dom <= 28 ? dom : 18;
      onboard.current.guess = !dom;
      stage.current = "askLoans";
      const ok = await botSays(
        [
          { kind: "text", from: "bot", text: dom ? `Got it, the ${ordinal(onboard.current.payday)}.` : "No problem. If you link your bank in a minute, I can find it from your paychecks. Until then I'll guess the 18th." },
          { kind: "text", from: "bot", text: "Now your student loans. Grab your file here, then send it to me." },
          { kind: "link", from: "bot", title: "Download My Aid Data", url: "studentaid.gov", action: "aid", brand: "studentaid" },
        ],
        myRun,
      );
      if (!ok) return;
      setChips(chipsFor("askLoans"));
    },
    [botSays, push, setChips],
  );

  const whereAid = useCallback(async () => {
    const myRun = run.current;
    const keep = chipsRef.current;
    setChips([]);
    push({ kind: "text", from: "me", text: "Where do I find it?" });
    const ok = await botSays([{ kind: "text", from: "bot", text: "Log in at StudentAid.gov, open My Aid, then tap Download My Aid Data. It's a small text file. Tap + to send it." }], myRun);
    if (ok) setChips(keep.filter((c) => c.label !== "Where do I find it?"));
  }, [botSays, push, setChips]);

  const attachAid = useCallback(async () => {
    const myRun = run.current;
    if (stage.current !== "askLoans") return;
    setChips([]);
    push({ kind: "file", from: "me", name: "MyStudentData.txt", size: "6 KB" });
    stage.current = "askBank";
    recompute({ firstName: onboard.current.firstName || "there", paydayDom: onboard.current.payday });
    const p = profile.current;
    if (onboard.current.bank) {
      stage.current = "signedUp";
      const ok1 = await botSays(
        [
          { kind: "text", from: "bot", text: `Got it: ${p.loans.length} federal loans, ${money(totalBalance(p)).replace(".00", "")}, with ${p.servicer.split(" ")[0]}. Your grace period ends ${fmtShort(p.graceEnds)}.` },
          { kind: "text", from: "bot", text: `You're set, ${p.firstName}. I'll only text when something needs you.` },
        ],
        myRun,
      );
      if (!ok1) return;
      await sleep(reduceMotion() ? 200 : 1600);
      if (run.current !== myRun) return;
      await latest.current.headsUp();
      return;
    }
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: `Got it: ${p.loans.length} federal loans, ${money(totalBalance(p)).replace(".00", "")}, with ${p.servicer.split(" ")[0]}. Your grace period ends ${fmtShort(p.graceEnds)}.` },
        { kind: "text", from: "bot", text: "Last step: link your bank so I can warn you before an overdraft. Read-only." },
        { kind: "link", from: "bot", title: "Connect your bank with Plaid", url: "secure.plaid.com", action: "plaid", brand: "plaid" },
      ],
      myRun,
    );
    if (ok) setChips(chipsFor("askBank"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, push, recompute, setChips]);

  const [plaidOpen, setPlaidOpen] = useState(false);
  const openPlaid = useCallback(() => {
    if (stage.current === "askBank" || (stage.current === "askLoans" && onboard.current.bankOffered && !onboard.current.bank)) setPlaidOpen(true);
  }, []);

  const plaidDone = useCallback(async () => {
    const myRun = run.current;
    setPlaidOpen(false);
    if (stage.current === "askLoans" && !onboard.current.bank) {
      // Bank first, loans second: link it now, then ask for the aid file.
      onboard.current.bank = true;
      setChips([]);
      const ok0 = await botSays(
        [
          { kind: "text", from: "bot", text: `Connected: checking ••${profile.current.checkingLast4} at First Platypus Bank.` },
          ...(onboard.current.guess ? [{ kind: "text", from: "bot", text: `I can see your paychecks land on the ${ordinal(onboard.current.payday)}, so I'll use that.` } as MsgBody] : []),
          { kind: "text", from: "bot", text: "Now send me your aid file and you're all set." },
        ],
        myRun,
      );
      if (ok0) setChips(chipsFor("askLoans"));
      return false;
    }
    if (stage.current !== "askBank") return false;
    setChips([]);
    stage.current = "signedUp";
    const p = profile.current;
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: `Connected: checking ••${p.checkingLast4} at First Platypus Bank.` },
        ...(onboard.current.guess ? [{ kind: "text", from: "bot", text: `I can see your paychecks land on the ${ordinal(p.payday.getDate())}, so I'll use that.` } as MsgBody] : []),
        { kind: "text", from: "bot", text: `You're set, ${p.firstName}. I'll only text when something needs you.` },
      ],
      myRun,
    );
    if (!ok) return false;
    await sleep(reduceMotion() ? 200 : autoRef.current ? 1800 : 1600);
    if (run.current !== myRun) return false;
    await headsUp();
    return run.current === myRun;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, setChips]);

  /* ---------------- Scene 2: the heads-up text PayPing sends first ---------------- */

  const headsUp = useCallback(async () => {
    const myRun = run.current;
    const p = profile.current;
    setChips([]);
    setContactName("PayPing");
    // Realistic gap: the heads-up lands a couple of days after signup, not the second you finish.
    const later = addDays(today, GAP_DAYS);
    alert.current = { ...alert.current, graceDays: daysBetween(later, p.graceEnds) };
    push({ kind: "divider", lead: later.toLocaleDateString("en-US", { weekday: "long" }), text: "9:41 AM", sub: `${GAP_DAYS} days later` });
    stage.current = "alerted";
    const a = alert.current;
    const opener = `Heads up, ${p.firstName}: your student loan payments start soon. Your grace period ends ${fmtShort(p.graceEnds)}, ${a.graceDays} days from now.`;
    setBanner({ title: "PayPing", body: `${opener} Your first payment could overdraft you.` });
    await sleep(reduceMotion() ? 300 : 2300);
    if (run.current !== myRun) return;
    setBanner(null);
    const firstPullStr = fmtDate(p.firstPull);
    const items: MsgBody[] = [
      { kind: "text", from: "bot", text: opener },
      {
        kind: "text",
        from: "bot",
        text: `Your first loan payment is ${money(a.payment)}. ${p.servicer.split(" ")[0]} will auto-pull it from checking on ${firstPullStr}.`,
      },
      { kind: "text", from: "bot", text: `You have ${money(p.balance)} in checking today. Here's what's coming before payday:` },
      ...breakdownLines(p, a).map((t) => ({ kind: "text", from: "bot", text: t }) as MsgBody),
    ];
    if (a.status === "ok") {
      items.push({ kind: "text", from: "bot", text: `You're covered. Lowest point: ${money(a.low)}. I'll keep watching.` });
      const okCovered = await botSays(items, myRun);
      if (!okCovered) return;
      stage.current = "covered";
      setChips(chipsFor("covered"));
      return;
    }
    items.push(
      {
        kind: "text",
        from: "bot",
        text:
          a.status === "overdraft"
            ? `So on ${fmtShort(a.lowDate)} you'd be ${money(-a.low)} short. That could mean an overdraft fee, often $25 to $35.`
            : `You'd be down to ${money(a.low)} on ${fmtShort(a.lowDate)}. No cushion.`,
      },
      { kind: "text", from: "bot", text: `One idea: ask ${p.servicer.split(" ")[0]} to move your due date to the ${ordinal(a.newDue.getDate())}, ${daysBetween(p.payday, a.newDue)} days after payday. Same ${money(a.payment)} payment, $0 to change, no credit hit.` },
      { kind: "text", from: "bot", text: `Want me to write that request for you? You'd send it to ${p.servicer.split(" ")[0]} yourself.` },
    );
    const ok = await botSays(items, myRun);
    if (!ok) return;
    setChips(chipsFor("alerted"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, push]);

  const completeSignup = useCallback(
    async (info: SignupInfo): Promise<boolean> => {
      const myRun = run.current;
      if (stage.current !== "joined") return false;
      setSignupOpen(false);
      setChips([]);
      recompute(info);
      const p = profile.current;
      stage.current = "signedUp";
      push({ kind: "text", from: "me", text: "Done" });
      const ok = await botSays(
        [
          {
            kind: "text",
            from: "bot",
            text: `You're in, ${p.firstName}. I see ${p.loans.length} federal loans (${money(totalBalance(p)).replace(".00", "")}) and checking ••${p.checkingLast4}. Checking your next few weeks now.`,
          },
        ],
        myRun,
      );
      if (!ok) return false;
      await sleep(autoRef.current ? 1400 : 900);
      if (run.current !== myRun) return false;
      await headsUp();
      return run.current === myRun;
    },
    [botSays, headsUp, push, recompute, setChips],
  );

  /* ---------------- YES: draft the message the user sends ---------------- */

  const yes = useCallback(async () => {
    const myRun = run.current;
    if (!["alerted", "triageAsk", "noticeAsk"].includes(stage.current)) return;
    setChips([]);
    push({ kind: "text", from: "me", text: "YES" });
    if (stage.current === "triageAsk" && plan.current) {
      const s = triageScript(plan.current, onboard.current.firstName, `the ${ordinal(onboard.current.payday || 18)}`);
      stage.current = "triageDone";
      if (!s) {
        const ok0 = await botSays([{ kind: "text", from: "bot", text: "There's nothing to send this time. Your plan already covers it." }], myRun);
        if (ok0) setChips(chipsFor("triageDone"));
        return;
      }
      const ok = await botSays(
        [
          { kind: "text", from: "bot", text: `Here's a message for your ${s.to.toLowerCase()}. Tap it to copy, then send it yourself.` },
          { kind: "draft", from: "bot", to: s.to, text: s.text },
          { kind: "text", from: "bot", text: "I'll check in tomorrow to see how it went." },
        ],
        myRun,
      );
      if (!ok) return;
      await sleep(reduceMotion() ? 300 : 2200);
      if (run.current !== myRun) return;
      await latest.current.followUp("triage");
      return;
    }
    if (stage.current === "noticeAsk" && decode.current) {
      const d = decode.current;
      stage.current = "noticeDrafted";
      const ok = await botSays(
        [
          { kind: "text", from: "bot", text: `Here's your message. Send it through ${d.servicer}'s secure messages or read it on a call. Ask them to confirm in writing.` },
          { kind: "draft", from: "bot", to: d.servicer, text: d.draft_message },
          { kind: "text", from: "bot", text: "I'll text you in 3 days to check they answered. You don't have to remember any of this." },
        ],
        myRun,
      );
      if (!ok) return;
      await sleep(reduceMotion() ? 300 : 2200);
      if (run.current !== myRun) return;
      await latest.current.followUp("notice");
      return;
    }
    const p = profile.current;
    const a = alert.current;
    stage.current = "drafted";
    due.current = "asked";
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: `Here it is. Tap to copy, then paste it in ${p.servicer.split(" ")[0]}'s messages or read it on a call.` },
        { kind: "draft", from: "bot", to: p.servicer, text: dueDateDraft(p, a) },
        { kind: "text", from: "bot", text: `I'll check on ${fmtShort(addDays(p.firstPull, -3))} that they said yes.` },
      ],
      myRun,
    );
    if (!ok) return;
    await sleep(reduceMotion() ? 300 : 2200);
    if (run.current !== myRun) return;
    await latest.current.followUp("due");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, push, reset]);

  /* ---------------- Payday: a proactive "pay it off sooner" nudge ---------------- */

  const paydayBoost = useCallback(async () => {
    const myRun = run.current;
    if (stage.current !== "drafted" && stage.current !== "followUp") return;
    fu.current = null;
    const p = profile.current;
    const a = alert.current;
    setChips([]);
    stage.current = "boost";
    push({ kind: "divider", text: `${fmtShort(p.payday)} · Payday`, sub: "PayPing texts first" });
    const b = boostMath(p, a.payment, BOOST);
    const b50 = boostMath(p, a.payment, 50);
    const left = afterPayday(p, a.payment);
    const opener = `Your paycheck landed. Want to pay your loan off sooner?`;
    setBanner({ title: "PayPing", body: opener });
    await sleep(reduceMotion() ? 300 : 1800);
    if (run.current !== myRun) return;
    setBanner(null);
    const ok = await botSays(
      [
        ...((due.current === "confirmed"
          ? [
              { kind: "text", from: "bot", text: `I see your paycheck landed: +${money(p.paycheck).replace(".00", "")}. Checking is at ${money(left + a.payment)} now.` },
              { kind: "text", from: "bot", text: `After your ${money(a.payment)} loan payment on the ${ordinal(a.newDue.getDate())}, you'd still have ${money(left)} until next payday.` },
            ]
          : [
              { kind: "text", from: "bot", text: `I see your paycheck landed: +${money(p.paycheck).replace(".00", "")}. After this month's bills and your ${fmtShort(p.firstPull)} loan payment, checking is at ${money(left)}.` },
            ]) as MsgBody[]),
        { kind: "text", from: "bot", text: `Want to put ${money(BOOST).replace(".00", "")} extra toward your loan each month? At ${p.loans[0].rate}%, that saves about ${money(b.saved).replace(/\.\d\d$/, "")} in interest and you'd be done ${b.sooner} months sooner.` },
        { kind: "text", from: "bot", text: `$50 a month would save about ${money(b50.saved).replace(/\.\d\d$/, "")} and finish ${b50.sooner} months sooner. Which feels doable?` },
      ],
      myRun,
    );
    if (!ok) return;
    setChips(chipsFor("boost"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, push]);

  /** A round number that covers the shortfall, e.g. $23.21 short → keep $30 extra. */
  const cushion = () => Math.max(10, Math.ceil(-Math.min(alert.current.low, 0) / 10) * 10);

  const endChips = useCallback(
    (): Chip[] => [
      { label: "Short on cash? Try Pay This First", onPick: () => void latest.current.send("I have $180. Rent 550, card 40, loan 310, electric 60") },
      { label: "Forward a loan letter", onPick: () => void latest.current.forwardNotice() },
      { label: "Start over", onPick: () => void latest.current.reset() },
    ],
    [],
  );

  const boostYes = useCallback(async (amt: number = BOOST, said?: string) => {
    const myRun = run.current;
    if (stage.current !== "boost") return;
    stage.current = "remindAsk";
    boostAmt.current = amt;
    setChips([]);
    push({ kind: "text", from: "me", text: said ?? `$${amt} a month` });
    const p = profile.current;
    const b = boostMath(p, alert.current.payment, amt);
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: `Nice choice. $${amt} extra a month saves about ${money(b.saved).replace(/\.\d\d$/, "")} and you'd be done ${b.sooner} months sooner.` },
        { kind: "text", from: "bot", text: `Want me to remind you each payday? I'll only ask when your bank can spare it.` },
      ],
      myRun,
    );
    if (ok) setChips(chipsFor("remindAsk"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, push, setChips]);

  const remind = useCallback(async (on: boolean, said: string) => {
    const myRun = run.current;
    if (stage.current !== "remindAsk") return;
    stage.current = "wrapped";
    setChips([]);
    push({ kind: "text", from: "me", text: said });
    const p = profile.current;
    const next = new Date(p.payday);
    next.setMonth(next.getMonth() + 1);
    const ok = await botSays(
      on
        ? [
            { kind: "text", from: "bot", text: `Done. I'll text you next payday, ${fmtShort(next)}, before you spend it.` },
            { kind: "text", from: "bot", text: `Tip: when you pay extra, tell ${p.servicer.split(" ")[0]} it goes to principal so it cuts your balance, not next month's bill.` },
          ]
        : [{ kind: "text", from: "bot", text: `No problem. You can still send extra anytime. I'll keep watching your bills either way.` }],
      myRun,
    );
    if (ok) setChips(endChips());
  }, [botSays, push, setChips, endChips]);

  const boostNo = useCallback(async (said = "Not now") => {
    const myRun = run.current;
    if (stage.current !== "boost") return;
    stage.current = "boosted";
    setChips([]);
    push({ kind: "text", from: "me", text: said });
    stage.current = "wrapped";
    const ok = await botSays([{ kind: "text", from: "bot", text: "No problem. I'll ask again next payday, only if your bank can spare it." }], myRun);
    if (ok) setChips(endChips());
  }, [botSays, push]);

  /* ---------------- Scene 3: a forwarded notice, decoded by Claude ---------------- */

  const runDecode = useCallback(
    async (text: string, sample: SampleNotice | null) => {
      const myRun = run.current;
      setBusy(true);
      setChips([]);
      setTyping(true);
      let d: Decode | null = null;
      let source: Source = "backup";
      if (useLive) {
        const ctl = new AbortController();
        decodeCtl.current = ctl;
        let skipped = false;
        const slow = setTimeout(() => {
          if (run.current !== myRun) return;
          setChips([
            {
              label: "Taking a while? Use the instant answer",
              onPick: () => {
                skipped = true;
                ctl.abort();
              },
            },
          ]);
        }, 6000);
        d = await aiDecode(aiMode as AiMode, text, iso(today), ctl.signal);
        clearTimeout(slow);
        if (decodeCtl.current === ctl) decodeCtl.current = null;
        if (run.current !== myRun) return;
        setChips([]);
        if (skipped) d = null;
        if (d) source = "claude";
      }
      if (run.current !== myRun) return;
      if (!d) d = sample ? sampleDecode(sample) : heuristicDecode(text, today);
      setLastSource(source);
      setTyping(false);
      setBusy(false);
      decode.current = d;

      if (!d.is_notice) {
        await botSays([{ kind: "text", from: "bot", text: "That doesn't look like a bill or loan notice. Forward me the letter, email or text from your servicer and I'll decode it." }], myRun);
        return;
      }

      const items: MsgBody[] = [
        { kind: "text", from: "bot", text: "Got it. Here's the short version." },
        { kind: "text", from: "bot", text: d.what_it_means },
      ];
      const federal = d.loan_kind === "federal";
      const threshold = federal ? 90 : 30;
      if (d.days_late && d.days_late > 0) {
        const since = sample ? daysBetween(sample.noticeDate, today) : 0;
        const lateToday = d.days_late + since;
        const daysLeft = threshold - lateToday;
        items.push({
          kind: "text",
          from: "bot",
          text:
            daysLeft <= 0
              ? `Credit clock: you're ${lateToday} days late. Past ${threshold}, so this can already show on your credit report. Acting now still stops it getting worse.`
              : `Credit clock: you're ${lateToday} days late. ${federal ? "Federal loans" : "Most lenders"} report at ${threshold}. For you that's ${fmtShort(addDays(today, daysLeft))}, ${daysLeft} days from now.`,
        });
      } else if (d.due_date) {
        const dd = fromISO(d.due_date);
        items.push({ kind: "text", from: "bot", text: `It's due ${fmtDate(dd)}, ${daysBetween(today, dd)} days from now.` });
      }
      const amt = d.amount_to_catch_up ?? d.monthly_payment;
      const p = profile.current;
      if (amt)
        items.push({
          kind: "text",
          from: "bot",
          text:
            amt > p.balance
              ? `Bank check: paying all ${money(amt)} today would overdraft checking ••${p.checkingLast4} by ${money(amt - p.balance)} before your ${fmtShort(p.payday)} paycheck. Don't pay it all right now.`
              : `Bank check: you can cover ${money(amt)} and still have ${money(p.balance - amt)} until ${fmtShort(p.payday)}.`,
        });
      items.push(
        { kind: "text", from: "bot", text: `Best next step: ${d.next_action}` },
        { kind: "text", from: "bot", text: `What it costs: ${d.cost_of_action}` },
        { kind: "text", from: "bot", text: "Reply YES and I'll write the message for you to send. I never log in or touch your account." },
      );
      stage.current = "noticeAsk";
      const ok = await botSays(items, myRun);
      if (!ok) return;
      setChips(chipsFor("noticeAsk"));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aiMode, botSays, today, useLive, yes],
  );

  const forwardNotice = useCallback(async () => {
    reset({ idle: false });
    await sleep(60);
    const myRun = run.current;
    const n = makeSampleNotice(today);
    setContactName("PayPing");
    push([
      { kind: "divider", text: "Example 2", sub: "A grad who's already behind forwards a letter" },
      { kind: "notice", from: "me", title: n.title, servicer: n.servicer, text: n.text },
    ]);
    await sleep(reduceMotion() ? 50 : 650);
    if (run.current !== myRun) return;
    push({ kind: "text", from: "me", text: "got this letter. what does it even mean??" });
    await runDecode(n.text, n);
  }, [push, reset, runDecode, today]);

  const pasteNotice = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      setContactName("PayPing");
      push({ kind: "notice", from: "me", title: "Forwarded notice", servicer: "Pasted text", text: t });
      await runDecode(t, null);
    },
    [push, runDecode],
  );

  /* ---------------- Free-text questions ---------------- */

  const contextText = useCallback(() => {
    const p = profile.current;
    const a = alert.current;
    const d = decode.current;
    if (d && (stage.current === "noticeAsk" || stage.current === "noticeDrafted")) {
      return `They forwarded a ${d.loan_kind} loan notice from ${d.servicer}. Decoded: ${d.what_it_means} Amount to catch up: ${d.amount_to_catch_up ?? "unknown"}. Days late: ${d.days_late ?? "unknown"}. Suggested action: ${d.next_action} Cost: ${d.cost_of_action}. Checking balance ${money(p.balance)}, payday ${fmtShort(p.payday)}.`;
    }
    const pl = plan.current;
    if (pl && (stage.current === "triageAsk" || stage.current === "triageDone")) {
      return `They texted their cash and bills. Cash ${money(pl.cash)}. Plan: pay ${pl.pay.map((x) => `${x.bill.label} ${money(x.amount)}`).join(", ") || "nothing yet"}; keep ${money(pl.reserve)} for food; ${pl.partial ? `${money(pl.partial.amount)} toward ${pl.partial.bill.label} (still owes ${money(pl.partial.bill.amount - pl.partial.amount)})` : ""}; waiting: ${pl.hold.map((h) => `${h.label} ${money(h.amount)}`).join(", ") || "none"}. Left over after the plan: ${money(pl.left)}. Payday the ${ordinal(onboard.current.payday || 18)}.`;
    }
    return `${p.firstName}, new grad. ${p.loans.length} federal Direct loans, ${money(totalBalance(p))} at ${p.loans[0].rate}% with ${p.servicer}. Grace period ends ${fmtShort(p.graceEnds)} (${a.graceDays} days). First payment ${money(a.payment)} autopays ${fmtShort(p.firstPull)}. Checking ${money(p.balance)}; after the payment ${money(a.afterPull)}; bills before payday: ${p.upcoming.map((u) => `${u.label} ${money(u.amount)} on ${fmtShort(u.date)}`).join(", ")}; lowest point ${money(a.low)} on ${fmtShort(a.lowDate)}. Payday ${fmtShort(p.payday)} (${money(p.paycheck)}). Suggested fix: move due date to the ${ordinal(a.newDue.getDate())}; no fee; interest about ${money(a.daily)} a day either way.`;
  }, []);

  const cannedAnswer = useCallback((q: string): string => {
    const a = alert.current;
    const p = profile.current;
    const s = q.toLowerCase();
    if (/why not|just pay|pay it/.test(s))
      return a.status === "overdraft"
        ? `You can! But your ${p.upcoming.map((u) => u.label.toLowerCase()).join(" and ")} hit before payday, so you'd go ${money(-a.low)} below zero and could get an overdraft fee or a bounced payment. Moving the date costs nothing.`
        : `You can, and you'd be fine. You'd still have ${money(a.low)} before payday.`;
    if (/^(hi|hey|hello|yo|sup)\b/.test(s)) return "Hey! I'm PayPing. I watch your student loans and bills so nothing surprises you.";
    if (/thank|thx|ty\b/.test(s)) return "Anytime.";
    if (/capitaliz/.test(s)) return "Capitalization is when unpaid interest gets added to your loan balance. Then you pay interest on that interest. Paying the interest before it happens avoids it.";
    if (/defer/.test(s)) return "Deferment and forbearance both pause payments. In a deferment, the government may cover interest on subsidized loans. In a forbearance, interest always keeps adding up.";
    if (/(cost|price|fee|free|pay for)/.test(s) && /(you|firstbill|this)/.test(s)) return "PayPing is free. No fees, no ads, no credit offers, and we never sell your data.";
    if (/(human|real person|robot|\bbot\b|\bai\b|chatgpt)/.test(s)) return "I'm an automated assistant. Code does all the money math. AI only helps explain things in plain English. You approve everything.";
    if (/plaid|bank|read.?only|move (my )?money|login|password/.test(s)) return "Your bank link is read-only through Plaid. I can see balances and bills, never move money, and I never see your password. You can also skip it and just text me your numbers.";
    if (/what is this|what'?s this|what is firstbill|who are you|what do you do/.test(s)) return "I'm PayPing. I text you before a student loan bill or an overdraft hits, and suggest one fix with its cost. Free, no app. I never move money.";
    if (/joke|lol|lmao|haha|funny/.test(s)) return "😄 I'm better at bills than jokes.";
    if (/grace/.test(s)) return "A grace period is the 6 months after you leave school before payments start. Interest on your unsubsidized loans still adds up during it.";
    if (/forbear/.test(s)) return "A forbearance is a pause your servicer approves. It can cover months you already missed, so your account counts as caught up. Interest still adds up, so save it for emergencies.";
    if (/option|else/.test(s))
      return "Other options: pay one $310.39 payment after payday. That gets you about a month less behind, but you're still behind. If you lost your job or hours, ask about a deferment. RAP can lower future bills. If you can't pay the full amount, a forbearance is the fastest way to get fully caught up.";
    if (/rap|lower|income|plan/.test(s)) return "On RAP your payment is based on your income, often about $75 to $100 a month at $30k to $40k a year. Applying is free at StudentAid.gov. Never pay a company to do it.";
    if (/scam|safe|trust|data|sell/.test(s)) return "I can't log in or move money, and I never sell your data. Your bank link is read-only, and you send every message yourself.";
    if (/^stop\b/.test(s)) return "You're unsubscribed. Text JOIN anytime to come back.";
    const term = decode.current?.jargon.find((j) => s.includes(j.term.toLowerCase()));
    if (term) return `${term.term}: ${term.meaning}`;
    if (/delinquen/.test(s)) return "Delinquent just means behind on payments. It turns into a credit problem at 90 days late for federal loans.";
    if (/default/.test(s)) return "Default is 270 days late on a federal loan. Your whole balance can come due, and the government can take your tax refund and up to 15% of your take-home pay. Those collections are paused right now but can restart, so we fix things way before then.";
    return "I'm not sure I can answer that. Please ask a different question.";
  }, []);

  const ask = useCallback(
    async (q: string) => {
      const myRun = run.current;
      const prevChips = chipsRef.current;
      setChips([]);
      push({ kind: "text", from: "me", text: q });
      setTyping(true);
      let answer: string | null = null;
      if (useLive) answer = await aiReply(aiMode as AiMode, contextText(), turns.current.slice());
      if (run.current !== myRun) return;
      setLastSource(answer ? "claude" : "backup");
      if (!answer) {
        await sleep(reduceMotion() ? 100 : 700);
        if (run.current !== myRun) return;
        answer = cannedAnswer(q);
      }
      setTyping(false);
      const nd0 = ["start", "askName", "askPay", "askLoans", "askBank", "noBank"].includes(stage.current) ? latest.current.nudge?.() : null;
      const nd = nd0 && !answer.includes(nd0) ? nd0 : null;
      push({ kind: "text", from: "bot", text: answer });
      if (nd) {
        await sleep(reduceMotion() ? 60 : 500);
        if (run.current !== myRun) return;
        push({ kind: "text", from: "bot", text: nd });
      }
      if (MONEY_TALK.test(answer) || (nd && MONEY_TALK.test(nd))) {
        await sleep(reduceMotion() ? 60 : 450);
        if (run.current !== myRun) return;
        push({ kind: "text", from: "bot", text: DISCLAIMER, disc: true });
      }
      if (/^stop\b/i.test(q)) {
        setChips([{ label: "JOIN", primary: true, onPick: () => { latest.current.reset(); void latest.current.join(); } }]);
        return;
      }
      const left = prevChips.filter((c) => c.label !== q);
      setChips(left.length ? left : prevChips);
    },
    [aiMode, cannedAnswer, contextText, push, setChips, useLive],
  );

  /* ---------------- Pay This First: text your cash and bills, no bank link (SymStudio PRD) ---------------- */

  const runTriage = useCallback(
    async (text: string, parsed: NonNullable<ReturnType<typeof parseTriage>>) => {
      const myRun = run.current;
      setChips([]);
      setContactName("PayPing");
      push({ kind: "text", from: "me", text });
      const pl = triage(parsed.cash, parsed.bills);
      plan.current = pl;
      stage.current = "triageAsk";
      const ok = await botSays(triageTexts(pl).map((t) => ({ kind: "text", from: "bot", text: t }) as MsgBody), myRun);
      if (!ok) return;
      setChips(chipsFor("triageAsk"));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [botSays, push, setChips],
  );

  const skipBank = useCallback(async () => {
    const myRun = run.current;
    if (stage.current !== "askBank") return;
    setChips([]);
    push({ kind: "text", from: "me", text: "Skip, I'll text my numbers" });
    stage.current = "noBank";
    await botSays(
      [
        { kind: "text", from: "bot", text: "No problem. No bank link needed. Nothing is stored." },
        ...(onboard.current.guess ? [{ kind: "text", from: "bot", text: "I'll keep guessing payday is the 18th. Text me the real day anytime." } as MsgBody] : []),
        { kind: "text", from: "bot", text: "When money's tight, text me your cash and bills, like:\nI have $180. Rent 550, card 40, loan 310, electric 60" },
      ],
      myRun,
    );
    if (run.current === myRun) setChips(chipsFor("noBank"));
  }, [botSays, push, setChips]);

  /** "Can I afford it?" from the numbers we have: their Pay This First plan, or their linked checking. */
  const afford = useCallback((x: number, said: string): string[] => {
    const money = (n: number) => usd0(n);
    const STOP = /^(a|an|the|it|this|that|some|new|me|my)$/i;
    const after = said.match(/\d[\d,.]*\s*(?:dollars?|bucks)?\s+(?:on |for )?(?:a |an |some |new |the )?([a-z][a-z' ]{2,20}?)\s*(?:\?|\.|!|$|right now|today|this week)/i)?.[1]?.trim();
    const before = said.match(/(?:afford|buy|get|spend on)\s+(?:a |an |some |new |the )*([a-z][a-z' ]{1,24}?)(?:\s+for|\s+at|\s*\$|\s*\d|\?|$)/i)?.[1]?.trim();
    const what = [before, after].find((w) => w && !STOP.test(w) && !/dollars?|bucks/i.test(w)) ?? "that";
    const payday = `the ${ordinal(onboard.current.payday || profile.current.payday.getDate())}`;
    const pl = plan.current;
    if (pl) {
      const owed = (pl.partial ? pl.partial.bill.amount - pl.partial.amount : 0) + pl.hold.reduce((t, h) => t + h.amount, 0);
      if (x <= pl.left) return [`Yes. After your plan you'd still have ${money(pl.left)}, so ${money(x)} on ${what} leaves ${money(pl.left - x)}.`];
      const from = pl.reserve ? `your ${money(pl.reserve)} food money` : "money for your bills";
      return [
        `I'd wait on ${what}. After your plan you have ${money(pl.left)} left${owed ? `, and you still owe ${money(owed)}${pl.partial ? ` (${pl.partial.bill.label} included)` : ""}` : ""}.`,
        `${money(x)} would have to come out of ${from}.`,
        `Can it wait until payday on ${payday}? I can remind you then.`,
      ];
    }
    const signedUp = !["start", "stopped", "askName", "askPay", "askLoans", "askBank", "noBank"].includes(stage.current);
    if (signedUp) {
      const a = alert.current;
      const low = a.low - x;
      if (a.low < 0) return [`I'd wait on ${what}. You're already on track to be ${money(-a.low)} short on ${fmtShort(a.lowDate)}.`, `${money(x)} more makes it ${money(-low)} short. After payday on ${fmtShort(profile.current.payday)} you'd be fine.`];
      if (low >= 50) return [`Yes. Even after ${money(x)}, your lowest point before payday is ${money(low)}.`];
      return [`It's tight. ${money(x)} would leave you ${money(low)} at your lowest before payday on ${fmtShort(profile.current.payday)}.`, "Could it wait a few days?"];
    }
    return [`Happy to check. Text me your cash and bills, like: I have $180. Rent 550, card 40. Then ask again about the ${money(x)}.`];
  }, []);

  /** What to say to bring someone back to the step they're on. */
  const nudge = useCallback((): string | null => {
    switch (stage.current) {
      case "start":
      case "stopped":
        return "Text JOIN to get started.";
      case "askName":
        return "What should I call you?";
      case "askPay":
        return "What day do you get paid? Just the day, like 15.";
      case "askLoans":
        return "Tap + to send me your aid file.";
      case "askBank":
        return "Tap Connect your bank when you're ready, or skip it.";
      case "alerted":
        return "Reply YES and I'll write the due date request.";
      case "boost":
        return `Reply YES to add ${money(BOOST).replace(".00", "")} a month, 50 for $50, or Not now.`;
      case "remindAsk":
        return "Reply YES and I'll remind you each payday, or NO.";
      case "followUp":
        return fu.current && fu.current !== "balance" ? "Reply YES or NO." : null;
      case "noticeAsk":
      case "triageAsk":
        return "Reply YES and I'll write the message for you.";
      case "noBank":
        return "Text me your cash and bills, like: I have $180. Rent 550, card 40.";
      default:
        return null;
    }
  }, []);

  /** A fixed reply (no AI), then the step's nudge, keeping the quick replies. */
  const reply = useCallback(
    async (me: string, lines: string[]) => {
      const myRun = run.current;
      const keep = chipsRef.current;
      setChips([]);
      push({ kind: "text", from: "me", text: me });
      const ok = await botSays(lines.map((t) => ({ kind: "text", from: "bot", text: t }) as MsgBody), myRun);
      if (ok) setChips(keep);
    },
    [botSays, push, setChips],
  );

  const stopAll = useCallback(
    async (me: string) => {
      const myRun = run.current;
      setChips([]);
      push({ kind: "text", from: "me", text: me });
      stage.current = "start";
      onboard.current = { firstName: "", payday: 18 };
      const ok = await botSays([{ kind: "text", from: "bot", text: "You're unsubscribed from PayPing. No more texts. Text JOIN anytime to come back." }], myRun);
      if (ok) setChips([startChip]);
    },
    [botSays, push, setChips, startChip],
  );

  /** "No" to the due-date fix: say what to watch instead, then keep the story moving to payday. */
  const declineFix = useCallback(
    async (said: string) => {
      const myRun = run.current;
      if (stage.current !== "alerted") return;
      stage.current = "drafted";
      setChips([]);
      push({ kind: "text", from: "me", text: said });
      const a = alert.current;
      const ok = await botSays(
        [
          { kind: "text", from: "bot", text: `No problem. Then try to have ${usd0(cushion())} extra in checking before ${fmtShort(a.lowDate)} so the car insurance doesn't overdraft you.` },
          { kind: "text", from: "bot", text: `I'll check your balance again on ${fmtShort(addDays(a.lowDate, -2))}.` },
        ],
        myRun,
      );
      if (!ok) return;
      due.current = "declined";
      await sleep(reduceMotion() ? 300 : 2200);
      if (run.current !== myRun) return;
      await latest.current.followUp("balance");
    },
    [botSays, push, setChips],
  );

  /** What PayPing says when it checks back in, and the answers it understands. */
  const fuSpec = useCallback((key: FuKey) => {
    const p = profile.current;
    const a = alert.current;
    const S = p.servicer.split(" ")[0];
    const name = onboard.current.firstName;
    const day = (d: Date) => `${d.toLocaleDateString("en-US", { weekday: "long" })}, ${fmtShort(d)}`;
    type Opt = { label: string; primary?: boolean; test: (t: string, y: boolean, n: boolean) => boolean; replies: string[]; apply?: () => void };
    const neg = /\b(no|not|nope|nah|haven'?t|didn'?t|never|denied|declined|refused)\b|n'?t\b/i;
    const yesOpt = (replies: string[], apply?: () => void): Opt => ({ label: "YES", primary: true, test: (t, y) => y || (/\b(yes|yeah|yep|they did|confirmed?|approved|said yes|it worked|all set)\b/i.test(t) && !neg.test(t)), replies, apply });
    const noOpt = (replies: string[], apply?: () => void): Opt => ({ label: "NO", test: (t, _y, n) => n || neg.test(t) || /not yet|no (reply|answer|word)|still waiting|said no/i.test(t), replies, apply });
    if (key === "due") {
      const d = addDays(p.firstPull, -3);
      return {
        lead: day(d),
        time: "10:02 AM",
        sub: "PayPing checks in",
        texts: [`Hi ${name || "there"}, checking in like I said. Did ${S} confirm your new due date, the ${ordinal(a.newDue.getDate())}?`, "Reply YES or NO."],
        options: [
          yesOpt(
            [`Nice! Your ${money(a.payment)} now comes out on the ${ordinal(a.newDue.getDate())}, ${daysBetween(p.payday, a.newDue)} days after payday. No overdraft on ${fmtShort(a.lowDate)}.`, "I'll text you on payday."],
            () => (due.current = "confirmed"),
          ),
          noOpt(
            [`OK. Until they confirm, your ${money(a.payment)} still comes out ${fmtDate(p.firstPull)}.`, `To be safe, keep ${usd0(cushion())} extra in checking before ${fmtShort(a.lowDate)} so your car insurance clears. Calling ${S} works too. It takes about 5 minutes.`],
            () => (due.current = "pending"),
          ),
        ],
      };
    }
    if (key === "balance") {
      const d = addDays(a.lowDate, -2);
      const bal = a.rows.filter((r) => r.date.getTime() <= d.getTime()).pop()?.after ?? p.balance;
      return {
        lead: day(d),
        time: "8:15 AM",
        sub: "PayPing checks in",
        texts: [
          `Balance check, like I said: you have ${money(bal)} in checking.`,
          a.low < 0
            ? `Car insurance takes $98 on ${fmtShort(a.lowDate)}, so you'd be ${money(-a.low)} short. Moving ${usd0(cushion())} in before then covers it.`
            : `You're covered through payday. Lowest point: ${money(a.low)}.`,
        ],
        options: [] as Opt[],
      };
    }
    if (key === "triage") {
      const s = plan.current ? triageScript(plan.current, name, `the ${ordinal(onboard.current.payday || 18)}`) : null;
      const who = (s?.to ?? "landlord").toLowerCase();
      return {
        lead: "Next day",
        time: "6:30 PM",
        sub: "PayPing checks in",
        texts: [`Hey${name ? ` ${name}` : ""}, checking in like I said. Did your ${who} answer your message?`, "Reply YES or NO."],
        options: [
          yesOpt([`Great. Get the plan in writing, even a text is fine, so you both remember the dates.`, `On payday I'll remind you what's still owed.`]),
          noOpt([`That's normal. Give it a day, then a short call works too.`, `Paying part of it now still helps. It shows you're trying.`]),
        ],
      };
    }
    const dd = decode.current;
    const d = addDays(today, 3);
    return {
      lead: d.toLocaleDateString("en-US", { weekday: "long" }),
      time: "11:15 AM",
      sub: "3 days later",
      texts: [`Checking in like I said. Did ${dd?.servicer ?? "your servicer"} answer your message?`, "Reply YES or NO."],
      options: [
        yesOpt([`Good. Ask them to confirm it in writing and screenshot it. I'll watch for your next bill.`]),
        noOpt([`OK. Call them today. The number is on your letter. Read them the message I wrote. It takes about 10 minutes.`]),
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  /** The quick replies for each step, in one place, so a reopened chat gets the same buttons back. */
  const chipsFor = useCallback(
    (st: Stage): Chip[] => {
      const L = () => latest.current;
      const forbearance: Chip = { label: "What's a forbearance?", onPick: () => void L().ask("What's a forbearance?") };
      switch (st) {
        case "start":
        case "stopped":
          return [startChip];
        case "askPay":
          return [
            { label: "The 1st", onPick: () => void L().answerPay(1, "The 1st") },
            { label: "The 15th", onPick: () => void L().answerPay(15, "The 15th") },
            { label: "The 18th", onPick: () => void L().answerPay(18, "The 18th") },
            { label: "Not sure", onPick: () => void L().answerPay(0, "Not sure") },
          ];
        case "askLoans":
          return [
            { label: "Attach my aid file", primary: true, onPick: () => void L().attachAid() },
            ...(onboard.current.bankOffered && !onboard.current.bank ? [{ label: "Connect my bank", onPick: () => void L().openPlaid() }] : []),
          ];
        case "askBank":
          return [
            { label: "Connect my bank", primary: true, onPick: () => void L().openPlaid() },
            { label: "Skip, I'll text my numbers", onPick: () => void L().skipBank() },
          ];
        case "noBank":
          return [{ label: "Try that example", primary: true, onPick: () => void L().send(EXAMPLE) }];
        case "signedUp":
          return [{ label: "Continue", primary: true, onPick: () => void L().headsUp() }];
        case "alerted":
          return [
            { label: "YES", primary: true, onPick: () => void L().yes() },
            { label: "No thanks", onPick: () => void L().declineFix("No thanks") },
            { label: "Why not just pay it?", onPick: () => void L().ask("Why not just pay it?") },
            { label: "What's a grace period?", onPick: () => void L().ask("What's a grace period?") },
          ];
        case "covered":
          return [{ label: "Forward a loan letter", onPick: () => void L().forwardNotice() }];
        case "drafted":
          return [{ label: "Continue", primary: true, onPick: () => void L().resumeStory() }];
        case "followUp": {
          if (!fu.current) return [];
          if (fu.current === "balance") return [{ label: "Continue", primary: true, onPick: () => void L().paydayBoost() }];
          return fuSpec(fu.current).options.map((o, i) => ({ label: o.label, primary: o.primary, onPick: () => void L().answerFollowUp(i, o.label) }));
        }
        case "boost":
          return [
            { label: `${money(BOOST).replace(".00", "")} a month`, primary: true, onPick: () => void L().boostYes(BOOST) },
            { label: "$50 a month", onPick: () => void L().boostYes(50) },
            { label: "Not now", onPick: () => void L().boostNo() },
          ];
        case "remindAsk":
          return [
            { label: "Yes, remind me", primary: true, onPick: () => void L().remind(true, "Yes, remind me") },
            { label: "No thanks", onPick: () => void L().remind(false, "No thanks") },
          ];
        case "boosted":
        case "wrapped":
          return endChips();
        case "triageAsk": {
          const pl = plan.current;
          return [...(pl?.scriptFor ? [{ label: "YES", primary: true, onPick: () => void L().yes() }, { label: "No thanks", onPick: () => void L().send("No thanks") }] : []), forbearance];
        }
        case "triageDone":
          return [forbearance, { label: "Forward a loan letter", onPick: () => void L().forwardNotice() }, { label: "Start over", onPick: () => void L().reset() }];
        case "noticeAsk": {
          const d = decode.current;
          const extra = d && /forbear/i.test(d.next_action) ? "What's a forbearance?" : d?.jargon[0] ? `What does "${d.jargon[0].term}" mean?` : "Other options?";
          return [
            { label: "YES", primary: true, onPick: () => void L().yes() },
            { label: extra, onPick: () => void L().ask(extra) },
            { label: "Other options?", onPick: () => void L().ask("Other options?") },
          ].filter((c, i, arr) => arr.findIndex((x) => x.label === c.label) === i);
        }
        case "noticeDrafted":
          return [{ label: "Short on cash? Try Pay This First", onPick: () => void L().send(EXAMPLE) }, { label: "Start over", onPick: () => void L().reset() }];
        default:
          return [];
      }
    },
    [endChips, fuSpec, startChip],
  );

  /** PayPing checks back in when it said it would: a time jump, then one question. */
  const followUp = useCallback(
    async (key: FuKey) => {
      const myRun = run.current;
      const spec = fuSpec(key);
      setChips([]);
      setContactName("PayPing");
      fu.current = key;
      stage.current = "followUp";
      push({ kind: "divider", lead: spec.lead, text: spec.time, sub: spec.sub });
      setBanner({ title: "PayPing", body: spec.texts[0] });
      await sleep(reduceMotion() ? 300 : 2000);
      if (run.current !== myRun) return;
      setBanner(null);
      const ok = await botSays(spec.texts.map((t) => ({ kind: "text", from: "bot", text: t }) as MsgBody), myRun);
      if (!ok) return;
      if (!spec.options.length) {
        await sleep(reduceMotion() ? 300 : 2400);
        if (run.current !== myRun || stage.current !== "followUp") return;
        await latest.current.paydayBoost();
        return;
      }
      setChips(chipsFor("followUp"));
    },
    [botSays, chipsFor, fuSpec, push, setChips],
  );

  const answerFollowUp = useCallback(
    async (i: number, said: string) => {
      const myRun = run.current;
      const key = fu.current;
      if (stage.current !== "followUp" || !key) return;
      const opt = fuSpec(key).options[i];
      if (!opt) return;
      setChips([]);
      push({ kind: "text", from: "me", text: said });
      opt.apply?.();
      fu.current = null;
      stage.current = key === "due" ? "drafted" : key === "triage" ? "triageDone" : "noticeDrafted";
      const ok = await botSays(opt.replies.map((t) => ({ kind: "text", from: "bot", text: t }) as MsgBody), myRun);
      if (!ok) return;
      if (key !== "due") return void setChips(chipsFor(stage.current));
      await sleep(reduceMotion() ? 300 : 2200);
      if (run.current !== myRun) return;
      await latest.current.paydayBoost();
    },
    [botSays, chipsFor, fuSpec, push, setChips],
  );

  /** "Continue" on a reopened chat that stopped between steps. */
  const resumeStory = useCallback(async () => {
    if (stage.current !== "drafted") return;
    if (due.current === "asked") return void (await followUp("due"));
    if (due.current === "declined") return void (await followUp("balance"));
    await latest.current.paydayBoost();
  }, [followUp]);

  // A reopened chat gets the buttons for the step it was on.
  useEffect(() => {
    if (sv) setChips(chipsFor(stage.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** "Wait, I want to add my bank": link it now, then come back for the aid file. */
  const bankFirst = useCallback(
    async (said: string) => {
      const myRun = run.current;
      if (stage.current !== "askLoans") return;
      setChips([]);
      push({ kind: "text", from: "me", text: said });
      onboard.current.bankOffered = true;
      const ok = await botSays(
        [
          { kind: "text", from: "bot", text: "Sure, let's link it first. It's read-only through Plaid. I can see balances and bills, never move money." },
          { kind: "link", from: "bot", title: "Connect your bank with Plaid", url: "secure.plaid.com", action: "plaid", brand: "plaid" },
        ],
        myRun,
      );
      if (ok) setChips(chipsFor("askLoans"));
    },
    [botSays, chipsFor, push, setChips],
  );

  latest.current = { bankFirst, yes, ask, forwardNotice, join, reset, paydayBoost, boostYes, boostNo, answerPay, attachAid, whereAid, openPlaid, skipBank, nudge, remind, declineFix, followUp, answerFollowUp, resumeStory, headsUp };

  /** Anything typed into the composer. */
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, 1200);
      if (!text || busy) return;
      const st = stage.current;
      const isYes = /^(yes|y|ya|yea|yes please|yep|yup|yeah|ok|okay|sure|do it|bet|please|👍|✅|👌)[.!]*$/i.test(text);
      const isNo = /^(no|nah|nope|not now|later|n)[.!]*$/i.test(text);
      const isQuestion = /\?\s*$/.test(text) || /^(what|why|how|who|is|are|can|do|does|where|when|wtf|huh|wait)\b/i.test(text);
      const letters = text.toLowerCase().replace(/[^a-z]/g, "");
      const gibberish = (!letters && !/\d/.test(text) && !isYes) || (letters.length >= 6 && !/[aeiouy]/.test(letters)) || /[bcdfghjklmnpqrstvwxz]{6,}/.test(letters);

      // Carrier keywords always work.
      if (/^(stop|unsubscribe|cancel|quit|end|stopall)$/i.test(text)) return void stopAll(text);
      if (/^(start over|reset|restart)$/i.test(text)) return void reset();
      if (/^(join|start|unstop)\b/i.test(text) && (st === "start" || st === "stopped" || ((st === "triageAsk" || st === "triageDone") && !onboard.current.firstName))) return void join(text);
      if (/^(help|info|menu|commands|\?+|what can you do\??|what do you do\??|what is this\??|who are you\??|how does this work\??)$/i.test(text))
        return void reply(text, [
          "I'm PayPing. I text you before a student loan bill or an overdraft hits, with one fix and what it costs. You say YES, I write the message, you send it. I never move money.",
          "Short on cash right now? Text me your cash and bills, like: I have $180. Rent 550, card 40.",
          ...(st === "start" || st === "stopped" ? ["Text JOIN to start, STOP to quit, START OVER to reset."] : nudge() ? [nudge() as string] : ["Text STOP to quit, or START OVER to reset."]),
        ]);
      if (gibberish) return void reply(text, ["Sorry, I didn't catch that.", nudge() ?? "Text HELP to see what I can do."]);

      // "Can I afford $30 shoes?": answered from their own numbers, in code.
      const amt = text.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s?(?:dollars|bucks)/i);
      if (amt && /afford|can i (buy|get|spend|pay)|should i (buy|get|spend)|is it ok|okay to (buy|spend)|treat myself/i.test(text) && st !== "askName" && st !== "askPay")
        return void reply(text, afford(Number((amt[1] ?? amt[2]).replace(/,/g, "")), text));

      // Pay This First works anytime outside the first two setup questions.
      const tri = st !== "askName" && st !== "askPay" ? parseTriage(text) : null;
      if (tri) return void runTriage(text, tri);

      switch (st) {
        case "start":
        case "stopped":
          if (isQuestion) return void ask(text);
          return void reply(text, ["Hi! I'm PayPing. I text you before a bill goes wrong. Free, no app.", "Text JOIN to start."]);
        case "askName":
          if (/^(hi|hey|hello|yo|sup|hii+|heyy+|what'?s up)[!. ]*$/i.test(text)) return void reply(text, ["Hey! What should I call you?"]);
          if (isQuestion || text.split(/\s+/).length > 4) return void ask(text);
          return void answerName(text);
        case "askPay": {
          const n = text.match(/\d{1,2}/);
          const d = n ? +n[0] : /first/i.test(text) ? 1 : /fifteen/i.test(text) ? 15 : /eighteen/i.test(text) ? 18 : /not sure|idk|don.?t know|every|bi.?weekly|weekly/i.test(text) ? 0 : -1;
          if (d >= 0) return void latest.current.answerPay(d, text);
          if (isQuestion) return void ask(text);
          return void reply(text, ["Just the day of the month is fine, like 15. Or tap Not sure."]);
        }
        case "askLoans":
          if (!onboard.current.bank && (/\b(add|link|connect|hook up|use|do)\b.*\b(bank|checking|plaid)\b|\bbank (first|now)\b|^(my )?bank\b/i.test(text))) return void latest.current.bankFirst(text);
          if (/where|how|find/i.test(text)) return void whereAid();
          if (/^(ok|okay|done|sent|here|attached|got it|k|uploaded)\b/i.test(text) || isYes) return void attachAid();
          return void ask(text);
        case "askBank":
          if (/^(skip|no|nah|rather not|i'?d rather not)\b/i.test(text)) return void skipBank();
          if (/^(ok|okay|connect|link|done|sure|go)\b/i.test(text) || isYes) return void openPlaid();
          return void ask(text);
        case "alerted":
          if (isYes) return void yes();
          if (isNo) return void latest.current.declineFix(text);
          break;
        case "noticeAsk":
        case "triageAsk":
          if (isYes) return void yes();
          if (isNo) {
            const next: Stage = st === "triageAsk" ? "triageDone" : "noticeDrafted";
            stage.current = next;
            setChips([]);
            push({ kind: "text", from: "me", text });
            const myRun = run.current;
            return void botSays([{ kind: "text", from: "bot", text: "No problem. If you change your mind, just text WRITE IT and I'll draft it." }], myRun).then((ok) => ok && setChips(chipsFor(next)));
          }
          break;
        case "triageDone":
        case "noticeDrafted":
          if (/^write it\b/i.test(text) && (st === "triageDone" ? plan.current?.scriptFor : decode.current)) {
            stage.current = st === "triageDone" ? "triageAsk" : "noticeAsk";
            return void yes();
          }
          break;
        case "followUp": {
          const spec = fu.current ? fuSpec(fu.current) : null;
          const i = spec ? spec.options.findIndex((o) => o.test(text, isYes, isNo)) : -1;
          if (i >= 0) return void latest.current.answerFollowUp(i, text);
          break;
        }
        case "boost":
          if (/50/.test(text)) return void latest.current.boostYes(50, text);
          if (isYes || /25/.test(text)) return void latest.current.boostYes(BOOST, text);
          if (isNo) return void latest.current.boostNo(text);
          break;
        case "remindAsk":
          if (isYes || /remind/i.test(text)) return void latest.current.remind(true, text);
          if (isNo) return void latest.current.remind(false, text);
          break;
      }
      if (looksLikeNotice(text)) return void pasteNotice(text);
      // A plain yes/no when nothing was asked: acknowledge it instead of a confused answer.
      if (isYes || isNo) return void reply(text, ["Got it. I'll text you when something needs you."]);
      return void ask(text);
    },
    [ask, busy, join, pasteNotice, reset, yes, answerName, attachAid, whereAid, openPlaid, nudge, reply, runTriage, skipBank, stopAll, afford, botSays, chipsFor, fuSpec, push, setChips],
  );
  latest.current.send = send;

  /* ---------------- Hands-free demo for screen recording ---------------- */

  const [autofill, setAutofill] = useState(0); // bump tells the signup sheet to fill itself in
  /** "Play automatically": the whole story hands-free, at reading pace, for judges. */
  const playAll = useCallback(async () => {
    reset({ idle: false });
    await sleep(60);
    const myRun = run.current;
    autoRef.current = true;
    setAutoplaying(true);
    const live = () => run.current === myRun && autoRef.current;
    const step = async (ms: number) => {
      await sleep(FAST ? ms / 2 : ms);
      return live();
    };
    const at = (st: Stage) => live() && stage.current === st;
    const L = () => latest.current;
    const finish = () => {
      if (run.current === myRun) {
        autoRef.current = false;
        setAutoplaying(false);
      }
    };
    if (!(await step(700))) return;
    await join();
    if (!(await step(1500))) return;
    await answerName("Tariq");
    if (!(await step(1500))) return;
    await L().answerPay(18, "The 18th");
    if (!(await step(1900))) return;
    await attachAid();
    if (!(await step(1900))) return;
    openPlaid();
    if (!(await step(2400))) return;
    const done = await plaidDone();
    if (!done || !at("alerted")) return finish();
    if (!(await step(2800))) return;
    await yes(); // writes the request, then the Dec 1 check-in
    if (at("followUp")) {
      if (!(await step(2200))) return;
      await L().answerFollowUp(0, "YES"); // then payday
    }
    if (at("boost")) {
      if (!(await step(2600))) return;
      await L().boostYes(BOOST, `${money(BOOST).replace(".00", "")} a month`);
    }
    if (at("remindAsk")) {
      if (!(await step(2000))) return;
      await L().remind(true, "Yes, remind me");
    }
    if (!(await step(2800))) return;
    const parsed = parseTriage(EXAMPLE);
    if (parsed) await runTriage(EXAMPLE, parsed);
    if (at("triageAsk")) {
      if (!(await step(2600))) return;
      await yes(); // landlord note, then the next-day check-in
    }
    if (at("followUp")) {
      if (!(await step(2200))) return;
      await L().answerFollowUp(0, "YES");
    }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerName, attachAid, join, openPlaid, plaidDone, reset, yes, runTriage]);

  const onSignupDone = useCallback(async (_info: SignupInfo) => {}, []);

  /** Stop autoplay and leave the chat where it is. */
  const stopAuto = useCallback(() => {
    autoRef.current = false;
    setAutoplaying(false);
  }, []);

  const jumpToHeadsUp = useCallback(async () => {
    reset({ idle: false });
    await sleep(60);
    const myRun = run.current;
    recompute({});
    if (run.current !== myRun) return;
    stage.current = "signedUp";
    await headsUp();
  }, [headsUp, recompute, reset]);

  const changeBalance = useCallback(
    (v: number) => {
      setBalance(v);
      recompute({}, v);
    },
    [recompute],
  );

  return {
    today,
    msgs,
    typing,
    chips,
    banner,
    signupOpen,
    setSignupOpen,
    aiMode,
    liveOn,
    setLiveOn,
    lastSource,
    balance,
    changeBalance,
    busy,
    contactName,
    autoplaying,
    autofill,
    plaidOpen,
    setPlaidOpen,
    plaidDone,
    openPlaid,
    attachAid,
    stage: stage.current,
    fuKey: fu.current,
    dueState: due.current,
    canOpenSignup: stage.current === "joined",
    profile: profile.current,
    send,
    reset,
    join,
    jumpToHeadsUp,
    forwardNotice,
    pasteNotice,
    onSignupDone,
    playAll,
    stopAuto,
  };
}

export type FirstBillApi = ReturnType<typeof useFirstBill>;
