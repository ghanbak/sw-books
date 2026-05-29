#!/usr/bin/env bash
# Defense-in-depth: fail if service-role/secret key material leaks into the
# admin client bundle. supabase-admin.ts uses `import 'server-only'`, so this
# should never trip — but a stray client import would be caught here.
#
# Patterns: the secret key prefix the local CLI issues (sb_secret_), the legacy
# service-role JWT prefix (eyJ is too broad to match safely, so we match the
# env var name instead), and the env var name itself.
set -euo pipefail

DIR="admin/.next/static"
if [ ! -d "$DIR" ]; then
	echo "check-admin-bundle: $DIR not built — skipping (run 'npm --prefix admin run build' first)"
	exit 0
fi

if grep -rIl -e 'sb_secret_' -e 'SUPABASE_SERVICE_ROLE_KEY' "$DIR"; then
	echo "ERROR: secret key material found in admin client bundle (above files)." >&2
	exit 1
fi

echo "check-admin-bundle: no secret material in $DIR ✓"
