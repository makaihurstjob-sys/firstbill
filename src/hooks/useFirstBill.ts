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
export type Msg = MsgBody & { id: string };

export type Chip = { label: string; onPick: () => void; primary?: boolean };
export type Banner = { title: string; body: string } | null;
export type Source = "claude" | "backup" | null;

type Stage = "start" | "stopped" | "noBank" | "triageAsk" | "triageDone" | "askName" | "askPay" | "askLoans" | "askBank" | "joined" | "signedUp" | "alerted" | "covered" | "drafted" | "boost" | "boosted" | "noticeAsk" | "noticeDrafted";

let idSeq = 0;
const nid = () => `m${++idSeq}`;
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
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface SignupInfo {
  firstName: string;
  paydayDom: number;
}

export function useFirstBill() {
  const today = useMemo(() => new Date(), []);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latest = useRef<Record<string, (...args: any[]) => any>>({});
  const startChip: Chip = useMemo(() => ({ label: "JOIN", primary: true, onPick: () => void latest.current.join() }), []);
  const [chips, setChipsState] = useState<Chip[]>([startChip]);
  const chipsRef = useRef<Chip[]>([startChip]);
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
  const [contactName, setContactName] = useState("34778");

  const run = useRef(0); // bumps on reset so stale sequences stop
  const stage = useRef<Stage>("start");
  const profile = useRef<Profile>(makeProfile(today));
  const alert = useRef<Alert>(computeAlert(profile.current, today));
  const decode = useRef<Decode | null>(null);
  const turns = useRef<ChatTurn[]>([]);
  const skipLive = useRef<(() => void) | null>(null);
  const autoRef = useRef(false);
  const onboard = useRef<{ firstName: string; payday: number }>({ firstName: "", payday: 18 });
  const decodeCtl = useRef<AbortController | null>(null);
  const plan = useRef<TriagePlan | null>(null);

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
        if (run.current !== myRun) return false;
        const len = item.kind === "text" ? item.text.length : 90;
        setTyping(true);
        await sleep(reduceMotion() ? 120 : FAST ? Math.min(1100, 380 + len * 4.5) : Math.min(2100, 720 + len * 9.5));
        if (run.current !== myRun) return false;
        setTyping(false);
        push(item);
        await sleep(reduceMotion() ? 40 : FAST ? 150 : 520);
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

  const join = useCallback(async () => {
    const myRun = run.current;
    setChips([]);
    if (turns.current.length === 0) push({ kind: "divider", lead: "Today", text: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) });
    push({ kind: "text", from: "me", text: "JOIN" });
    stage.current = "askName";
    setContactName("Ping");
    await botSays(
      [
        { kind: "text", from: "bot", text: "Hey! I'm Ping. I text you before a bill goes wrong. Free, no app." },
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
      setChips([
        { label: "The 1st", onPick: () => void latest.current.answerPay(1, "The 1st") },
        { label: "The 15th", onPick: () => void latest.current.answerPay(15, "The 15th") },
        { label: "The 18th", onPick: () => void latest.current.answerPay(18, "The 18th") },
        { label: "Not sure", onPick: () => void latest.current.answerPay(0, "Not sure") },
      ]);
    },
    [botSays, push, setChips],
  );

  const answerPay = useCallback(
    async (dom: number, said: string) => {
      const myRun = run.current;
      if (stage.current !== "askPay") return;
      setChips([]);
      push({ kind: "text", from: "me", text: said });
      onboard.current.payday = dom >= 1 && dom <= 28 ? dom : 18;
      stage.current = "askLoans";
      const ok = await botSays(
        [
          { kind: "text", from: "bot", text: dom ? `Got it, the ${ordinal(onboard.current.payday)}.` : "No problem. I'll spot it in your bank. Looks like the 18th." },
          { kind: "text", from: "bot", text: "Now your student loans. Grab your file here, then send it to me." },
          { kind: "link", from: "bot", title: "Download My Aid Data", url: "studentaid.gov", action: "aid", brand: "studentaid" },
        ],
        myRun,
      );
      if (!ok) return;
      setChips([{ label: "Attach my aid file", primary: true, onPick: () => void latest.current.attachAid() }]);
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
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: `Got it: ${p.loans.length} federal loans, ${money(totalBalance(p)).replace(".00", "")}, with ${p.servicer.split(" ")[0]}. Your grace period ends ${fmtShort(p.graceEnds)}.` },
        { kind: "text", from: "bot", text: "Last step: link your bank so I can warn you before an overdraft. Read-only." },
        { kind: "link", from: "bot", title: "Connect your bank with Plaid", url: "secure.plaid.com", action: "plaid", brand: "plaid" },
      ],
      myRun,
    );
    if (ok)
      setChips([
        { label: "Connect my bank", primary: true, onPick: () => void latest.current.openPlaid() },
        { label: "Skip, I'll text my numbers", onPick: () => void latest.current.skipBank() },
      ]);
  }, [botSays, push, recompute, setChips]);

  const [plaidOpen, setPlaidOpen] = useState(false);
  const openPlaid = useCallback(() => {
    if (stage.current === "askBank") setPlaidOpen(true);
  }, []);

  const plaidDone = useCallback(async () => {
    const myRun = run.current;
    setPlaidOpen(false);
    if (stage.current !== "askBank") return false;
    setChips([]);
    stage.current = "signedUp";
    const p = profile.current;
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: `Connected: checking ••${p.checkingLast4} at First Platypus Bank.` },
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

  /* ---------------- Scene 2: the heads-up text Ping sends first ---------------- */

  const headsUp = useCallback(async () => {
    const myRun = run.current;
    const p = profile.current;
    setChips([]);
    setContactName("Ping");
    // Realistic gap: the heads-up lands a couple of days after signup, not the second you finish.
    const later = addDays(today, GAP_DAYS);
    alert.current = { ...alert.current, graceDays: daysBetween(later, p.graceEnds) };
    push({ kind: "divider", lead: later.toLocaleDateString("en-US", { weekday: "long" }), text: "9:41 AM", sub: `${GAP_DAYS} days later` });
    stage.current = "alerted";
    const a = alert.current;
    const opener = `Heads up, ${p.firstName}: your student loan grace period ends in ${a.graceDays} days.`;
    setBanner({ title: "Ping", body: `${opener} Your first payment could overdraft you.` });
    await sleep(reduceMotion() ? 300 : 2300);
    if (run.current !== myRun) return;
    setBanner(null);
    const firstPullStr = fmtDate(p.firstPull);
    const items: MsgBody[] = [
      { kind: "text", from: "bot", text: opener },
      {
        kind: "text",
        from: "bot",
        text: `${money(a.payment)} comes out ${firstPullStr}. That leaves ${money(a.afterPull)} until payday.`,
      },
      { kind: "text", from: "bot", text: breakdown(p, a) },
    ];
    if (a.status === "ok") {
      items.push({ kind: "text", from: "bot", text: `You're covered. Lowest point: ${money(a.low)}. I'll keep watching.` });
      const okCovered = await botSays(items, myRun);
      if (!okCovered) return;
      stage.current = "covered";
      setChips([{ label: "Example 2: forward a notice", onPick: () => void latest.current.forwardNotice() }]);
      return;
    }
    items.push(
      {
        kind: "text",
        from: "bot",
        text:
          a.status === "overdraft"
            ? `With your other bills, you'd be ${money(-a.low)} short on ${fmtShort(a.lowDate)}. That's an overdraft fee, often $25 to $35.`
            : `You'd be down to ${money(a.low)} on ${fmtShort(a.lowDate)}. No cushion.`,
      },
      { kind: "text", from: "bot", text: `One idea: move your due date to the ${ordinal(a.newDue.getDate())}, ${daysBetween(p.payday, a.newDue)} days after payday. Same payment, costs $0, no credit hit.` },
      { kind: "text", from: "bot", text: `Want me to write the request to ${p.servicer.split(" ")[0]}? You'd send it.` },
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
    setChips([]);
    push({ kind: "text", from: "me", text: "YES" });
    if (stage.current === "triageAsk" && plan.current) {
      const s = triageScript(plan.current, onboard.current.firstName, `the ${ordinal(onboard.current.payday || 18)}`);
      stage.current = "triageDone";
      if (!s) return;
      const ok = await botSays(
        [
          { kind: "text", from: "bot", text: `Here's a message for your ${s.to.toLowerCase()}. Tap it to copy, then send it yourself.` },
          { kind: "draft", from: "bot", to: s.to, text: s.text },
          { kind: "text", from: "bot", text: "I'll check in tomorrow to see how it went." },
        ],
        myRun,
      );
      if (ok) setChips([{ label: "Start over", onPick: () => void latest.current.reset() }]);
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
      if (ok) setChips([{ label: "Start over", onPick: () => void latest.current.reset() }]);
      return;
    }
    const p = profile.current;
    const a = alert.current;
    stage.current = "drafted";
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: `Here it is. Tap to copy, then paste it in ${p.servicer.split(" ")[0]}'s messages or read it on a call.` },
        { kind: "draft", from: "bot", to: p.servicer, text: dueDateDraft(p, a) },
        { kind: "text", from: "bot", text: `I'll check on ${fmtShort(addDays(p.firstPull, -3))} that they said yes.` },
      ],
      myRun,
    );
    if (!ok) return;
    await sleep(reduceMotion() ? 300 : 1800);
    if (run.current !== myRun) return;
    await latest.current.paydayBoost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, push, reset]);

  /* ---------------- Payday: a proactive "pay it off sooner" nudge ---------------- */

  const paydayBoost = useCallback(async () => {
    const myRun = run.current;
    const p = profile.current;
    const a = alert.current;
    setChips([]);
    stage.current = "boost";
    push({ kind: "divider", text: `${fmtShort(p.payday)} · Payday`, sub: "Ping texts first" });
    const b = boostMath(p, a.payment, BOOST);
    const b50 = boostMath(p, a.payment, 50);
    const left = afterPayday(p, a.payment);
    const opener = `Your paycheck landed. Want to pay your loan off sooner?`;
    setBanner({ title: "Ping", body: opener });
    await sleep(reduceMotion() ? 300 : 1800);
    if (run.current !== myRun) return;
    setBanner(null);
    const ok = await botSays(
      [
        { kind: "text", from: "bot", text: `I see your paycheck landed: +${money(p.paycheck).replace(".00", "")}. After this month's bills you'd still have ${money(left)}.` },
        { kind: "text", from: "bot", text: `Want to put ${money(BOOST).replace(".00", "")} extra toward your loan each month? At ${p.loans[0].rate}%, that saves about ${money(b.saved).replace(/\.\d\d$/, "")} in interest and you'd be done ${b.sooner} months sooner.` },
        { kind: "text", from: "bot", text: `$50 a month would save about ${money(b50.saved).replace(/\.\d\d$/, "")} and finish ${b50.sooner} months sooner. Which feels doable?` },
      ],
      myRun,
    );
    if (!ok) return;
    setChips([
      { label: `${money(BOOST).replace(".00", "")} a month`, primary: true, onPick: () => void latest.current.boostYes(BOOST) },
      { label: "$50 a month", onPick: () => void latest.current.boostYes(50) },
      { label: "Not now", onPick: () => void latest.current.boostNo() },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSays, push]);

  const boostYes = useCallback(async (amt: number = BOOST) => {
    const myRun = run.current;
    if (stage.current !== "boost") return;
    stage.current = "boosted";
    setChips([]);
    push({ kind: "text", from: "me", text: amt === BOOST ? "YES" : `$${amt} a month` });
    const ok = await botSays(
      [{ kind: "text", from: "bot", text: `Nice. Want me to remind you each payday? I'll only ask when your bank can spare $${amt}. Tip: tell ${profile.current.servicer.split(" ")[0]} the extra goes to principal.` }],
      myRun,
    );
    if (ok) setChips([{ label: "Example 2: forward a notice", onPick: () => void latest.current.forwardNotice() }, { label: "Start over", onPick: () => void latest.current.reset() }]);
  }, [botSays, push]);

  const boostNo = useCallback(async () => {
    const myRun = run.current;
    if (stage.current !== "boost") return;
    stage.current = "boosted";
    setChips([]);
    push({ kind: "text", from: "me", text: "Not now" });
    const ok = await botSays([{ kind: "text", from: "bot", text: "No problem. I'll ask again next payday." }], myRun);
    if (ok) setChips([{ label: "Example 2: forward a notice", onPick: () => void latest.current.forwardNotice() }, { label: "Start over", onPick: () => void latest.current.reset() }]);
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
    reset({ idle: false });
    await sleep(60);
    const myRun = run.current;
    const n = makeSampleNotice(today);
    setContactName("Ping");
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
      setContactName("Ping");
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
        ? `You can! But your ${p.upcoming.map((u) => u.label.toLowerCase()).join(" and ")} hit before payday, so you'd go ${money(-a.low)} below zero and could get an overdraft fee or a bounced payment. Moving the date costs nothing.`
        : `You can, and you'd be fine. You'd still have ${money(a.low)} before payday.`;
    if (/^(hi|hey|hello|yo|sup)\b/.test(s)) return "Hey! I'm Ping. I watch your student loans and bills so nothing surprises you.";
    if (/thank|thx|ty\b/.test(s)) return "Anytime.";
    if (/capitaliz/.test(s)) return "Capitalization is when unpaid interest gets added to your loan balance. Then you pay interest on that interest. Paying the interest before it happens avoids it.";
    if (/defer/.test(s)) return "Deferment and forbearance both pause payments. In a deferment, the government may cover interest on subsidized loans. In a forbearance, interest always keeps adding up.";
    if (/(cost|price|fee|free|pay for)/.test(s) && /(you|firstbill|this)/.test(s)) return "Ping is free. No fees, no ads, no credit offers, and we never sell your data.";
    if (/(human|real person|robot|\bbot\b|\bai\b|chatgpt)/.test(s)) return "I'm an automated assistant. Code does all the money math. AI only helps explain things in plain English. You approve everything.";
    if (/plaid|bank|read.?only|move (my )?money|login|password/.test(s)) return "Your bank link is read-only through Plaid. I can see balances and bills, never move money, and I never see your password. You can also skip it and just text me your numbers.";
    if (/what is this|what'?s this|what is firstbill|who are you|what do you do/.test(s)) return "I'm Ping. I text you before a student loan bill or an overdraft hits, and suggest one fix with its cost. Free, no app. I never move money.";
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
    return "I'm best with student loans and bills. Ask me about your payment or a word like \"forbearance\", text me your cash and bills, or text HELP.";
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
      const nd = ["start", "askName", "askPay", "askLoans", "askBank", "noBank"].includes(stage.current) ? latest.current.nudge?.() : null;
      if (nd && !answer.includes(nd)) {
        await sleep(reduceMotion() ? 60 : 500);
        if (run.current !== myRun) return;
        push({ kind: "text", from: "bot", text: nd });
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
      setContactName("Ping");
      push({ kind: "text", from: "me", text });
      const pl = triage(parsed.cash, parsed.bills);
      plan.current = pl;
      stage.current = "triageAsk";
      const ok = await botSays(triageTexts(pl).map((t) => ({ kind: "text", from: "bot", text: t }) as MsgBody), myRun);
      if (!ok) return;
      setChips([
        ...(pl.scriptFor ? [{ label: "YES", primary: true, onPick: () => void latest.current.yes() }] : []),
        { label: "What's a forbearance?", onPick: () => void latest.current.ask("What's a forbearance?") },
      ]);
    },
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
        { kind: "text", from: "bot", text: "When money's tight, text me your cash and bills, like:\nI have $180. Rent 550, card 40, loan 310, electric 60" },
      ],
      myRun,
    );
    if (run.current === myRun) setChips([{ label: "Try that example", primary: true, onPick: () => void latest.current.send("I have $180. Rent 550, card 40, loan 310, electric 60") }]);
  }, [botSays, push, setChips]);

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
        return `Reply YES to add ${money(BOOST).replace(".00", "")} a month, or Not now.`;
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
      const ok = await botSays([{ kind: "text", from: "bot", text: "You're unsubscribed from Ping. No more texts. Text JOIN anytime to come back." }], myRun);
      if (ok) setChips([startChip]);
    },
    [botSays, push, setChips, startChip],
  );

  latest.current = { yes, ask, forwardNotice, join, reset, paydayBoost, boostYes, boostNo, answerPay, attachAid, whereAid, openPlaid, skipBank, nudge };

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
      if (/^(join|start|unstop)\b/i.test(text) && (st === "start" || st === "stopped" || ((st === "triageAsk" || st === "triageDone") && !onboard.current.firstName))) return void join();
      if (/^(help|info|menu|commands|\?+|what can you do\??|what do you do\??|what is this\??|who are you\??|how does this work\??)$/i.test(text))
        return void reply(text, [
          "I'm Ping. I text you before a student loan bill or an overdraft hits, with one fix and what it costs. You say YES, I write the message, you send it. I never move money.",
          "Short on cash right now? Text me your cash and bills, like: I have $180. Rent 550, card 40.",
          ...(nudge() && st !== "start" ? [nudge() as string] : ["Text JOIN to start, STOP to quit, START OVER to reset."]),
        ]);
      if (gibberish) return void reply(text, ["Sorry, I didn't catch that.", nudge() ?? "Text HELP to see what I can do."]);

      // Pay This First works anytime outside the first two setup questions.
      const tri = st !== "askName" && st !== "askPay" ? parseTriage(text) : null;
      if (tri) return void runTriage(text, tri);

      switch (st) {
        case "start":
        case "stopped":
          if (isQuestion) return void ask(text);
          return void reply(text, ["Hi! I'm Ping. I text you before a bill goes wrong. Free, no app.", "Text JOIN to start."]);
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
          if (/where|how|find/i.test(text)) return void whereAid();
          if (/^(ok|okay|done|sent|here|attached|got it|k|uploaded)\b/i.test(text) || isYes) return void attachAid();
          return void ask(text);
        case "askBank":
          if (/^(skip|no|nah|rather not|i'?d rather not)\b/i.test(text)) return void skipBank();
          if (/^(ok|okay|connect|link|done|sure|go)\b/i.test(text) || isYes) return void openPlaid();
          return void ask(text);
        case "alerted":
        case "noticeAsk":
        case "triageAsk":
          if (isYes) return void yes();
          if (isNo) return void reply(text, ["No problem. Reply YES anytime and I'll write it."]);
          break;
        case "boost":
          if (/50/.test(text)) return void latest.current.boostYes(50);
          if (isYes || /25/.test(text)) return void latest.current.boostYes();
          if (isNo) return void latest.current.boostNo();
          break;
      }
      if (looksLikeNotice(text)) return void pasteNotice(text);
      return void ask(text);
    },
    [ask, busy, join, pasteNotice, reset, yes, answerName, attachAid, whereAid, openPlaid, nudge, reply, runTriage, skipBank, stopAll],
  );
  latest.current.send = send;

  /* ---------------- Hands-free demo for screen recording ---------------- */

  const [autofill, setAutofill] = useState(0); // bump tells the signup sheet to fill itself in
  const playAll = useCallback(async () => {
    reset({ idle: false });
    const myRun = run.current;
    autoRef.current = true;
    setAutoplaying(true);
    const live = () => run.current === myRun && autoRef.current;
    const step = async (ms: number) => { await sleep(ms); return live(); };
    if (!(await step(500))) return;
    await join();
    if (!(await step(900))) return;
    await answerName("Tariq");
    if (!(await step(900))) return;
    await latest.current.answerPay(18, "The 18th");
    if (!(await step(1000))) return;
    await attachAid();
    if (!(await step(900))) return;
    openPlaid();
    if (!(await step(1600))) return;
    const done = await plaidDone();
    if (done && live() && stage.current === "alerted") {
      if (!(await step(2200))) return;
      await yes();
      if (live() && (stage.current as Stage) === "boost") {
        if (!(await step(2000))) return;
        await latest.current.boostYes();
      }
    }
    if (run.current === myRun) {
      autoRef.current = false;
      setAutoplaying(false);
    }
  }, [answerName, attachAid, join, openPlaid, plaidDone, reset, yes]);

  const onSignupDone = useCallback(async (_info: SignupInfo) => {}, []);

  const stopAuto = useCallback(() => {
    reset();
  }, [reset]);

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
