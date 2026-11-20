// Where FirstBill's Claude calls go. Tried in order:
// 1. claude.ai artifact runtime (window.claude "sample"), used by the hosted live demo
// 2. Supabase / Lovable Cloud edge function `firstbill-ai` (calls the Claude API with your key)
// 3. none, so the app uses its built-in backup answers and the demo never breaks
import {
  buildDecodePrompt,
  buildReplyPrompt,
  normalizeDecode,
  type ChatTurn,
  type Decode,
} from "../../../supabase/functions/_shared/firstbill-prompt";

export type AiMode = "artifact" | "supabase" | "none";

type SampleFn = ((input: string | ChatTurn[], opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: (input: string | ChatTurn[], opts?: Record<string, unknown>) => Promise<unknown>;
};

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

let samplePromise: Promise<SampleFn | null> | null = null;
function getSample(): Promise<SampleFn | null> {
  if (typeof window === "undefined" || !window.claude?.use) return Promise.resolve(null);
  samplePromise ??= window.claude.use("sample").then((s) => (s ? (s as SampleFn) : null)).catch(() => null);
  return samplePromise;
}

export async function detectAiMode(): Promise<AiMode> {
  if (await getSample()) return "artifact";
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      await callEdge({ mode: "ping" }, AbortSignal.timeout(5000));
      return "supabase";
    } catch {
      return "none";
    }
  }
  return "none";
}

async function callEdge<T>(body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/firstbill-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`edge ${res.status}`);
  return (await res.json()) as T;
}

export async function aiDecode(mode: AiMode, notice: string, todayISO: string, signal?: AbortSignal): Promise<Decode | null> {
  try {
    if (mode === "artifact") {
      const sample = await getSample();
      if (!sample) return null;
      const raw = await sample.json(buildDecodePrompt(notice.slice(0, 12000), todayISO), { modelTier: "quick", signal });
      return normalizeDecode(raw);
    }
    if (mode === "supabase") {
      const r = await callEdge<{ decode?: unknown }>({ mode: "decode", notice, today: todayISO }, signal);
      return normalizeDecode(r.decode);
    }
  } catch {
    /* fall through to the backup answer */
  }
  return null;
}

export async function aiReply(mode: AiMode, context: string, turns: ChatTurn[], signal?: AbortSignal): Promise<string | null> {
  try {
    if (mode === "artifact") {
      const sample = await getSample();
      if (!sample) return null;
      const r = await sample(buildReplyPrompt(context, turns), { modelTier: "quick", cache: false, signal });
      return r.text?.trim() || null;
    }
    if (mode === "supabase") {
      const r = await callEdge<{ text?: string }>({ mode: "reply", context, turns }, signal ?? AbortSignal.timeout(20000));
      return r.text?.trim() || null;
    }
  } catch {
    /* fall through */
  }
  return null;
}
