import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatTurn, Decode } from "../../supabase/functions/_shared/firstbill-prompt";
import { aiDecode, aiReply, detectAiMode, type AiMode } from "@/lib/firstbill/ai";
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
  type Alert,
  type Profile,
  type SampleNotice,
} from "@/lib/firstbill/data";

export type MsgBody =
  | { kind: "text"; from: "bot" | "me"; text: string }
  | { kind: "notice"; from: "me"; title: string; servicer: string; text: string }
  | { kind: "link"; from: "bot"; title: string; url: string }
  | { kind: "timeline"; from: "bot"; alert: Alert; profile: Profile }
  | { kind: "clock"; from: "bot"; daysLeft: number; lateToday: number; threshold: number; hitDate: string; federal: boolean }
  | { kind: "bank"; from: "bot"; amount: number; balance: number; last4: string; payday: string }
  | { kind: "draft"; from: "bot"; to: string; text: string }
  | { kind: "divider"; text: string; sub?: string };
export type Msg = MsgBody & { id: string };

export type Chip = { label: string; onPick: () => void; primary?: boolean };
export type Banner = { title: string; body: string } | null;
export type Source = "claude" | "backup" | null;

type Stage = "start" | "joined" | "signedUp" | "alerted" | "drafted" | "noticeAsk" | "noticeDrafted";

