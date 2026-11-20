// Where the demo's bank and loan numbers come from. Plaid's public Sandbox (sample data only) through the
// Supabase / Lovable Cloud edge function `plaid-sandbox`, which logs in the custom Sandbox user in
// plaid/firstbill-sandbox-user.json. With no Supabase or Plaid keys this returns null and the app keeps
// using its built-in copy of the same numbers (src/lib/firstbill/data.ts).

export interface PlaidStudentLoan {
  name: string;
  balance: number | null;
  principal: number | null;
  rate: number | null;
  status: string | null;
  statusEndDate: string | null;
  minimumPayment: number | null;
  nextPaymentDueDate: string | null;
}

export interface PlaidSandboxData {
  source: "plaid-sandbox";
  institutionId?: string;
  checking: { name: string; mask: string | null; balance: number | null };
  studentLoans: PlaidStudentLoan[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export async function fetchPlaidSandbox(): Promise<PlaidSandboxData | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/plaid-sandbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<PlaidSandboxData> | null;
    if (data?.source !== "plaid-sandbox" || !data.checking) return null;
    return { ...data, studentLoans: data.studentLoans ?? [] } as PlaidSandboxData;
  } catch {
    return null;
  }
}
