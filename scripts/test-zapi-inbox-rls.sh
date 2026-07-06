#!/usr/bin/env bash
# Automated RLS test: verifies that only admins can SELECT from public.zapi_inbox.
#
# Uses the SECURITY DEFINER helper `public.test_zapi_inbox_visibility(uid)`
# which impersonates the `authenticated` role and injects a JWT claim for
# the given user_id, then runs `SELECT count(*) FROM zapi_inbox`. The count
# reflects exactly what that user would see through PostgREST/RLS.
#
# Requires PG* env vars pointing at the Supabase database.
# Run with:  bash scripts/test-zapi-inbox-rls.sh
set -euo pipefail

if [[ -z "${PGHOST:-}" ]]; then
  echo "PGHOST not set — cannot run RLS test." >&2
  exit 2
fi

pass=0; fail=0

# Ensure there is at least one row so a broken policy would leak data.
psql -q -v ON_ERROR_STOP=1 -c "
  INSERT INTO public.zapi_inbox (phone, name, message, raw)
  SELECT '5500000000000', 'RLS Test', 'rls probe', '{}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.zapi_inbox);
" >/dev/null

visible_as() {
  psql -qAtX -v ON_ERROR_STOP=1 -c "SELECT public.test_zapi_inbox_visibility('$1'::uuid)"
}

expect() {
  local label="$1" got="$2" op="$3" ref="$4"
  if [[ "$op" == "gt" && "$got" -gt "$ref" ]] || [[ "$op" == "eq" && "$got" -eq "$ref" ]]; then
    printf '  \033[32mPASS\033[0m  %s (got=%s)\n' "$label" "$got"; pass=$((pass+1))
  else
    printf '  \033[31mFAIL\033[0m  %s (got=%s, expected %s %s)\n' "$label" "$got" "$op" "$ref" >&2; fail=$((fail+1))
  fi
}

admin_id=$(psql -qAtX -c "SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1")
vend_id=$(psql -qAtX  -c "SELECT user_id FROM public.user_roles WHERE role='vendedor' LIMIT 1")

if [[ -z "$admin_id" || -z "$vend_id" ]]; then
  echo "Need at least one admin AND one vendedor in user_roles to run this test." >&2
  exit 2
fi

echo "Impersonating admin    ($admin_id)"
expect "admin can read zapi_inbox"          "$(visible_as "$admin_id")" gt 0

echo "Impersonating vendedor ($vend_id)"
expect "vendedor sees zero rows (denied)"   "$(visible_as "$vend_id")"  eq 0

# Random UUID that is not in user_roles → also should see zero.
rand_id=$(psql -qAtX -c "SELECT gen_random_uuid()")
echo "Impersonating unknown user ($rand_id)"
expect "unknown user sees zero rows"        "$(visible_as "$rand_id")"  eq 0

echo
echo "Results: $pass passed, $fail failed"
exit $(( fail > 0 ? 1 : 0 ))
