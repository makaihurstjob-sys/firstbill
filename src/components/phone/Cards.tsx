import { useState } from "react";
import { AlertTriangle, Check, Clock, Copy, FileText, Landmark, Link2 } from "lucide-react";
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

export function LinkCard({ title, url, onOpen }: { title: string; url: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-[78%] max-w-[280px] overflow-hidden rounded-[18px] bg-ph-in text-left text-ph-in-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ph-out"
    >
      <div className="flex h-24 items-center justify-center gap-2 bg-[#0b6b52] text-white">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 font-display text-lg font-bold">FB</span>
        <span className="font-display text-xl font-bold tracking-tight">FirstBill</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-[15px] font-semibold leading-snug">{title}</div>
        <div className="flex items-center gap-1 text-[13px] text-ph-sub">
          <Link2 className="h-3 w-3" /> {url}
        </div>
      </div>
    </button>
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
            : `${federal ? "Federal loans" : "Private lenders"} report to credit bureaus at ${threshold} days late. For you that's ${fmtShort(fromISO(hitDate))} if nothing changes.`}
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
          <span className="text-[11px] text-ph-sub">You send it. FirstBill never logs in.</span>
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
