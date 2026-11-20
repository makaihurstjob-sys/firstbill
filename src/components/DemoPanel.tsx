import { useState } from "react";
import { BellRing, FileText, Play, RotateCcw, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FirstBillApi } from "@/hooks/useFirstBill";
import { cn } from "@/lib/utils";
import { fmtShort, money, standardPayment, totalBalance } from "@/lib/firstbill/data";

function AiStatus({ api }: { api: FirstBillApi }) {
  const label =
    api.aiMode === "checking"
      ? "Checking for Claude..."
      : api.aiMode === "none"
        ? "Claude not connected here, so it uses built-in answers"
        : api.aiMode === "artifact"
          ? "Claude connected through claude.ai"
          : "Claude connected through the Supabase function";
  const on = api.aiMode === "artifact" || api.aiMode === "supabase";
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <span className={cn("h-2 w-2 rounded-full", on ? "bg-ok" : "bg-muted")} />
            Live Claude for notices and questions
          </div>
          <p className="mt-1 text-[13px] text-muted">{label}</p>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center" htmlFor="fb-live">
          <input id="fb-live" type="checkbox" className="peer sr-only" checked={api.liveOn && on} disabled={!on} onChange={(e) => api.setLiveOn(e.target.checked)} />
          <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-brand peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-brand" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          <span className="sr-only">Use live Claude</span>
        </label>
      </div>
      {api.lastSource && (
        <p className="mt-2 text-[12px] text-muted">
          Last answer came from <b className="text-ink">{api.lastSource === "claude" ? "Claude, live" : "the built-in backup"}</b>.
        </p>
      )}
      <p className="mt-2 text-[12px] text-muted">The money math (dates, balances, overdraft) is plain code, never the AI, so the numbers can't be made up.</p>
    </div>
  );
}

export function DemoPanel({ api }: { api: FirstBillApi }) {
  const [paste, setPaste] = useState("");
  const p = api.profile;

  return (
    <aside className="flex min-w-0 flex-col gap-4">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Team Ambassadors · Oakwood University</div>
        <h1 className="mt-1 font-display text-[40px] font-bold leading-[1.02] tracking-tight sm:text-[48px]">FirstBill</h1>
        <p className="mt-2 max-w-[46ch] text-[16px] leading-relaxed text-muted">
          A texting assistant for new and first-gen grads. It watches your student loans and your bank, texts you <i>before</i> a bill goes wrong, and drafts the fix you approve with one word: YES.
        </p>
        <p className="mt-3 max-w-[46ch] border-l-2 border-brand pl-3 font-display text-[18px] font-semibold leading-snug">ChatGPT answers questions. FirstBill catches the ones you didn't know to ask.</p>
      </div>

      <div className="grid gap-2 rounded-2xl border border-line bg-panel p-4">
        <div className="text-[13px] font-semibold">Run the demo</div>
        {api.autoplaying ? (
          <Button onClick={api.stopAuto} variant="outline">
            <Square /> Stop auto-play
          </Button>
        ) : (
          <Button onClick={() => void api.playAll()} size="lg">
            <Play /> Play full demo, hands-free (about 40 s)
          </Button>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => void api.jumpToHeadsUp()}>
            <BellRing /> Skip to the heads-up text
          </Button>
          <Button variant="outline" onClick={() => void api.forwardNotice()}>
            <FileText /> Example 2: forward a notice
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => api.reset()} className="justify-self-start">
          <RotateCcw /> Start over
        </Button>
      </div>

      <AiStatus api={api} />

      <div className="rounded-2xl border border-line bg-panel p-4">
        <div className="text-[13px] font-semibold">Sandbox data FirstBill watches</div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px] tabular-nums">
          <dt className="text-muted">Loans (StudentAid.gov file)</dt>
          <dd>
            {money(totalBalance(p)).replace(".00", "")} federal, avg {p.loans[0].rate}%, {money(standardPayment(p))}/mo
          </dd>
          <dt className="text-muted">Grace period ends</dt>
          <dd>{fmtShort(p.graceEnds)}</dd>
          <dt className="text-muted">First autopay</dt>
          <dd>{fmtShort(p.firstPull)}</dd>
          <dt className="text-muted">Bills before payday</dt>
          <dd>{p.upcoming.map((u) => `${u.label} ${money(u.amount).replace(".00", "")}`).join(", ")}</dd>
          <dt className="text-muted">Payday</dt>
          <dd>
            {fmtShort(p.payday)}, {money(p.paycheck).replace(".00", "")}
          </dd>
        </dl>
        <label htmlFor="fb-balance" className="mt-3 grid gap-1 text-[13px] font-semibold">
          Checking balance today (Plaid sandbox)
          <span className="flex items-center gap-2">
            <span className="text-muted">$</span>
            <input
              id="fb-balance"
              type="number"
              step="0.01"
              min="0"
              value={api.balance}
              onChange={(e) => api.changeBalance(Number(e.target.value) || 0)}
              className="h-9 w-32 rounded-lg border border-line bg-page px-2 text-[14px] font-normal tabular-nums text-ink outline-none focus:border-brand"
            />
            <span className="text-[12px] font-normal text-muted">Change it, then skip to the heads-up text.</span>
          </span>
        </label>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4">
        <label htmlFor="fb-paste" className="flex items-center gap-2 text-[13px] font-semibold">
          <Sparkles className="h-4 w-4 text-brand" /> Paste any real loan or bill notice
        </label>
        <textarea
          id="fb-paste"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder="Paste the email, letter or text from your servicer. Claude decodes it in the thread."
          className="mt-2 w-full resize-y rounded-xl border border-line bg-page p-3 text-[14px] text-ink outline-none focus:border-brand"
        />
        <Button
          className="mt-2"
          size="sm"
          disabled={!paste.trim() || api.busy}
          onClick={() => {
            void api.pasteNotice(paste);
            setPaste("");
          }}
        >
          Send to FirstBill
        </Button>
      </div>

      <ul className="grid gap-1 text-[13px] text-muted">
        <li>Free for users. No fees, no ads, data never sold.</li>
        <li>Never logs in or moves money. You send every message yourself.</li>
        <li>Not a budgeting app: no charts or categories, just the next right move.</li>
        <li>Education, not financial advice. All data here is sandbox data.</li>
      </ul>
    </aside>
  );
}
