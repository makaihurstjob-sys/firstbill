// Supabase / Lovable Cloud edge function: pulls FirstBill's demo bank and loan numbers from Plaid's
// public Sandbox. Sample data only: the host is hardcoded to sandbox.plaid.com, so this can never
// reach a real account.
// Deploy: supabase functions deploy plaid-sandbox
// Secrets (your own Sandbox keys from the Plaid Dashboard): supabase secrets set PLAID_CLIENT_ID=... PLAID_SECRET=...
//
// POST {}               -> { source: "plaid-sandbox", checking: { name, mask, balance }, studentLoans: [...] } or { error }
// POST { mode: "ping" } -> { ok: true, hasKeys: boolean }

const PLAID_HOST = "https://sandbox.plaid.com"; // Sandbox only, on purpose. Never read this from env.
const INSTITUTION_ID = "ins_109508"; // First Platypus Bank, Plaid's non-OAuth test bank
const PRODUCTS = ["liabilities", "transactions"];

// Copy of plaid/firstbill-sandbox-user.json (keep the two in sync). Sent as the user_custom password.
const FIRSTBILL_SANDBOX_USER = {
  "seed": "firstbill-tariq-2026-11-20",
  "roll_dates_forward": false,
  "override_accounts": [
    {
      "type": "depository",
      "subtype": "checking",
      "starting_balance": 450.18,
      "force_available_balance": 450.18,
      "currency": "USD",
      "meta": {
        "name": "Everyday Checking",
        "official_name": "First Platypus Everyday Checking",
        "mask": "6602"
      },
      "transactions": [
        {
          "date_transacted": "2026-10-07",
          "date_posted": "2026-10-07",
          "amount": 65,
          "description": "Mobile phone bill autopay",
          "currency": "USD"
        },
        {
          "date_transacted": "2026-10-11",
          "date_posted": "2026-10-11",
          "amount": 98,
          "description": "Car insurance premium",
          "currency": "USD"
        },
        {
          "date_transacted": "2026-10-24",
          "date_posted": "2026-10-25",
          "amount": 54.12,
          "description": "Grocery store",
          "currency": "USD"
        },
        {
          "date_transacted": "2026-11-02",
          "date_posted": "2026-11-02",
          "amount": 640,
          "description": "Rent share payment",
          "currency": "USD"
        },
        {
          "date_transacted": "2026-11-07",
          "date_posted": "2026-11-07",
          "amount": 65,
          "description": "Mobile phone bill autopay",
          "currency": "USD"
        },
        {
          "date_transacted": "2026-11-09",
          "date_posted": "2026-11-10",
          "amount": 38.4,
          "description": "Gas station",
          "currency": "USD"
        },
        {
          "date_transacted": "2026-11-11",
          "date_posted": "2026-11-11",
          "amount": 98,
          "description": "Car insurance premium",
          "currency": "USD"
        },
        {
          "date_transacted": "2026-11-14",
          "date_posted": "2026-11-15",
          "amount": 61.37,
          "description": "Grocery store",
          "currency": "USD"
        },
        {
          "date_transacted": "2026-11-19",
          "date_posted": "2026-11-20",
          "amount": 6.25,
          "description": "Coffee shop",
          "currency": "USD"
        }
      ],
      "inflow_model": {
        "type": "monthly-income",
        "income_amount": 1240,
        "payment_day_of_month": 18,
        "transaction_name": "Payroll direct deposit"
      }
    },
    {
      "type": "loan",
      "subtype": "student",
      "starting_balance": 9500,
      "meta": {
        "name": "Direct Subsidized Loan",
        "official_name": "Meridian Loan Servicing - Direct Subsidized"
      },
      "liability": {
        "type": "student",
        "origination_date": "2022-08-04",
        "principal": 9500,
        "nominal_apr": 5.5,
        "loan_name": "Direct Subsidized Loan",
        "guarantor": "DEPT OF ED",
        "is_federal": true,
        "sequence_number": 1,
        "minimum_payment_amount": 103.1,
        "expected_payoff_date": "2036-11-04",
        "loan_status": {
          "type": "in grace",
          "end_date": "2026-12-02"
        },
        "repayment_plan_type": "standard",
        "repayment_plan_description": "Standard Repayment, 10 years",
        "repayment_model": {
          "type": "standard",
          "non_repayment_months": 52,
          "repayment_months": 120
        }
      }
    },
    {
      "type": "loan",
      "subtype": "student",
      "starting_balance": 19100,
      "meta": {
        "name": "Direct Unsubsidized Loan",
        "official_name": "Meridian Loan Servicing - Direct Unsubsidized"
      },
      "liability": {
        "type": "student",
        "origination_date": "2022-08-04",
        "principal": 19100,
        "nominal_apr": 5.5,
        "loan_name": "Direct Unsubsidized Loan",
        "guarantor": "DEPT OF ED",
        "is_federal": true,
        "sequence_number": 2,
        "minimum_payment_amount": 207.29,
        "expected_payoff_date": "2036-11-04",
        "loan_status": {
          "type": "in grace",
          "end_date": "2026-12-02"
        },
        "repayment_plan_type": "standard",
        "repayment_plan_description": "Standard Repayment, 10 years",
        "repayment_model": {
          "type": "standard",
          "non_repayment_months": 52,
          "repayment_months": 120
        }
      }
    }
  ]
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID");
const SECRET = Deno.env.get("PLAID_SECRET");

// deno-lint-ignore no-explicit-any
type Json = any;

async function plaid(path: string, body: Record<string, unknown>): Promise<Json> {
  const res = await fetch(`${PLAID_HOST}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "PLAID-CLIENT-ID": CLIENT_ID!, "PLAID-SECRET": SECRET! },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.error_code ?? res.status} ${data.error_message ?? ""}`.trim());
  return data;
}

async function loadSandbox() {
  const { public_token } = await plaid("/sandbox/public_token/create", {
    institution_id: INSTITUTION_ID,
    initial_products: PRODUCTS,
    options: { override_username: "user_custom", override_password: JSON.stringify(FIRSTBILL_SANDBOX_USER) },
  });
  const { access_token } = await plaid("/item/public_token/exchange", { public_token });
  try {
    const [bal, liab] = await Promise.all([
      plaid("/accounts/balance/get", { access_token }),
      plaid("/liabilities/get", { access_token }),
    ]);
    const accounts: Json[] = bal.accounts ?? [];
    const checking =
      accounts.find((a) => a.subtype === "checking" && a.mask === "6602") ?? accounts.find((a) => a.subtype === "checking");
    if (!checking) throw new Error("no checking account in the Sandbox item");
    const loanAccounts: Json[] = liab.accounts ?? [];
    const studentLoans = ((liab.liabilities?.student ?? []) as Json[]).map((l) => {
      const acct = loanAccounts.find((a) => a.account_id === l.account_id);
      return {
        name: l.loan_name ?? acct?.name ?? "Student loan",
        balance: acct?.balances?.current ?? null,
        principal: l.origination_principal_amount ?? null,
        rate: l.interest_rate_percentage ?? null,
        status: l.loan_status?.type ?? null,
        statusEndDate: l.loan_status?.end_date ?? null,
        minimumPayment: l.minimum_payment_amount ?? null,
        nextPaymentDueDate: l.next_payment_due_date ?? null,
      };
    });
    return {
      source: "plaid-sandbox" as const,
      institutionId: INSTITUTION_ID,
      checking: {
        name: checking.name,
        mask: checking.mask,
        balance: checking.balances?.available ?? checking.balances?.current ?? null,
      },
      studentLoans,
    };
  } finally {
    // Each call makes a throwaway Sandbox Item; remove it so they don't pile up.
    await plaid("/item/remove", { access_token }).catch(() => {});
  }
}

// Reuse a result for 10 minutes on a warm instance so page reloads don't create new Items each time.
let cache: { at: number; data: Awaited<ReturnType<typeof loadSandbox>> } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const hasKeys = Boolean(CLIENT_ID && SECRET);
    if (body?.mode === "ping") return json({ ok: true, hasKeys });
    if (!hasKeys) return json({ error: "PLAID_CLIENT_ID and PLAID_SECRET are not set" }, 503);

    if (!cache || Date.now() - cache.at > 10 * 60_000) cache = { at: Date.now(), data: await loadSandbox() };
    return json(cache.data);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
