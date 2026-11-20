import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, FileDown, Landmark, Loader2, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SignupInfo } from "@/hooks/useFirstBill";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Step = "idle" | "loading" | "done";

/** The one-page mobile signup that the JOIN text links to. Opens over the thread like Safari. */
export function SignupSheet({ open, onClose, onDone, autofill }: { open: boolean; onClose: () => void; onDone: (i: SignupInfo) => void; autofill: number }) {
  const [name, setName] = useState("");
  const [payday, setPayday] = useState("18");
  const [loans, setLoans] = useState<Step>("idle");
  const [bank, setBank] = useState<Step>("idle");
  const [plaidOpen, setPlaidOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [auto, setAuto] = useState(false);
  const lastAuto = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const submitted = useRef(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setPayday("18");
      setLoans("idle");
      setBank("idle");
      setPlaidOpen(false);
      setConsent(false);
      setAuto(false);
    } else {
      submitted.current = false;
    }
  }, [open]);


  const addLoans = async () => {
    setLoans("loading");
    await sleep(900);
    setLoans("done");
  };
  const connectBank = async () => {
    setPlaidOpen(false);
    setBank("loading");
    await sleep(900);
    setBank("done");
  };

  const ready = name.trim().length > 0 && loans === "done" && bank === "done" && consent;
  const finish = (info: SignupInfo) => {
    if (submitted.current) return;
    submitted.current = true;
    onDoneRef.current(info);
  };
  const submit = () => {
    if (!ready) return;
    finish({ firstName: name.trim(), paydayDom: Number(payday) });
  };

  // Hands-free fill for screen recordings.
  useEffect(() => {
    if (!open || !autofill || autofill === lastAuto.current) return;
    lastAuto.current = autofill;
    setAuto(true);
    let cancelled = false;
    const step = async (ms: number) => {
      await sleep(ms);
      return !cancelled;
    };
    (async () => {
      const full = "Tariq";
      for (let i = 1; i <= full.length; i++) {
        setName(full.slice(0, i));
        if (!(await step(110))) return;
      }
      if (!(await step(350))) return;
      setPayday("18");
      if (!(await step(350))) return;
      setLoans("loading");
      if (!(await step(900))) return;
      setLoans("done");
      if (!(await step(400))) return;
      setPlaidOpen(true);
      if (!(await step(1300))) return;
      setPlaidOpen(false);
      setBank("loading");
      if (!(await step(800))) return;
      setBank("done");
      if (!(await step(400))) return;
      setConsent(true);
      if (!(await step(700))) return;
      finish({ firstName: full, paydayDom: 18 });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofill, open]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-ph-bg text-ph-ink animate-in slide-in-from-bottom-8 fade-in duration-300" role="dialog" aria-label="FirstBill setup">
      {/* Safari-style top bar */}
      <div className="flex items-center gap-2 border-b border-ph-sep bg-ph-bar px-3 pb-2 pt-12">
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ph-out" aria-label="Close setup">
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-ph-in px-3 py-1.5 text-[14px] text-ph-in-ink">
          <Lock className="h-3 w-3 text-ph-sub" /> firstbill.app
        </div>
        <span className="w-8" />
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0b6b52] font-display text-sm font-bold text-white">FB</span>
          <div>
            <h2 className="font-display text-[22px] font-bold leading-tight">Set up FirstBill</h2>
            <p className="text-[13px] text-ph-sub">About 60 seconds. After this, it's all texts.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1 text-[13px] font-semibold" htmlFor="fb-name">
            First name
            <input
              id="fb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should I call you?"
              autoComplete="given-name"
              className="h-11 rounded-xl border border-ph-sep bg-ph-field px-3 text-[16px] font-normal text-ph-ink outline-none focus:border-ph-out"
            />
          </label>

          <label className="grid gap-1 text-[13px] font-semibold" htmlFor="fb-payday">
            When do you get paid?
            <select
              id="fb-payday"
              value={payday}
              onChange={(e) => setPayday(e.target.value)}
              className="h-11 rounded-xl border border-ph-sep bg-ph-field px-3 text-[16px] font-normal text-ph-ink outline-none focus:border-ph-out"
            >
              <option value="18">The 18th of each month</option>
              <option value="1">The 1st of each month</option>
              <option value="15">The 15th of each month</option>
            </select>
          </label>

          <div className="grid gap-1">
            <span className="text-[13px] font-semibold">Your student loans</span>
            <button
              type="button"
              onClick={addLoans}
              disabled={loans !== "idle"}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-[14px]",
                loans === "done" ? "border-[var(--ok)] bg-[var(--ok-soft)]" : "border-ph-sep bg-ph-field",
              )}
            >
              {loans === "loading" ? <Loader2 className="h-5 w-5 animate-spin text-ph-sub" /> : loans === "done" ? <Check className="h-5 w-5 text-[var(--ok)]" /> : <FileDown className="h-5 w-5 text-ph-out" />}
              <span className="min-w-0">
                {loans === "done" ? (
                  <>
                    <b>2 federal loans · $28,600</b>
                    <span className="block text-[12px] text-ph-sub">Meridian Loan Servicing · grace period ends soon</span>
                  </>
                ) : (
                  <>
                    <b>Add my StudentAid.gov loan file</b>
                    <span className="block text-[12px] text-ph-sub">The "Download My Aid Data" file. Sandbox in this demo.</span>
                  </>
                )}
              </span>
            </button>
          </div>

          <div className="grid gap-1">
            <span className="text-[13px] font-semibold">Your bank (read-only)</span>
            <button
              type="button"
              onClick={() => setPlaidOpen(true)}
              disabled={bank !== "idle"}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-[14px]",
                bank === "done" ? "border-[var(--ok)] bg-[var(--ok-soft)]" : "border-ph-sep bg-ph-field",
              )}
            >
              {bank === "loading" ? <Loader2 className="h-5 w-5 animate-spin text-ph-sub" /> : bank === "done" ? <Check className="h-5 w-5 text-[var(--ok)]" /> : <Landmark className="h-5 w-5 text-ph-out" />}
              <span className="min-w-0">
                {bank === "done" ? (
                  <>
                    <b>Checking ••6602 connected</b>
                    <span className="block text-[12px] text-ph-sub">Balances and upcoming bills only. Can't move money.</span>
                  </>
                ) : (
                  <>
                    <b>Connect with Plaid</b>
                    <span className="block text-[12px] text-ph-sub">So I can warn you before an overdraft.</span>
                  </>
                )}
              </span>
            </button>
          </div>

          <label className="flex items-start gap-3 text-[13px] leading-snug" htmlFor="fb-consent">
            <input id="fb-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#0a7cff]" />
            <span>Text me about my loans and bills. No fees, no ads, and my data is never sold. Reply STOP anytime.</span>
          </label>

          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            className="h-12 rounded-2xl bg-ph-out text-[16px] font-semibold text-ph-out-ink transition-opacity disabled:opacity-40"
          >
            Start texting me
          </button>
          {auto && <p className="text-center text-[11px] text-ph-sub">Demo is filling this in for you</p>}
        </div>
      </div>

      {plaidOpen && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/40" role="dialog" aria-label="Connect your bank">
          <div className="w-full rounded-t-3xl bg-white p-5 text-black animate-in slide-in-from-bottom-10 duration-200">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setPlaidOpen(false)} className="grid h-8 w-8 place-items-center" aria-label="Back">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-[13px] font-bold tracking-wide">PLAID · SANDBOX</span>
              <span className="w-8" />
            </div>
            <p className="mt-3 text-[15px] font-semibold">FirstBill wants read-only access to your balances and upcoming bills.</p>
            <button type="button" onClick={connectBank} className="mt-4 flex w-full items-center gap-3 rounded-xl border border-[#ddd] px-3 py-3 text-left">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f0fe] text-[13px] font-bold text-[#1a56db]">FP</span>
              <span>
                <b className="text-[14px]">First Platypus Bank</b>
                <span className="block text-[12px] text-[#666]">Plaid's test bank · Checking ••6602</span>
              </span>
            </button>
            <button type="button" onClick={connectBank} className="mt-4 h-11 w-full rounded-xl bg-black text-[15px] font-semibold text-white">
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
