/**
 * End-to-end RLS test for public.zapi_inbox.
 *
 * Verifies that the Data API only returns rows to users with the `admin`
 * role. Runs against the real Supabase project using SERVICE_ROLE_KEY to
 * provision throw-away users and PUBLISHABLE_KEY + a real access token to
 * hit /rest/v1/zapi_inbox as those users.
 *
 * Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY.
 * Run:  bun run scripts/test-zapi-inbox-rls.ts
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PK = process.env.SUPABASE_PUBLISHABLE_KEY!;
if (!URL || !SRK || !PK) throw new Error("Missing SUPABASE_URL / SERVICE_ROLE / PUBLISHABLE key");

const admin = createClient(URL, SRK, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) { pass++; results.push(`  \x1b[32mPASS\x1b[0m  ${label} ${detail}`); }
  else    { fail++; results.push(`  \x1b[31mFAIL\x1b[0m  ${label} ${detail}`); }
}

async function makeUser(role: "admin" | "vendedor") {
  const email = `rls-test-${role}-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${role}): ${error?.message}`);
  // handle_new_user trigger already inserted a default 'vendedor' role.
  // Replace it if we want admin.
  const { error: delErr } = await admin.from("user_roles").delete().eq("user_id", data.user.id);
  if (delErr) throw new Error(`clear roles: ${delErr.message}`);
  const { error: insErr } = await admin.from("user_roles").insert({ user_id: data.user.id, role });
  if (insErr) throw new Error(`insert role: ${insErr.message}`);
  return { id: data.user.id, email, password };
}

async function signIn(email: string, password: string) {
  const client = createClient(URL, PK, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn: ${error?.message}`);
  return data.session.access_token;
}

async function fetchCount(token: string | null) {
  const headers: Record<string, string> = {
    apikey: PK,
    Prefer: "count=exact",
    Range: "0-0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${URL}/rest/v1/zapi_inbox?select=id`, { headers });
  const contentRange = res.headers.get("content-range") ?? "";
  // Format: "0-0/<total>" or "*/0"
  const total = Number(contentRange.split("/")[1] ?? "0");
  return { status: res.status, total, body: await res.text() };
}

let adminUser: { id: string; email: string; password: string } | null = null;
let vendUser: { id: string; email: string; password: string } | null = null;

try {
  // Seed so a broken RLS would return >0.
  await admin.from("zapi_inbox").insert({
    phone: "5500000000000", name: "RLS Test", message: "rls probe", raw: {},
  });

  adminUser = await makeUser("admin");
  vendUser  = await makeUser("vendedor");

  const adminToken = await signIn(adminUser.email, adminUser.password);
  const vendToken  = await signIn(vendUser.email,  vendUser.password);

  const asAdmin = await fetchCount(adminToken);
  check("admin: HTTP 200/206", asAdmin.status === 200 || asAdmin.status === 206, `status=${asAdmin.status}`);
  check("admin: sees at least 1 row", asAdmin.total > 0, `total=${asAdmin.total}`);

  const asVend = await fetchCount(vendToken);
  check("vendedor: HTTP 200/206", asVend.status === 200 || asVend.status === 206, `status=${asVend.status}`);
  check("vendedor: sees 0 rows",  asVend.total === 0, `total=${asVend.total}`);

  const asAnon = await fetchCount(null);
  check("anon: sees 0 rows", asAnon.total === 0, `status=${asAnon.status} total=${asAnon.total}`);
} finally {
  if (adminUser) await admin.auth.admin.deleteUser(adminUser.id).catch(() => {});
  if (vendUser)  await admin.auth.admin.deleteUser(vendUser.id).catch(() => {});
}

console.log(results.join("\n"));
console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
