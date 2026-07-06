#!/usr/bin/env bash
# Automated RLS test: verifies that only admins can SELECT from public.zapi_inbox.
#
# Strategy: impersonate the `authenticated` PostgREST role and set the JWT
# claim `sub` to a real user_id from public.user_roles. `auth.uid()` reads
# from `request.jwt.claims.sub`, and the SELECT policy calls
# `has_role(auth.uid(), 'admin')`.
#
# Requires PG* env vars pointing at the Supabase database (superuser/service
# role). Run with: bash scripts/test-zapi-inbox-rls.sh
set -euo pipefail

if [[ -z "${PGHOST:-}" ]]; then
  echo "PGHOST not set — cannot run RLS test." >&2
  exit 2
fi

fail=0
pass=0

# Ensure there is at least one row so a broken policy would leak data.
seed_row() {
  psql -q -v ON_ERROR_STOP=1 -c "
    INSERT INTO public.zapi_inbox (phone, name, message, raw)
    SELECT '5500000000000', 'RLS Test', 'rls probe', '{}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM public.zapi_inbox);
  " >/dev/null
}

# Runs a SELECT count(*) on zapi_inbox impersonating the given user_id
# through the `authenticated` role + JWT claim.
count_as_user() {
  local uid="$1"
  psql -qAtX -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"${uid}","role":"authenticated"}';
SELECT count(*) FROM public.zapi_inbox;
ROLLBACK;
SQL
}

expect() {
  local label="$1" got="$2" op="$3" ref="$4"
  if [[ "$op" == "gt" && "$got" -gt "$ref" ]] \
     || [[ "$op" == "eq" && "$got" -eq "$ref" ]]; then
    echo "  PASS  $label (got=$got)"
    pass=$((pass+1))
  else
    echo "  FAIL  $label (got=$got, expected $op $ref)" >&2
    fail=$((fail+1))
  fi
}

seed_row

admin_id=$(psql -qAtX -c "SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1")
vend_id=$(psql -qAtX -c "SELECT user_id FROM public.user_roles WHERE role='vendedor' LIMIT 1")

if [[ -z "$admin_id" || -z "$vend_id" ]]; then
  echo "Need at least one admin AND one vendedor in user_roles to run this test." >&2
  exit 2
fi

echo "Impersonating admin $admin_id"
admin_count=$(count_as_user "$admin_id")
expect "admin can read zapi_inbox" "$admin_count" gt 0

echo "Impersonating vendedor $vend_id"
vend_count=$(count_as_user "$vend_id")
expect "vendedor is denied (0 rows visible)" "$vend_count" eq 0

echo "Impersonating anonymous (no sub)"
anon_count=$(psql -qAtX -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL role anon;
SELECT count(*) FROM public.zapi_inbox;
ROLLBACK;
SQL
)
expect "anon is denied (0 rows visible)" "$anon_count" eq 0

echo
echo "Results: $pass passed, $fail failed"
exit $(( fail > 0 ? 1 : 0 ))
