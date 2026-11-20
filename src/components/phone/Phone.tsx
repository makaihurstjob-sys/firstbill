import { useEffect, useRef, useState } from "react";
import { AudioLines, ChevronLeft, FileText, Plus, RotateCcw, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FirstBillApi, Msg } from "@/hooks/useFirstBill";
import { BankCard, ClockCard, LinkCard, NoticeAttachment, PayPingMark, PlaidLogo, TimelineCard } from "./Cards";
import type { Profile } from "@/lib/firstbill/data";
import { HoldMenu, type Held } from "./HoldMenu";

declare const __BUILD__: string;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/, "");
}

function StatusBar() {
  const time = useClock();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[45] flex h-12 items-center justify-between px-7 pt-1 text-[15px] font-semibold text-ph-ink">
      <span className="tabular-nums">{time}</span>
      <span className="flex items-center gap-1.5" aria-hidden>
        <svg width="18" height="11" viewBox="0 0 18 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="6" rx="1" /><rect x="10" y="2.5" width="3" height="8.5" rx="1" /><rect x="15" y="0" width="3" height="11" rx="1" /></svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 0 0 8 .4C5.2.4 2.7 1.5.8 3.3L2 4.6a8.5 8.5 0 0 1 6-2.4Zm0 3.5c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.7 6.7 0 0 0 8 3.9c-1.8 0-3.4.7-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3Zm0 3.4c.4 0 .8.2 1.1.4L8 10.8 6.9 9.5c.3-.2.7-.4 1.1-.4Z" /></svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none"><rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity=".45" /><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" /><rect x="23.5" y="4" width="1.8" height="4" rx=".9" fill="currentColor" opacity=".45" /></svg>
      </span>
    </div>
  );
}

