import { useState } from "react";
import { AlertTriangle, Check, Clock, Copy, FileText, GraduationCap, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtShort, fromISO, money, type Alert, type Profile } from "@/lib/firstbill/data";

/** Gray "incoming" card that sits in the thread like an iMessage rich bubble. */
function BotCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-[82%] max-w-[300px] overflow-hidden rounded-[18px] border border-ph-sep bg-ph-card text-ph-ink shadow-sm", className)}>
      {children}
    </div>
  );
}

export function LinkCard({ title, url, onOpen, brand = "firstbill" }: { title: string; url: string; onOpen: () => void; brand?: "firstbill" | "studentaid" | "plaid" }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-[72%] min-w-[230px] max-w-[270px] shrink-0 overflow-hidden rounded-[18px] bg-ph-in text-left text-ph-in-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ph-out"
    >
      {brand === "studentaid" ? (
        <div className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-1.5 bg-[#12355b] text-white">
          <GraduationCap className="h-9 w-9 opacity-90" />
          <span className="text-[15px] font-bold tracking-tight">Federal Student Aid</span>
          <span className="text-[11px] opacity-75">My Aid · Download My Aid Data</span>
        </div>
      ) : brand === "plaid" ? (
        <div className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-2 bg-[#f2f3f5] text-black">
          <PlaidLogo className="h-8" />
          <span className="text-[12px] font-medium text-[#555]">Read-only. Can't move money.</span>
        </div>
      ) : (
        <div className="flex aspect-[1.91/1] w-full items-center justify-center gap-2 bg-[#0E7A55] text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 font-display text-lg font-bold">P</span>
          <span className="font-display text-xl font-bold tracking-tight">PayPing</span>
        </div>
      )}
      <div className="px-3 pb-2.5 pt-2">
        <div className="line-clamp-2 text-[15px] font-semibold leading-[19px]">{title}</div>
        <div className="mt-0.5 text-[13px] leading-4 text-ph-sub">{url}</div>
      </div>
    </button>
  );
}

const TILES = [-1, 0, 1];

/** Plaid's tartan-style mark and wordmark, drawn inline so the page needs no outside image. */
/** PayPing's mark: a green chat bubble with a white P and a "new message" dot. */
export function PayPingMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="PayPing">
      <path d="M50 14C27.4 14 10 29.2 10 48c0 10 4.9 18.9 12.8 25.1-.9 5.8-3.8 10.8-8.6 14.9 8.6.2 16.3-2.6 21.9-6.9 4.4 1.3 9.1 1.9 13.9 1.9 22.6 0 40-15.2 40-35S72.6 14 50 14Z" fill="#0E7A55" />
      <text x="50" y="49.5" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="44" fontWeight="800" fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif">P</text>
      <circle cx="81" cy="20" r="11.5" fill="#34C759" stroke="#fff" strokeWidth="4.5" />
    </svg>
  );
}

export function PlaidLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 142 48" className={className} role="img" aria-label="Plaid" fill="currentColor">
      <g transform="translate(24 24) rotate(45)">
        {TILES.flatMap((r) =>
          TILES.map((c) => <rect key={`${r}${c}`} x={c * 10 - 4.2} y={r * 10 - 4.2} width="8.4" height="8.4" rx="1.6" opacity={(r + c) % 2 === 0 ? 1 : 0.55} />),
        )}
      </g>
      <text x="50" y="33" fontFamily="system-ui, -apple-system, Helvetica, Arial, sans-serif" fontSize="25" fontWeight="800" letterSpacing="1.5">PLAID</text>
    </svg>
  );
}

export function TimelineCard({ alert, profile }: { alert: Alert; profile: Profile }) {
  return (
    <BotCard>
      <div className="flex items-center gap-2 border-b border-ph-sep px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-ph-sub">
        <Landmark className="h-3.5 w-3.5" /> Checking ••{profile.checkingLast4} · before payday
      </div>
      <ul className="divide-y divide-ph-sep text-[14px] tabular-nums">
        <li className="flex items-center justify-between px-3 py-1.5">
          <span className="text-ph-sub">Today</span>
          <span className="font-semibold">{money(profile.balance)}</span>
        </li>
        {alert.rows.map((r) => {
          const neg = r.after < 0;
          return (
            <li key={r.label} className={cn("grid grid-cols-[1fr_auto] gap-x-2 px-3 py-1.5", neg && "bg-[var(--danger-soft)]")}>
              <span className="min-w-0 truncate">
                <span className="text-ph-sub">{fmtShort(r.date)}</span> {r.label}
              </span>
              <span className="text-right">{money(r.amount)}</span>
              <span className={cn("col-span-2 text-right text-[12px]", neg ? "font-semibold text-[var(--danger)]" : "text-ph-sub")}>
                {neg ? "Overdraft: " : "Left: "}
                {money(r.after)}
              </span>
            </li>
          );
        })}
        <li className="flex items-center justify-between px-3 py-1.5 text-[var(--ok)]">
          <span>
            <span className="opacity-80">{fmtShort(profile.payday)}</span> Payday
          </span>
          <span className="font-semibold">+{money(profile.paycheck)}</span>
        </li>
      </ul>
      <div className="px-3 py-1.5 text-[11px] text-ph-sub">Plaid sandbox data, read-only</div>
    </BotCard>
  );
}

