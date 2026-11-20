import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, Plus, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FirstBillApi, Msg } from "@/hooks/useFirstBill";
import { BankCard, ClockCard, DraftCard, LinkCard, NoticeAttachment, TimelineCard } from "./Cards";
import { SignupSheet } from "./SignupSheet";

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

function Header({ name }: { name: string }) {
  const known = name === "FirstBill";
  return (
    <div className="relative z-10 border-b border-ph-sep bg-ph-bar pb-2 pt-12 backdrop-blur">
      <div className="flex items-start justify-between px-3">
        <span className="flex items-center text-[17px] text-ph-out">
          <ChevronLeft className="h-6 w-6" />
          <span className="-ml-1 rounded-full bg-ph-out px-1.5 text-[12px] font-semibold leading-5 text-ph-out-ink">3</span>
        </span>
        <div className="flex flex-col items-center">
          <span className={cn("grid h-11 w-11 place-items-center rounded-full text-[15px] font-bold text-white", known ? "bg-[#0b6b52]" : "bg-gradient-to-b from-[#a5abb6] to-[#858b96]")}>
            {known ? "FB" : "#"}
          </span>
          <span className="mt-0.5 text-[12px] text-ph-ink">
            {name} <span className="text-ph-sub">›</span>
          </span>
        </div>
        <Video className="mt-1 h-6 w-6 text-ph-out" />
      </div>
    </div>
  );
}

function NotificationBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="absolute inset-x-2 top-12 z-40 animate-banner-in rounded-[22px] border border-white/20 bg-[rgba(245,245,247,0.92)] p-3 text-black shadow-xl backdrop-blur-md">
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
  );
}

function Bubble({ from, text, tail }: { from: "me" | "bot"; text: string; tail: boolean }) {
  const me = from === "me";
  return (
    <div
      className={cn(
        "bubble max-w-[78%] whitespace-pre-wrap break-words rounded-[18px] px-3 py-[7px] text-[16px] leading-[1.3]",
        me ? "bg-ph-out text-ph-out-ink" : "bg-ph-in text-ph-in-ink",
        tail && (me ? "tail-me" : "tail-bot"),
      )}
    >
      {text}
    </div>
  );
}

function Row({ m, next, api }: { m: Msg; next?: Msg; api: FirstBillApi }) {
  if (m.kind === "divider") {
    return (
      <div className="py-2 text-center text-[11px] text-ph-sub">
        <b className="font-semibold">{m.text.split(" ")[0]}</b> {m.text.split(" ").slice(1).join(" ")}
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
      body = <Bubble from={from} text={m.text} tail={tail} />;
      break;
    case "notice":
      body = <NoticeAttachment title={m.title} servicer={m.servicer} text={m.text} />;
      break;
    case "link":
      body = <LinkCard title={m.title} url={m.url} onOpen={() => api.setSignupOpen(true)} />;
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
      body = <DraftCard to={m.to} text={m.text} />;
      break;
  }
  return <div className={cn("flex animate-bubble-in px-3", from === "me" ? "justify-end" : "justify-start", sameNext ? "pb-[2px]" : "pb-2")}>{body}</div>;
}

function Typing() {
  return (
    <div className="flex px-3 pb-2" aria-label="FirstBill is typing">
      <div className="bubble tail-bot flex items-center gap-1 rounded-[18px] bg-ph-in px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 animate-dot rounded-full bg-ph-sub" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  );
}

export function Phone({ api }: { api: FirstBillApi }) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [api.msgs.length, api.typing, api.chips.length]);

  const submit = () => {
    if (!draft.trim()) return;
    void api.send(draft);
    setDraft("");
  };

  const lastMine = [...api.msgs].reverse().find((m) => m.kind !== "divider" && "from" in m && m.from === "me");
  const lastIsMine = api.msgs.length > 0 && api.msgs[api.msgs.length - 1] === lastMine && !api.typing;

  return (
    <div className="phone-frame relative mx-auto w-full max-w-[402px] sm:rounded-[58px] sm:bg-bezel sm:p-[11px] sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]">
      <div className="relative flex h-[min(820px,86dvh)] min-h-[600px] flex-col overflow-hidden rounded-[28px] bg-ph-bg font-ios text-ph-ink sm:h-[min(820px,calc(100dvh-64px))] sm:rounded-[48px]">
        {/* dynamic island */}
        <div className="absolute left-1/2 top-[11px] z-50 hidden h-[30px] w-[110px] -translate-x-1/2 rounded-full bg-black sm:block" aria-hidden />
        <StatusBar />
        {api.banner && <NotificationBanner title={api.banner.title} body={api.banner.body} />}
        <Header name={api.contactName} />

        <div ref={scroller} className="no-scrollbar flex-1 overflow-y-auto pt-3" aria-live="polite">
          {api.msgs.length === 0 && (
            <div className="mx-6 mt-10 text-center text-ph-sub">
              <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-[#0b6b52] font-display text-2xl font-bold text-white">FB</div>
              <p className="text-[15px] font-semibold text-ph-ink">Text JOIN to 34778</p>
              <p className="mt-1 text-[13px] leading-snug">That's the whole signup start. FirstBill texts you before a student loan bill goes wrong. No app to download.</p>
            </div>
          )}
          {api.msgs.map((m, i) => (
            <Row key={m.id} m={m} next={api.msgs[i + 1]} api={api} />
          ))}
          {lastIsMine && <div className="-mt-1 px-4 pb-2 text-right text-[11px] text-ph-sub">Delivered</div>}
          {api.typing && <Typing />}
          <div className="h-2" />
        </div>

        {api.chips.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2 pt-1">
            {api.chips.map((c) => (
              <button
                key={c.label}
                type="button"
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
          className="flex items-end gap-2 border-t border-ph-sep bg-ph-bar px-2.5 pb-7 pt-2 sm:pb-8"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <button type="button" onClick={() => void api.forwardNotice()} className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ph-in text-ph-sub" aria-label="Forward a sample notice">
            <Plus className="h-5 w-5" />
          </button>
          <div className="flex min-h-[36px] flex-1 items-end rounded-[18px] border border-ph-sep bg-ph-bg pl-3 pr-1">
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
              placeholder="Text Message"
              className="max-h-28 min-h-[34px] flex-1 resize-none bg-transparent py-[7px] text-[16px] leading-5 text-ph-ink outline-none placeholder:text-ph-sub"
            />
            <button
              type="submit"
              disabled={!draft.trim() || api.busy}
              className="mb-[3px] grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ph-out text-ph-out-ink transition-opacity disabled:opacity-30"
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={3} />
            </button>
          </div>
        </form>
        <div className="pointer-events-none absolute bottom-2 left-1/2 h-[5px] w-32 -translate-x-1/2 rounded-full bg-ph-ink opacity-80" aria-hidden />

        <SignupSheet open={api.signupOpen} onClose={() => api.setSignupOpen(false)} onDone={api.onSignupDone} autofill={api.autofill} />
      </div>
    </div>
  );
}