function Header({ name, full, onReset, onBack }: { name: string; full?: boolean; onReset?: () => void; onBack?: () => void }) {
  const known = name === "PayPing";
  return (
    <div className={cn("relative z-10 border-b border-ph-sep bg-ph-bar pb-2 backdrop-blur", full ? "pt-[max(10px,env(safe-area-inset-top))]" : "pt-12")}>
      <div className="flex items-start justify-between px-3">
        <button type="button" onClick={onBack} className="flex items-center text-[17px] text-ph-out" aria-label="Back to Messages">
          <ChevronLeft className="h-6 w-6" />
          <span className="-ml-1 rounded-full bg-ph-out px-1.5 text-[12px] font-semibold leading-5 text-ph-out-ink">5</span>
        </button>
        <div className="flex flex-col items-center">
          {known ? (
            <PayPingMark className="h-11 w-11" />
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-[#a5abb6] to-[#858b96] text-[15px] font-bold text-white">#</span>
          )}
          <span className="mt-0.5 text-[12px] text-ph-ink">
            {name} <span className="text-ph-sub">›</span>
          </span>
        </div>
        {full ? (
          <button type="button" onClick={onReset} className="grid h-9 w-9 place-items-center rounded-full text-ph-out" aria-label="Start over">
            <RotateCcw className="h-5 w-5" />
          </button>
        ) : (
          <Video className="mt-1 h-6 w-6 text-ph-out" />
        )}
      </div>
    </div>
  );
}

function NotificationBanner({ title, body, full }: { title: string; body: string; full?: boolean }) {
  return (
    <div className={cn("absolute inset-x-2 z-40", full ? "top-[max(8px,env(safe-area-inset-top))]" : "top-12")} >
    <div className=" animate-banner-in rounded-[22px] border border-white/20 bg-[rgba(245,245,247,0.92)] p-3 text-black shadow-xl backdrop-blur-md">
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#34c759]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.6 21l4.1-2.2c1 .3 2.1.4 3.3.4 5.5 0 10-3.6 10-8.1S17.5 3 12 3Z" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between text-[14px]">
            <b>{title}</b>
            <span className="text-[12px] text-[#6b6b70]">now</span>
          </div>
          <p className="line-clamp-2 text-[14px] leading-snug text-[#1c1c1e]">{body}</p>
        </div>
      </div>
    </div>
    </div>
  );
}

function Tapback({ e, me }: { e: string; me: boolean }) {
  return (
    <span className={cn("tb absolute -top-[18px] z-10 grid h-8 min-w-8 place-items-center rounded-full border-2 border-ph-bg px-1 text-[15px] shadow-sm", me ? "-left-4 bg-ph-in" : "-right-4 bg-ph-out")} aria-label={`Reacted ${e}`}>
      {e}
    </span>
  );
}

const NFA = "This is not financial advice.";

function Bubble({ from, text, tail, tapback, nfa }: { from: "me" | "bot"; text: string; tail: boolean; tapback?: string; nfa?: boolean }) {
  const me = from === "me";
  return (
    <div
      className={cn(
        "bubble max-w-[75%] whitespace-pre-wrap break-words rounded-[18px] px-3 py-[6px] text-[17px] leading-[22px] tracking-[-0.41px]",
        me ? "bg-ph-out text-ph-out-ink" : "bg-ph-in text-ph-in-ink",
        tail && (me ? "tail-me" : "tail-bot"),
      )}
    >
      <span>{text}</span>
      {nfa && <span className="mt-1 block text-[12px] leading-4 opacity-55">{NFA}</span>}
      {tapback && <Tapback e={tapback} me={me} />}
    </div>
  );
}

function Row({ m, next, api, onFile, tapback }: { m: Msg; next?: Msg; api: FirstBillApi; onFile: () => void; tapback?: string }) {
  if (m.kind === "divider") {
    return (
      <div className="pb-1 pt-3 text-center text-[12px] leading-4 text-ph-sub">
        {m.lead ? (
          <>
            <b className="font-semibold">{m.lead}</b> {m.text}
          </>
        ) : (
          <>
            <b className="font-semibold">{m.text.split(" ")[0]}</b> {m.text.split(" ").slice(1).join(" ")}
          </>
        )}
        {m.sub && <div className="mt-0.5 italic">{m.sub}</div>}
      </div>
    );
  }
  const from = m.from;
  const sameNext = next && next.kind !== "divider" && "from" in next && next.from === from;
  const tail = !sameNext;
  let body: React.ReactNode;
  switch (m.kind) {
    case "text":
      body = <Bubble from={from} text={m.text} tail={tail} tapback={tapback} nfa={m.nfa} />;
      break;
    case "notice":
      body = <NoticeAttachment title={m.title} servicer={m.servicer} text={m.text} />;
      break;
    case "link":
      body = <LinkCard title={m.title} url={m.url} brand={m.brand} onOpen={() => (m.action === "plaid" ? api.openPlaid() : m.action === "aid" ? void api.attachAid() : api.canOpenSignup && api.setSignupOpen(true))} />;
      break;
    case "timeline":
      body = <TimelineCard alert={m.alert} profile={m.profile} />;
      break;
    case "clock":
      body = <ClockCard {...m} />;
      break;
    case "bank":
      body = <BankCard {...m} />;
      break;
    case "draft":
      body = <DraftBubble text={m.text} tail={tail} tapback={tapback} />;
      break;
    case "file":
      body = (
        <button
          type="button"
          onClick={onFile}
          aria-label={`Open ${m.name}`}
          className={cn("bubble flex w-[70%] max-w-[250px] items-center gap-3 rounded-[18px] bg-ph-out px-3 py-2.5 text-left text-ph-out-ink active:opacity-80", tail && "tail-me")}
        >
          <span className="grid h-10 w-9 shrink-0 place-items-center rounded-md bg-white/20">
            <FileText className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <b className="block truncate text-[14px]">{m.name}</b>
            <span className="text-[12px] opacity-80">{m.size} · Tap to view</span>
          </span>
          {tapback && <Tapback e={tapback} me />}
        </button>
      );
      break;
  }
  if (m.nfa && m.kind !== "text")
    body = (
      <div className="flex max-w-[80%] flex-col items-start">
        {body}
        <span className="mt-1 pl-2 text-[11px] text-ph-sub">{NFA}</span>
      </div>
    );
  return <div data-msg={m.id} className={cn("flex animate-bubble-in px-3", from === "me" ? "justify-end" : "justify-start", sameNext ? "pb-[4px]" : "pb-3", tapback && "pt-4")}>{body}</div>;
}

/** The drafted message is just a text, like iMessage. Tap it to copy. */
function DraftBubble({ text, tail, tapback }: { text: string; tail: boolean; tapback?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };
  return (
    <div className="flex max-w-[75%] flex-col items-start">
      <button type="button" onClick={copy} data-draft className={cn("bubble whitespace-pre-wrap break-words rounded-[18px] bg-ph-in px-3 py-[6px] text-left text-[17px] leading-[22px] tracking-[-0.41px] text-ph-in-ink", tail && "tail-bot")}>
        <p>{text}</p>
        {tapback && <Tapback e={tapback} me={false} />}
      </button>
      <span className="mt-1 pl-2 text-[11px] text-ph-sub">{copied ? "Copied" : "Tap to copy"}</span>
    </div>
  );
}

function AidFileSheet({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const d = (x: Date) => `${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getDate()).padStart(2, "0")}/${x.getFullYear()}`;
  const begin = new Date(profile.graceEnds);
  begin.setDate(begin.getDate() + 1);
  const name = (profile.firstName || "Student").toUpperCase();
  const lines = [
    "File Source: U.S. Department of Education, Federal Student Aid",
    `File Request Date: ${d(new Date())}`,
    `Student First Name: ${name}`,
    "",
    ...profile.loans.flatMap((l, i) => [
      `Loan ${i + 1}`,
      `Loan Type Description: ${l.name.toUpperCase().replace("DIRECT ", "DIRECT STAFFORD ")}`,
      `Loan Outstanding Principal Balance: $${l.balance.toLocaleString("en-US")}`,
      `Loan Interest Rate: ${l.rate.toFixed(2)}%`,
      `Loan Repayment Begin Date: ${d(begin)}`,
      `Loan Contact Name: ${profile.servicer.toUpperCase()}`,
      "",
    ]),
  ];
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-ph-bg" role="dialog" aria-label="MyStudentData.txt">
      <div className="flex items-center justify-between border-b border-ph-sep bg-ph-bar px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <span className="w-14" />
        <span className="text-center">
          <b className="block text-[16px]">MyStudentData.txt</b>
          <span className="text-[12px] text-ph-sub">6 KB · sample data</span>
        </span>
        <button type="button" onClick={onClose} className="w-14 text-right text-[17px] font-semibold text-ph-out">
          Done
        </button>
      </div>
      <pre className="flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12.5px] leading-[1.5] text-ph-ink">{lines.join("\n")}</pre>
      <p className="px-4 pb-[max(12px,env(safe-area-inset-bottom))] text-[12px] text-ph-sub">What you sent PayPing: the file StudentAid.gov gives you from Download My Aid Data. Sample record for the demo.</p>
    </div>
  );
}

/** Tap back: the Messages list. PayPing on top; the rest are generic "money apps" that text everyone the same thing. Not tappable. */
const OTHERS = [
  { name: "Budget App", time: "Yesterday", text: "You spent money this week 📊 Open the app to see a pie chart about it.", unread: true },
  { name: "Cash Advance App", time: "Yesterday", text: "Short before payday? We can't tell you why, but here's $50. Tip optional* 🙂", unread: true },
  { name: "Your Bank", time: "Tuesday", text: "Your statement is ready. It's 14 pages. Good luck!", unread: false },
  { name: "Credit Score App", time: "Monday", text: "Your score went up 2 points! 🎉 Here are 9 credit cards to celebrate.", unread: true },
  { name: "Pre-Approved!!", time: "Sunday", text: "Congrats {FIRST_NAME}, you're pre-approved for something!", unread: true },
  { name: "Finance Influencer", time: "11/14", text: "Just stop buying coffee and you'll be a millionaire by 30 ☕️", unread: false },
];

function MessagesList({ full, last, onOpen }: { full?: boolean; last?: { text: string }; onOpen: () => void }) {
  const row = "flex w-full gap-3 px-4 py-2.5 text-left";
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-ph-bg" role="dialog" aria-label="Messages">
      <div className={cn("flex items-center justify-between px-4 text-[17px] text-ph-out", full ? "pt-[max(12px,env(safe-area-inset-top))]" : "pt-14")}>
        <span>Edit</span>
        <button type="button" onClick={onOpen} className="text-[15px]">Done</button>
      </div>
      <h2 className="px-4 pb-2 pt-1 text-[34px] font-bold tracking-tight text-ph-ink">Messages</h2>
      <div className="mx-4 mb-2 rounded-[10px] bg-ph-in px-3 py-1.5 text-[16px] text-ph-sub">Search</div>
      <div className="no-scrollbar flex-1 overflow-y-auto">
        <button type="button" onClick={onOpen} className={row}>
          <span className="mt-1 h-2.5 w-2.5 shrink-0" />
          <PayPingMark className="h-11 w-11 shrink-0" />
          <span className="min-w-0 flex-1 border-b border-ph-sep pb-2.5">
            <span className="flex justify-between"><b className="text-[16px] text-ph-ink">PayPing</b><span className="text-[14px] text-ph-sub">now ›</span></span>
            <span className="line-clamp-2 text-[14px] leading-snug text-ph-sub">{last?.text ?? "Text JOIN to start"}</span>
          </span>
        </button>
        {OTHERS.map((o) => (
          <div key={o.name} className={row} aria-disabled>
            <span className={cn("mt-4 h-2.5 w-2.5 shrink-0 rounded-full", o.unread && "bg-ph-out")} />
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#a5abb6] to-[#858b96] text-[15px] font-semibold text-white">{o.name[0]}</span>
            <span className="min-w-0 flex-1 border-b border-ph-sep pb-2.5">
              <span className="flex justify-between"><b className="text-[16px] text-ph-ink">{o.name}</b><span className="text-[14px] text-ph-sub">{o.time}</span></span>
              <span className="line-clamp-2 text-[14px] leading-snug text-ph-sub">{o.text}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex px-3 pb-2" aria-label="PayPing is typing">
      <div className="bubble tail-bot flex items-center gap-1 rounded-[18px] bg-ph-in px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 animate-dot rounded-full bg-ph-sub" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  );
}

function PlaidSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"pick" | "busy">("pick");
  const go = () => {
    if (step === "busy") return;
    setStep("busy");
    setTimeout(onDone, 900);
  };
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/40" role="dialog" aria-label="Connect your bank">
      <div className="w-full animate-in slide-in-from-bottom-10 rounded-t-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-black duration-200">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center" aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <PlaidLogo className="h-6 text-black" />
          <span className="w-9 text-right text-[11px] font-semibold text-[#888]">TEST</span>
        </div>
        <p className="mt-4 text-[20px] font-bold leading-snug">PayPing uses Plaid to connect your bank</p>
        <ul className="mt-3 space-y-2 text-[14px] leading-snug text-[#333]">
          <li><b>Read-only.</b> Plaid and PayPing can see your balance and bills. Neither can move your money.</li>
          <li><b>Private.</b> Your login goes to your bank, not to PayPing. Your data is never sold.</li>
        </ul>
        <p className="mt-3 text-[12px] text-[#888]">Plaid Sandbox: a test bank with sample data.</p>
        <button type="button" onClick={go} className="mt-4 flex w-full items-center gap-3 rounded-xl border border-[#ddd] px-3 py-3 text-left">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e8f0fe] text-[13px] font-bold text-[#1a56db]">FP</span>
          <span className="flex-1">
            <b className="text-[15px]">First Platypus Bank</b>
            <span className="block text-[12px] text-[#666]">Plaid test bank · Checking ••6602</span>
          </span>
        </button>
        <button type="button" onClick={go} className="mt-4 h-12 w-full rounded-xl bg-black text-[16px] font-semibold text-white">
          {step === "busy" ? "Connecting…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

type Rec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/** Dictation with the browser's own speech recognition (Safari and Chrome). Hidden where it isn't available. */
function useDictation(onText: (t: string) => void) {
  const Ctor = typeof window !== "undefined" ? ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Rec) | undefined : undefined;
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  const toggle = () => {
    if (!Ctor) return;
    if (on) { rec.current?.stop(); return; }
    try {
      const r = new Ctor();
      r.lang = "en-US"; r.interimResults = true; r.continuous = false;
      r.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; cb.current(t); };
      r.onend = () => setOn(false);
      r.onerror = () => setOn(false);
      rec.current = r; r.start(); setOn(true);
    } catch { setOn(false); }
  };
  const stop = () => rec.current?.stop();
  return { supported: Boolean(Ctor), on, toggle, stop };
}

/** iMessage's send arrow as one filled shape, so nothing extra can show above or below it. */
function SendArrow() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="currentColor" style={{ display: "block" }}>
      <path d="M12 3.6c.45 0 .88.18 1.2.5l5.9 5.9a1.55 1.55 0 0 1-2.2 2.2l-3.35-3.35v10.2a1.55 1.55 0 0 1-3.1 0V8.85L7.1 12.2a1.55 1.55 0 0 1-2.2-2.2l5.9-5.9c.32-.32.75-.5 1.2-.5Z" />
    </svg>
  );
}