export function ClockCard({ daysLeft, lateToday, threshold, hitDate, federal }: { daysLeft: number; lateToday: number; threshold: number; hitDate: string; federal: boolean }) {
  const pct = Math.min(100, Math.max(4, (lateToday / threshold) * 100));
  const past = daysLeft <= 0;
  return (
    <BotCard>
      <div className="flex items-center gap-2 px-3 pt-3 text-[12px] font-semibold uppercase tracking-wide text-ph-sub">
        <Clock className="h-3.5 w-3.5" /> Credit clock
      </div>
      <div className="px-3 pb-3">
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className={cn("font-display text-4xl font-bold tabular-nums", past ? "text-[var(--danger)]" : "text-[var(--warn)]")}>{past ? 0 : daysLeft}</span>
          <span className="text-[15px] font-semibold">days left</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ph-in" role="img" aria-label={`${lateToday} of ${threshold} days late`}>
          <div className={cn("h-full rounded-full", past ? "bg-[var(--danger)]" : "bg-[var(--warn)]")} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-ph-sub">
          <span>{lateToday} days late now</span>
          <span>reported at {threshold}</span>
        </div>
        <p className="mt-2 text-[14px] leading-snug">
          {past
            ? "This can already show up on your credit report. Acting now still stops it from getting worse."
            : `${federal ? "Federal loans are reported to credit bureaus" : "Most lenders can report it"} at ${threshold} days late. For you that's ${fmtShort(fromISO(hitDate))} if nothing changes.`}
        </p>
      </div>
    </BotCard>
  );
}

export function BankCard({ amount, balance, last4, payday }: { amount: number; balance: number; last4: string; payday: string }) {
  const short = amount - balance;
  const over = short > 0;
  return (
    <BotCard className={over ? "border-[var(--danger)]/40" : undefined}>
      <div className="flex items-start gap-2 px-3 py-3">
        {over ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok)]" />}
        <div className="min-w-0 text-[14px] leading-snug">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-ph-sub">Bank check · ••{last4}</div>
          {over ? (
            <p className="mt-1">
              Paying all <b className="tabular-nums">{money(amount)}</b> today would overdraft you by{" "}
              <b className="tabular-nums text-[var(--danger)]">{money(short)}</b> before your {payday} paycheck. Don't pay it all right now.
            </p>
          ) : (
            <p className="mt-1">
              You can cover <b className="tabular-nums">{money(amount)}</b> and still have <b className="tabular-nums">{money(-short)}</b> until {payday}.
            </p>
          )}
        </div>
      </div>
    </BotCard>
  );
}

export function DraftCard({ to, text }: { to: string; text: string }) {
  const [copied, setCopied] = useState<"idle" | "done" | "select">("idle");
  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const box = (e.currentTarget.closest("[data-draft]") as HTMLElement | null)?.querySelector("p");
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      if (box) {
        const r = document.createRange();
        r.selectNodeContents(box);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
      setCopied("select");
    }
    setTimeout(() => setCopied("idle"), 2200);
  };
  return (
    <BotCard>
      <div data-draft>
        <div className="flex items-center gap-2 border-b border-ph-sep px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-ph-sub">
          <FileText className="h-3.5 w-3.5" /> Draft for you to send · {to}
        </div>
        <p className="whitespace-pre-wrap px-3 py-2 text-[14px] leading-snug">{text}</p>
        <div className="flex items-center justify-between gap-2 border-t border-ph-sep px-3 py-2">
          <span className="text-[11px] text-ph-sub">You send it. PayPing never logs in.</span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-full bg-ph-out px-3 py-1 text-[13px] font-semibold text-ph-out-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ph-out"
          >
            {copied === "done" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "done" ? "Copied" : copied === "select" ? "Selected" : "Copy"}
          </button>
        </div>
      </div>
    </BotCard>
  );
}

export function NoticeAttachment({ title, servicer, text }: { title: string; servicer: string; text: string }) {
  return (
    <div className="w-[74%] max-w-[270px] overflow-hidden rounded-[18px] border border-ph-sep bg-white text-black shadow-sm">
      <div className="relative max-h-[150px] overflow-hidden px-3 pb-2 pt-3 font-serif text-[10.5px] leading-[1.35]">
        <div className="mb-1 font-sans text-[11px] font-bold tracking-wide text-[#1d3557]">{servicer.toUpperCase()}</div>
        <div className="whitespace-pre-wrap text-[#333]">{text.split("\n").slice(1).join("\n")}</div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
      </div>
      <div className="flex items-center gap-2 border-t border-[#ddd] bg-[#f6f6f6] px-3 py-1.5 text-[12px] text-[#555]">
        <FileText className="h-3.5 w-3.5" />
        <span className="truncate">{title}.pdf</span>
      </div>
    </div>
  );
}
