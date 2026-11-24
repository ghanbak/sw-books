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

# Route weight: /admin/diff uses only AlertDialog from radix-ui. If its chunks
# hold DropdownMenu, the radix-ui barrel stopped tree-shaking (see
# `optimizePackageImports` in admin/next.config.ts) and every primitive ships.
# The marker is the context-scope name radix keeps as a string literal.
# Only `next build` writes BUILD_ID; a `next dev` output in the same dir may not
# have compiled /admin/diff, so skip there instead of failing local lint.
if [ ! -f "admin/.next/BUILD_ID" ]; then
	echo "check-admin-bundle: admin/.next is not a production build — skipping route-weight check"
	exit 0
fi
MANIFEST="admin/.next/app-build-manifest.json"
node - "$MANIFEST" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const manifestPath = process.argv[2];
const route = '/admin/diff/page';
const marker = '"DropdownMenu"';
if (!fs.existsSync(manifestPath)) {
	console.error(`ERROR: ${manifestPath} missing; update the route-weight check for this Next version.`);
	process.exit(1);
}
const chunks = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).pages?.[route];
if (!Array.isArray(chunks) || chunks.length === 0) {
	console.error(`ERROR: ${route} not found in ${manifestPath}.`);
	process.exit(1);
}
const hits = chunks
	.filter((f) => f.endsWith('.js'))
	.filter((f) => fs.readFileSync(path.join(path.dirname(manifestPath), f), 'utf8').includes(marker));
if (hits.length > 0) {
	console.error(`ERROR: ${route} ships radix DropdownMenu (${hits.join(', ')}); is radix-ui still in optimizePackageImports?`);
	process.exit(1);
}
console.log(`check-admin-bundle: ${route} chunks hold no radix DropdownMenu ✓`);
NODE
