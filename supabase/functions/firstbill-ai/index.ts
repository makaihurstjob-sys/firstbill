// Supabase / Lovable Cloud edge function: the only place FirstBill talks to Claude.
// Deploy: supabase functions deploy firstbill-ai
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Optional: CLAUDE_MODEL (defaults to claude-opus-5-5)
//
// POST { mode: "decode", notice: string, today: "YYYY-MM-DD" }  -> { decode }
// POST { mode: "reply", context: string, turns: [{role, content}] } -> { text }

import Anthropic from "npm:@anthropic-ai/sdk@1.11.0";
import {
  buildDecodePrompt,
  buildReplyPrompt,
  extractJson,
  normalizeDecode,
  type ChatTurn,
} from "../_shared/firstbill-prompt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-5-5";

async function ask(messages: ChatTurn[], maxTokens: number): Promise<string | null> {
  // Server-side fallback reroutes a safety decline to another model instead of failing the demo.
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    messages,
  } as Parameters<typeof client.beta.messages.create>[0]);
  if ("stop_reason" in msg && msg.stop_reason === "refusal") return null;
  const blocks = "content" in msg ? msg.content : [];
  const text = blocks
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { type: string; text?: string }) => b.text ?? "")
    .join("");
  return text.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json();

    if (body.mode === "ping") return json({ ok: true, hasKey: Boolean(Deno.env.get("ANTHROPIC_API_KEY")) });

    if (body.mode === "decode") {
      const notice = String(body.notice ?? "").slice(0, 12000);
      const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today)) ? String(body.today) : new Date().toISOString().slice(0, 10);
      if (!notice.trim()) return json({ error: "empty notice" }, 400);
      const text = await ask([{ role: "user", content: buildDecodePrompt(notice, today) }], 8000);
      const decode = text ? normalizeDecode(extractJson(text)) : null;
      if (!decode) return json({ error: "could not decode" }, 422);
      return json({ decode });
    }

    if (body.mode === "reply") {
      const turns: ChatTurn[] = Array.isArray(body.turns)
        ? body.turns
            .filter((t: ChatTurn) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
            .map((t: ChatTurn) => ({ role: t.role, content: t.content.slice(0, 2000) }))
        : [];
      if (!turns.length || turns[turns.length - 1].role !== "user") return json({ error: "last turn must be the user's" }, 400);
      const text = await ask(buildReplyPrompt(String(body.context ?? "").slice(0, 6000), turns), 4000);
      if (!text) return json({ error: "no reply" }, 422);
      return json({ text });
    }

    return json({ error: "unknown mode" }, 400);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "bad_api_key" }, 500);
    if (err instanceof Anthropic.APIError) return json({ error: `claude_${err.status}` }, 502);
    return json({ error: "server_error" }, 500);
  }
});
