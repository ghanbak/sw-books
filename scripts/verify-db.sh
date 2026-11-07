#!/usr/bin/env bash
# Apply every migration + seed to a throwaway local Supabase stack, then run SQL test files against it.
# Usage (from a git worktree, never the main checkout): scripts/verify-db.sh [supabase/tests/*.sql ...]
# No args runs every file in supabase/tests/. The owner's local stack (project "ossus-archives") is never touched:
# this one uses project id "ossus-archives-verify" on ports 553xx and deletes its volumes when done.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
if [ "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" ]; then
	echo "run this from a worktree, not the main checkout" >&2
	exit 2
fi
cd "$root"
tests=("$@")
[ ${#tests[@]} -gt 0 ] || tests=(supabase/tests/*.sql)

lock=/tmp/sw-books-verify-db.lock
for _ in $(seq 1 90); do mkdir "$lock" 2>/dev/null && break; sleep 10; done
[ -d "$lock" ] || { echo "verify-db lock busy for 15 min" >&2; exit 1; }

cfg=supabase/config.toml
cp "$cfg" "$cfg.verify-bak"
project=ossus-archives-verify
cleanup() {
	supabase stop --project-id "$project" --no-backup >/dev/null 2>&1 || true
	mv -f "$cfg.verify-bak" "$cfg"
	rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
	open -a Docker
	for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 3; done
	docker info >/dev/null 2>&1 || { echo "Docker did not start" >&2; exit 1; }
fi

sed -i '' -E \
	-e "s/^project_id = .*/project_id = \"$project\"/" \
	-e 's/^(([a-z_]*port) = )543([0-9]{2})$/\1553\3/' \
	-e 's/^inspector_port = 8083$/inspector_port = 9083/' \
	"$cfg"

echo "starting $project (migrations + seed)…"
supabase start -x realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor >/dev/null
db="supabase_db_$project"
echo "migrations applied: $(docker exec "$db" psql -U postgres -tAc 'select count(*) from supabase_migrations.schema_migrations')"

fail=0
for t in "${tests[@]}"; do
	if docker exec -i "$db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - <"$t" >"/tmp/verify-db-$$.log" 2>&1; then
		echo "PASS $t"
	else
		echo "FAIL $t"
		sed 's/^/    /' "/tmp/verify-db-$$.log" | tail -20
		fail=1
	fi
done
rm -f "/tmp/verify-db-$$.log"
exit $fail
