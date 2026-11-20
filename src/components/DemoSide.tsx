import { Check, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FirstBillApi } from "@/hooks/useFirstBill";
import { cn } from "@/lib/utils";

/** The story, one short line per step, so judges always know what they're looking at. */
const STEPS = [
  { t: "Text JOIN", d: "No app and no signup form. Just a text." },
  { t: "Name and payday", d: "Payday is the key to everything." },
  { t: "Send the loan file", d: "The free file from StudentAid.gov: 2 loans, $28,600." },
  { t: "Link the bank, read-only", d: "Plaid sandbox. PayPing can see bills, never move money." },
  { t: "PayPing texts first", d: "The first loan payment would leave them $23.21 short on Dec 11." },
  { t: "One fix, approved with YES", d: "It writes the due-date request. The grad sends it." },
  { t: "It checks back in", d: "Dec 1: did Meridian confirm the 20th?" },
  { t: "Payday: pay it off sooner", d: "$25 a month saves $891. The math is code, not AI." },
  { t: "Short on cash? Pay This First", d: "Lights, food and rent first. The federal loan can wait." },
];

function stepOf(stage: string, fu: string | null, due: string | null): number {
  switch (stage) {
    case "start":
    case "stopped":
      return 0;
    case "askName":
    case "askPay":
      return 1;
    case "askLoans":
      return 2;
    case "askBank":
    case "noBank":
      return 3;
    case "signedUp":
    case "alerted":
    case "covered":
      return 4;
    case "drafted":
      return due === "asked" ? 5 : 6;
    case "followUp":
      return fu === "triage" ? 8 : fu === "notice" ? -1 : 6;
    case "boost":
    case "remindAsk":
    case "boosted":
    case "wrapped":
      return 7;
    case "triageAsk":
    case "triageDone":
      return 8;
    default:
      return -1;
  }
}

export function DemoSide({ api }: { api: FirstBillApi }) {
  const now = stepOf(api.stage, api.fuKey, api.dueState);
  // Never step backwards on screen while one story is running.
  const best = useRef(0);
  if (api.msgs.length === 0) best.current = 0;
  if (now >= 0) best.current = Math.max(best.current, now);
  const cur = api.msgs.length === 0 ? 0 : now < 0 ? best.current : best.current;
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cur]);

  return (
    <aside className="w-full max-w-[300px] text-white">
      <div className="flex flex-col gap-2.5">
        {api.autoplaying ? (
          <button
            type="button"
            onClick={api.stopAuto}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-white/15 text-[16px] font-semibold text-white transition hover:bg-white/25"
          >
            <Square className="h-4 w-4 fill-current" /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void api.playAll()}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-black transition hover:bg-white/90"
          >
            <Play className="h-4 w-4 fill-current" /> Play automatically
          </button>
        )}
        <button
          type="button"
          onClick={() => api.reset()}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#FF3B30] text-[16px] font-semibold text-white transition hover:bg-[#ff5147]"
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
        <p className="px-1 text-center text-[12px] leading-4 text-white/45">Or tap through it yourself in the phone.</p>
      </div>

      <div className="mt-7 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">What's happening</div>
        <ol ref={list} className="no-scrollbar max-h-[46vh] space-y-2.5 overflow-y-auto">
          {STEPS.map((s, i) => {
            const done = i < cur;
            const here = i === cur;
            return (
              <li key={s.t} data-current={here ? "" : undefined} className="flex gap-2.5">
                <span
                  className={cn(
                    "mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full",
                    done ? "bg-[#34C759] text-black" : here ? "bg-white" : "ring-1 ring-white/25",
                  )}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} /> : here ? <span className="h-2 w-2 animate-pulse rounded-full bg-[#34C759]" /> : null}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[14px] leading-[18px]", here ? "font-semibold text-white" : done ? "text-white/60" : "text-white/35")}>{s.t}</span>
                  {here && <span className="mt-0.5 block text-[12px] leading-4 text-white/60">{s.d}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