let idSeq = 0;
const nid = () => `m${++idSeq}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface SignupInfo {
  firstName: string;
  paydayDom: number;
}

export function useFirstBill() {
  const today = useMemo(() => new Date(), []);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [chips, setChipsState] = useState<Chip[]>([]);
  const chipsRef = useRef<Chip[]>([]);
  const setChips = useCallback((c: Chip[]) => {
    chipsRef.current = c;
    setChipsState(c);
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latest = useRef<Record<string, (...args: any[]) => any>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode | "checking">("checking");
  const [liveOn, setLiveOn] = useState(true);
  const [lastSource, setLastSource] = useState<Source>(null);
  const [balance, setBalance] = useState(450.18);
  const [busy, setBusy] = useState(false);
  const [autoplaying, setAutoplaying] = useState(false);
  const [contactName, setContactName] = useState("34778");

  const run = useRef(0); // bumps on reset so stale sequences stop
  const stage = useRef<Stage>("start");
  const profile = useRef<Profile>(makeProfile(today));
  const alert = useRef<Alert>(computeAlert(profile.current, today));
  const decode = useRef<Decode | null>(null);
  const turns = useRef<ChatTurn[]>([]);
  const skipLive = useRef<(() => void) | null>(null);
  const autoRef = useRef(false);

  useEffect(() => {
    let alive = true;
    detectAiMode().then((m) => alive && setAiMode(m));
    return () => {
      alive = false;
    };
  }, []);

  const useLive = aiMode !== "checking" && aiMode !== "none" && liveOn;

  const push = useCallback((m: MsgBody | MsgBody[]) => {
    const list = (Array.isArray(m) ? m : [m]).map((x) => ({ ...x, id: nid() }) as Msg);
    setMsgs((prev) => [...prev, ...list]);
    for (const x of list) {
      if (x.kind === "text") turns.current.push({ role: x.from === "me" ? "user" : "assistant", content: x.text });
    }
  }, []);

  /** Bot "types" each item, then sends it. Returns false if a reset happened meanwhile. */
  const botSays = useCallback(
    async (items: MsgBody[], myRun: number) => {
      for (const item of items) {
        const len = item.kind === "text" ? item.text.length : 90;
        setTyping(true);
        await sleep(reduceMotion() ? 120 : Math.min(1500, 520 + len * 7));
        if (run.current !== myRun) return false;
        setTyping(false);
        push(item);
        await sleep(reduceMotion() ? 40 : 160);
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

  const reset = useCallback(() => {
    run.current++;
    stage.current = "start";
    decode.current = null;
    turns.current = [];
    skipLive.current = null;
    setMsgs([]);
    setTyping(false);
    setBanner(null);
    setSignupOpen(false);
    setBusy(false);
    setLastSource(null);
    setContactName("34778");
    setChips([]);
  }, []);

  /* ---------------- Scene 1: JOIN by text ---------------- */

  const join = useCallback(async () => {
    const myRun = run.current;
    setChips([]);
    push({ kind: "text", from: "me", text: "JOIN" });
    stage.current = "joined";
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: "Welcome to FirstBill. I watch your student loans and your bank, and I text you before a bill goes wrong. It's free, and there's no app to download." },
        { kind: "link", from: "bot", title: "Finish setup in 60 seconds", url: "firstbill.app/join/k7q2" },
        { kind: "text", from: "bot", text: "Reply STOP anytime. I never sell your data or move your money." },
      ],
      myRun,
    );
    if (!ok) return;
    setContactName("FirstBill");
    setChips([{ label: "Open setup link", primary: true, onPick: () => setSignupOpen(true) }]);
  }, [botSays, push]);

  /* ---------------- Scene 2: the heads-up text FirstBill sends first ---------------- */

  const headsUp = useCallback(async () => {
    const myRun = run.current;
    const p = profile.current;
    const a = alert.current;
    setChips([]);
    setContactName("FirstBill");
    push({ kind: "divider", text: `Today ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, sub: stage.current === "signedUp" ? "6 months later" : undefined });
    stage.current = "alerted";
    const opener = `Heads up, ${p.firstName}: your student loan grace period ends in ${a.graceDays} days.`;
    setBanner({ title: "FirstBill", body: `${opener} Your first payment could overdraft your checking.` });
    await sleep(reduceMotion() ? 300 : 2300);
    if (run.current !== myRun) return;
    setBanner(null);
    const firstPullStr = fmtDate(p.firstPull);
    const items: MsgBody[] = [
      { kind: "text", from: "bot", text: opener },
      {
        kind: "text",
        from: "bot",
        text: `Your first payment of ${money(a.payment)} pulls from checking on ${firstPullStr}. That leaves you ${money(a.afterPull)} until payday on the ${ordinal(p.payday.getDate())}.`,
      },
      { kind: "timeline", from: "bot", alert: a, profile: p },
    ];
    if (a.status === "ok") {
      items.push({ kind: "text", from: "bot", text: `You're covered. You'll still have ${money(a.low)} before payday. I'll keep watching and text you if anything changes.` });
      await botSays(items, myRun);
      setChips([{ label: "Example 2: forward a notice", onPick: () => void latest.current.forwardNotice() }]);
      return;
    }
    items.push(
      {
        kind: "text",
        from: "bot",
        text:
          a.status === "overdraft"
            ? `That would overdraft you by ${money(-a.low)} on ${fmtShort(a.lowDate)}, and banks usually charge about $35 for that.`
            : `You wouldn't overdraft, but you'd be down to ${money(a.low)} on ${fmtShort(a.lowDate)} with no cushion.`,
      },
      { kind: "text", from: "bot", text: `Easiest fix: move your due date to the ${ordinal(a.newDue.getDate())}, ${daysBetween(p.payday, a.newDue)} days after you get paid. Same payment, just later.` },
      { kind: "text", from: "bot", text: `What it costs: $0 in fees and no credit hit. Interest adds up about ${money(a.daily)} a day either way, so your total barely changes.` },
      { kind: "text", from: "bot", text: `Reply YES and I'll write the request for you to send ${p.servicer.split(" ")[0]}. I never log in or move money.` },
    );
    const ok = await botSays(items, myRun);
    if (!ok) return;
    setChips([
      { label: "YES", primary: true, onPick: () => void latest.current.yes() },
      { label: "Why not just pay it?", onPick: () => void latest.current.ask("Why not just pay it?") },
      { label: "What's a grace period?", onPick: () => void latest.current.ask("What's a grace period?") },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, push]);

  const completeSignup = useCallback(
    async (info: SignupInfo) => {
      const myRun = run.current;
      setSignupOpen(false);
      recompute(info);
      const p = profile.current;
      stage.current = "signedUp";
      push({ kind: "text", from: "me", text: "Done" });
      const ok = await botSays(
        [
          {
            kind: "text",
            from: "bot",
            text: `You're in, ${p.firstName}. I found ${p.loans.length} federal loans (${money(totalBalance(p)).replace(".00", "")} with ${p.servicer.split(" ")[0]}) and checking ending ${p.checkingLast4}. I'll only text when something needs you.`,
          },
        ],
        myRun,
      );
      if (!ok) return;
      await sleep(autoRef.current ? 1400 : 900);
      if (run.current !== myRun) return;
      await headsUp();
    },
    [botSays, headsUp, push, recompute],
  );

  /* ---------------- YES: draft the message the user sends ---------------- */

  const yes = useCallback(async () => {
    const myRun = run.current;
    setChips([]);
    push({ kind: "text", from: "me", text: "YES" });
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
      if (ok) setChips([{ label: "Start over", onPick: () => latest.current.reset() }]);
      return;
    }
    const p = profile.current;
    const a = alert.current;
    stage.current = "drafted";
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: `Here's your request. Paste it into ${p.servicer.split(" ")[0]}'s secure messages, or read it on a call at 1-888-555-0142.` },
        { kind: "draft", from: "bot", to: p.servicer, text: dueDateDraft(p, a) },
        {
          kind: "text",
          from: "bot",
          text: `I'll text you on ${fmtShort(addDays(p.firstPull, -3))} to make sure they confirmed the ${ordinal(a.newDue.getDate())}. If not, I'll warn you before anything pulls on ${fmtShort(p.firstPull)}.`,
        },
      ],
      myRun,
    );
    if (ok) setChips([{ label: "Example 2: forward a notice", onPick: () => void latest.current.forwardNotice() }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, push, reset]);

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
      const federal = d.loan_kind !== "private";
      const threshold = federal ? 90 : 30;
      if (d.days_late && d.days_late > 0) {
        const since = sample ? daysBetween(sample.noticeDate, today) : 0;
        const lateToday = d.days_late + since;
        const daysLeft = threshold - lateToday;
        items.push({ kind: "clock", from: "bot", daysLeft, lateToday, threshold, hitDate: iso(addDays(today, Math.max(daysLeft, 0))), federal });
      } else if (d.due_date) {
        const dd = fromISO(d.due_date);
        items.push({ kind: "text", from: "bot", text: `It's due ${fmtDate(dd)}, ${daysBetween(today, dd)} days from now.` });
      }
      const amt = d.amount_to_catch_up ?? d.monthly_payment;
      const p = profile.current;
      if (amt) items.push({ kind: "bank", from: "bot", amount: amt, balance: p.balance, last4: p.checkingLast4, payday: fmtShort(p.payday) });
      items.push(
        { kind: "text", from: "bot", text: `Best next step: ${d.next_action}` },
        { kind: "text", from: "bot", text: `What it costs: ${d.cost_of_action}` },
        { kind: "text", from: "bot", text: "Reply YES and I'll write the message for you to send. I never log in or touch your account." },
      );
      stage.current = "noticeAsk";
      const ok = await botSays(items, myRun);
      if (!ok) return;
      const extra = /forbear/i.test(d.next_action) ? "What's a forbearance?" : d.jargon[0] ? `What does "${d.jargon[0].term}" mean?` : "Other options?";
      setChips([
        { label: "YES", primary: true, onPick: () => void latest.current.yes() },
        { label: extra, onPick: () => void latest.current.ask(extra) },
        { label: "Other options?", onPick: () => void latest.current.ask("Other options?") },
      ].filter((c, i, arr) => arr.findIndex((x) => x.label === c.label) === i));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aiMode, botSays, today, useLive, yes],
  );

  const forwardNotice = useCallback(async () => {
    reset();
    await sleep(60);
    const myRun = run.current;
    const n = makeSampleNotice(today);
    setContactName("FirstBill");
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
      setContactName("FirstBill");
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
    return `${p.firstName}, new grad. ${p.loans.length} federal Direct loans, ${money(totalBalance(p))} at ${p.loans[0].rate}% with ${p.servicer}. Grace period ends ${fmtShort(p.graceEnds)} (${a.graceDays} days). First payment ${money(a.payment)} autopays ${fmtShort(p.firstPull)}. Checking ${money(p.balance)}; after the payment ${money(a.afterPull)}; bills before payday: ${p.upcoming.map((u) => `${u.label} ${money(u.amount)} on ${fmtShort(u.date)}`).join(", ")}; lowest point ${money(a.low)} on ${fmtShort(a.lowDate)}. Payday ${fmtShort(p.payday)} (${money(p.paycheck)}). Suggested fix: move due date to the ${ordinal(a.newDue.getDate())}; no fee; interest about ${money(a.daily)} a day either way.`;
  }, []);

  const cannedAnswer = useCallback((q: string): string => {
    const a = alert.current;
    const p = profile.current;
    const s = q.toLowerCase();
    if (/why not|just pay|pay it/.test(s))
      return a.status === "overdraft"
        ? `You can! But your ${p.upcoming.map((u) => u.label.toLowerCase()).join(" and ")} hit before payday, so you'd go ${money(-a.low)} negative and probably pay a $35 overdraft fee. Moving the date costs nothing.`
        : `You can, and you'd be fine. You'd still have ${money(a.low)} before payday.`;
    if (/grace/.test(s)) return "A grace period is the 6 months after you leave school before payments start. Interest on your unsubsidized loans still adds up during it.";
    if (/forbear/.test(s)) return "A forbearance is a pause your servicer approves. It can cover months you already missed, so your account counts as caught up. Interest still adds up, so save it for emergencies.";
    if (/option|else/.test(s))
      return "Other options: pay one month after payday (you'd still be behind, and the credit clock keeps running), or switch to the RAP plan so future bills fit your income. Only the forbearance stops the clock today.";
    if (/rap|lower|income|plan/.test(s)) return "On RAP your payment is based on your income, often about $75 to $100 a month at $30k to $40k a year. Applying is free at StudentAid.gov. Never pay a company to do it.";
    if (/scam|safe|trust|data|sell/.test(s)) return "I can't log in or move money, and I never sell your data. Your bank link is read-only, and you send every message yourself.";
    if (/^stop\b/.test(s)) return "You're unsubscribed. Text JOIN anytime to come back.";
    const term = decode.current?.jargon.find((j) => s.includes(j.term.toLowerCase()));
    if (term) return `${term.term}: ${term.meaning}`;
    if (/delinquen/.test(s)) return "Delinquent just means behind on payments. It turns into a credit problem at 90 days late for federal loans.";
    if (/default/.test(s)) return "Default is 270 days late on a federal loan. After that they can take your tax refund and up to 15% of your paycheck, so we fix things way before that.";
    return "Good question. Right now I can explain this bill, your options, or what any word in it means. Try \"why not just pay it?\" or \"what's a grace period?\"";
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
      push({ kind: "text", from: "bot", text: answer });
      if (/^stop\b/i.test(q)) {
        setChips([{ label: "JOIN", primary: true, onPick: () => { latest.current.reset(); void latest.current.join(); } }]);
        return;
      }
      const left = prevChips.filter((c) => c.label !== q);
      setChips(left.length ? left : prevChips);
    },
    [aiMode, cannedAnswer, contextText, push, setChips, useLive],
  );

  latest.current = { yes, ask, forwardNotice, join, reset };

  /** Anything typed into the composer. */
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      if (/^join$/i.test(text) && stage.current === "start") return void join();
      if (/^(yes|y|yes please|yep|yeah|ok|okay|do it|bet)[.!]*$/i.test(text) && (stage.current === "alerted" || stage.current === "noticeAsk")) return void yes();
      if (/^(start over|reset|restart)$/i.test(text)) return reset();
      if (looksLikeNotice(text)) return void pasteNotice(text);
      return void ask(text);
    },
    [ask, busy, join, pasteNotice, reset, yes],
  );

  /** Show the starting chip whenever the thread is empty. */
  useEffect(() => {
    if (msgs.length === 0 && !typing && stage.current === "start") {
      setChips([{ label: "Text JOIN", primary: true, onPick: () => void latest.current.join() }]);
    }
  }, [msgs.length, typing, join]);

  /* ---------------- Hands-free demo for screen recording ---------------- */

  const [autofill, setAutofill] = useState(0); // bump tells the signup sheet to fill itself in
  const playAll = useCallback(async () => {
    reset();
    autoRef.current = true;
    setAutoplaying(true);
    await sleep(500);
    const myRun = run.current;
    await join();
    if (run.current !== myRun) return;
    await sleep(1100);
    setSignupOpen(true);
    await sleep(500);
    setAutofill((n) => n + 1); // the sheet fills itself, then calls completeSignup
  }, [join, reset]);

  const onSignupDone = useCallback(
    async (info: SignupInfo) => {
      const myRun = run.current;
      await completeSignup(info);
      if (autoRef.current && run.current === myRun && stage.current === "alerted") {
        await sleep(2200);
        if (run.current !== myRun) return;
        await yes();
        autoRef.current = false;
        setAutoplaying(false);
      }
    },
    [completeSignup, yes],
  );

  const stopAuto = useCallback(() => {
    autoRef.current = false;
    setAutoplaying(false);
  }, []);

  const jumpToHeadsUp = useCallback(async () => {
    reset();
    await sleep(60);
    recompute({});
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