const HINTS: Record<string, string> = {
  followUp: "Reply YES or NO",
  remindAsk: "Reply YES or NO",
  start: "Type JOIN",
  askName: "Type your first name",
  askPay: "Type a day, like 15",
  askLoans: "Tap + to attach your file",
};

export function Phone({ api, fullscreen }: { api: FirstBillApi; fullscreen?: boolean }) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // No custom dictation: like iMessage, the keyboard's own mic does it (and iOS shows no extra start/stop notices).
  // Dictation: tap to start/stop, or press and hold to talk. Falls back to opening the keyboard (its own mic) where unsupported.
  const dict = useDictation((t) => setDraft(t));
  const mic = { on: dict.on, supported: true, toggle: () => (dict.supported ? dict.toggle() : input.current?.focus()) };
  const holdMic = useRef<{ t: number; held: boolean } | null>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [tapbacks, setTapbacks] = useState<Record<string, string>>({});
  const press = useRef<{ t: number; x: number; y: number; fired: boolean } | null>(null);
  useEffect(() => {
    if (!api.msgs.length) setTapbacks({});
  }, [api.msgs.length]);

  const startPress = (e: React.PointerEvent) => {
    const row = (e.target as HTMLElement).closest("[data-msg]") as HTMLElement | null;
    if (!row) return;
    const x = e.clientX;
    const y = e.clientY;
    const t = window.setTimeout(() => {
      const bubble = (row.firstElementChild as HTMLElement | null) ?? row;
      const root = rootRef.current?.getBoundingClientRect();
      const r = bubble.getBoundingClientRect();
      const m = api.msgs.find((x) => x.id === row.dataset.msg);
      if (!root || !m || m.kind === "divider") return;
      const k = root.width / (rootRef.current?.offsetWidth || root.width); // the phone can be scaled (desktop frame, promo)
      if (press.current) press.current.fired = true;
      const text = m.kind === "text" || m.kind === "draft" ? m.text : m.kind === "link" ? `${m.title} (${m.url})` : m.kind === "file" ? m.name : m.kind === "notice" ? m.text : bubble.innerText;
      navigator.vibrate?.(10);
      setHeld({ id: m.id, me: "from" in m && m.from === "me", text, html: bubble.outerHTML.replace(/tail-(me|bot)/g, "").replace(/max-w-\[75%\]/g, ""), top: (r.top - root.top) / k, left: (r.left - root.left) / k, width: r.width / k, height: r.height / k });
    }, 420);
    press.current = { t, x, y, fired: false };
  };
  const movePress = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
      clearTimeout(p.t);
      press.current = null;
    }
  };
  const endPress = () => {
    const p = press.current;
    if (p && !p.fired) {
      clearTimeout(p.t);
      press.current = null;
    }
  };

  // Like iMessage: follow new texts only if you're already at the bottom. Scrolled up? Show a "New message" pill instead.
  const stick = useRef(true);
  const progUntil = useRef(0);
  const prevLen = useRef(0);
  const [pill, setPill] = useState(false);
  const toBottom = (smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    progUntil.current = Date.now() + 700;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    stick.current = true;
    setPill(false);
  };
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      stick.current = true;
      setPill(false);
    } else if (Date.now() > progUntil.current) stick.current = false;
  };
  const userScroll = () => {
    progUntil.current = 0;
  };
  useEffect(() => {
    const grew = api.msgs.length > prevLen.current;
    prevLen.current = api.msgs.length;
    if (!api.msgs.length) {
      stick.current = true;
      setPill(false);
      return;
    }
    const last = api.msgs[api.msgs.length - 1];
    const mine = last && "from" in last && last.from === "me";
    if (stick.current || (grew && mine)) toBottom();
    else if (grew) setPill(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.msgs.length, api.typing, api.chips.length]);
  const [listOpen, setListOpen] = useState(false);
  const lastBotText = [...api.msgs].reverse().find((m) => m.kind === "text" && m.from === "bot") as { text: string } | undefined;

  const submit = () => {
    if (!draft.trim()) return;
    void api.send(draft);
    setDraft("");
  };

  const lastMine = [...api.msgs].reverse().find((m) => m.kind !== "divider" && "from" in m && m.from === "me");
  const lastIsMine = api.msgs.length > 0 && api.msgs[api.msgs.length - 1] === lastMine && !api.typing;

  return (
    <div className={cn("phone-frame relative mx-auto w-full", fullscreen ? "h-full" : "max-w-[402px] sm:rounded-[58px] sm:bg-bezel sm:p-[11px] sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]")}>
      <div ref={rootRef} className={cn("relative flex flex-col overflow-hidden bg-ph-bg font-ios text-ph-ink", fullscreen ? "h-full" : "h-[min(820px,86dvh)] min-h-[600px] rounded-[28px] sm:h-[min(820px,calc(100dvh-64px))] sm:rounded-[48px]")}>
        {!fullscreen && (
          <>
            {/* dynamic island */}
            <div className="absolute left-1/2 top-[11px] z-50 hidden h-[30px] w-[110px] -translate-x-1/2 rounded-full bg-black sm:block" aria-hidden />
            <StatusBar />
          </>
        )}
        {api.banner && <NotificationBanner title={api.banner.title} body={api.banner.body} full={fullscreen} />}
        <Header name={api.contactName} full={fullscreen} onReset={() => api.reset()} onBack={() => setListOpen(true)} />
        {listOpen && <MessagesList full={fullscreen} last={lastBotText} onOpen={() => setListOpen(false)} />}

        <div
          ref={scroller}
          className="no-scrollbar flex-1 overflow-y-auto pt-3"
          aria-live="polite"
          onScroll={onScroll}
          onWheel={userScroll}
          onTouchStart={userScroll}
          onPointerDown={startPress}
          onPointerMove={movePress}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onContextMenu={(e) => e.preventDefault()}
          onClickCapture={(e) => {
            if (press.current?.fired) {
              e.preventDefault();
              e.stopPropagation();
              press.current = null;
            }
          }}
        >
          {api.msgs.length === 0 && (
            <div className="mx-6 mt-10 text-center text-ph-sub">
              <PayPingMark className="mx-auto mb-3 h-16 w-16" />
              <p className="text-[17px] font-semibold text-ph-ink">Text JOIN to start</p>
              <p className="mt-6 text-[11px] text-ph-sub/70">Updated {new Date(__BUILD__).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
              <p className="mt-1 text-[14px] leading-snug">PayPing texts you before a student loan bill goes wrong. No app.</p>
            </div>
          )}
          {api.msgs.map((m, i) => (
            <Row key={m.id} m={m} next={api.msgs[i + 1]} api={api} onFile={() => setFileOpen(true)} tapback={tapbacks[m.id]} />
          ))}
          {lastIsMine && <div className="-mt-1 px-4 pb-2 text-right text-[11px] text-ph-sub">Delivered</div>}
          {api.typing && <Typing />}
          <div className="h-2" />
        </div>
        {pill && (
          <div className="relative z-20 h-0">
            <button
              type="button"
              onClick={() => toBottom()}
              className="absolute -top-12 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ph-bar px-3 py-1.5 text-[13px] font-semibold text-ph-out shadow-md backdrop-blur"
            >
              New message ↓
            </button>
          </div>
        )}

        {api.chips.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2 pt-1">
            {api.chips.map((c) => (
              <button
                key={c.label}
                type="button"
                data-chip
                onClick={c.onPick}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-semibold transition-transform active:scale-95",
                  c.primary ? "border-ph-out bg-ph-out text-ph-out-ink" : "border-ph-sep bg-ph-bg text-ph-out",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <form
          className={cn("flex items-end gap-2 bg-ph-bg px-2 pt-1.5", fullscreen ? "pb-[max(8px,env(safe-area-inset-bottom))]" : "pb-7 sm:pb-8")}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <button
            type="button"
            onClick={() => (api.stage === "askLoans" ? void api.attachAid() : api.stage === "askBank" ? api.openPlaid() : void api.forwardNotice())}
            className={cn("mb-[1px] grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full", api.stage === "askLoans" ? "bg-ph-out text-ph-out-ink" : "bg-ph-in text-ph-sub")}
            aria-label={api.stage === "askLoans" ? "Attach your aid file" : "Forward a sample notice"}
          >
            <Plus className="h-[20px] w-[20px]" strokeWidth={2.4} />
          </button>
          <div className="flex min-h-[36px] flex-1 items-end rounded-[18px] border border-ph-sep bg-ph-bg pl-3 pr-[3px]">
            <label htmlFor="fb-composer" className="sr-only">
              Text message
            </label>
            <textarea
              id="fb-composer"
              ref={input}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={mic.on ? "Listening…" : HINTS[api.stage] ?? "iMessage"}
              className="max-h-28 min-h-[34px] flex-1 resize-none bg-transparent py-[6px] text-[17px] leading-[22px] tracking-[-0.41px] text-ph-ink outline-none placeholder:text-ph-sub"
            />
            {draft.trim() && !mic.on ? (
              <button
                type="submit"
                disabled={api.busy}
                className="mb-[3px] grid h-[29px] w-[46px] shrink-0 place-items-center rounded-full bg-ph-out text-ph-out-ink transition-opacity disabled:opacity-30"
                aria-label="Send"
              >
                <SendArrow />
              </button>
            ) : mic.supported ? (
              <button
                type="button"
                onPointerDown={() => {
                  const wasOn = dict.on;
                  if (!wasOn) mic.toggle();
                  holdMic.current = { t: Date.now(), held: !wasOn };
                }}
                onPointerUp={() => {
                  const h = holdMic.current;
                  holdMic.current = null;
                  if (!h) return;
                  if (!h.held) dict.stop(); // tap while listening: stop
                  else if (Date.now() - h.t > 450) dict.stop(); // press and hold: stop on release
                }}
                onContextMenu={(e) => e.preventDefault()}
                className={cn("mb-[3px] grid h-[29px] w-[29px] shrink-0 place-items-center rounded-full", mic.on ? "mic-live bg-[#ff3b30] text-white" : "text-ph-sub")}
                aria-label={mic.on ? "Stop dictation" : "Dictate (tap, or press and hold)"}
              >
                <AudioLines className="h-[19px] w-[19px]" />
              </button>
            ) : (
              <button type="submit" disabled className="mb-[3px] grid h-[29px] w-[46px] shrink-0 place-items-center rounded-full bg-ph-out text-ph-out-ink opacity-30" aria-label="Send">
                <SendArrow />
              </button>
            )}
          </div>
        </form>
        {!fullscreen && <div className="pointer-events-none absolute bottom-2 left-1/2 h-[5px] w-32 -translate-x-1/2 rounded-full bg-ph-ink opacity-80" aria-hidden />}

        {held && (
          <HoldMenu
            held={held}
            areaHeight={rootRef.current?.clientHeight ?? 700}
            onClose={() => setHeld(null)}
            onTapback={(t) => {
              setTapbacks((prev) => ({ ...prev, [held.id]: prev[held.id] === t ? "" : t }));
              setHeld(null);
            }}
            onReply={() => {
              setHeld(null);
              input.current?.focus();
            }}
          />
        )}
        {fileOpen && <AidFileSheet profile={api.profile} onClose={() => setFileOpen(false)} />}
        {api.plaidOpen && <PlaidSheet onClose={() => api.setPlaidOpen(false)} onDone={() => void api.plaidDone()} />}
      </div>
    </div>
  );
}
