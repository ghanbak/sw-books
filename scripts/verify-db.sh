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

cfg=supabase/config.toml
project=ossus-archives-verify

lock=${VERIFY_DB_LOCK:-/tmp/sw-books-verify-db.lock}
lock_tries=${VERIFY_DB_LOCK_TRIES:-90}
steal_mutex="$lock.steal"
stale_minutes=180 # the 3-hour rule in docs/agents/README.md
owner="$(date -u +%Y-%m-%dT%H:%M:%SZ) pid=$$ $root"

# Age comes from the directory's mtime, so a lock with a missing or unreadable owner file (one from before
# owner files existed, or one caught mid-acquire) still ages out on the same clock and is never stolen early.
is_stale() { [ -n "$(find "$1" -maxdepth 0 -mmin +"$stale_minutes" 2>/dev/null)" ]; }
lock_owner() { cat "$lock/owner" 2>/dev/null || echo "unknown owner"; }
holds_lock() { [ "$(cat "$lock/owner" 2>/dev/null)" = "$owner" ]; }

acquire_lock() {
	mkdir "$lock" 2>/dev/null || return 1
	echo "$owner" >"$lock/owner"
}

# The mutex allows one stealer at a time. Holding it, a run re-checks the age before removing, so a second
# stealer that saw the same stale lock finds the winner's fresh one instead of deleting it.
steal_stale_lock() {
	is_stale "$lock" || return 1
	if is_stale "$steal_mutex"; then rmdir "$steal_mutex" 2>/dev/null || true; fi # left by a killed stealer
	mkdir "$steal_mutex" 2>/dev/null || return 1
	local stolen=1
	if is_stale "$lock"; then
		echo "verify-db removing stale lock ($(lock_owner))" >&2
		rm -rf "$lock"
		if acquire_lock; then stolen=0; fi
	fi
	rmdir "$steal_mutex" 2>/dev/null || true
	return "$stolen"
}

got=
stole=
for ((try = 1; try <= lock_tries; try++)); do
	if acquire_lock || { steal_stale_lock && stole=1; }; then
		got=1
		break
	fi
	if [ "$try" -lt "$lock_tries" ]; then sleep 10; fi
done
[ -n "$got" ] || { echo "verify-db lock busy for 15 min ($(lock_owner))" >&2; exit 1; }

# A run that outlives the stale threshold can lose the lock. The stack and the lock are then the new holder's.
cleanup() {
	if holds_lock; then supabase stop --project-id "$project" --no-backup >/dev/null 2>&1 || true; fi
	if [ -f "$cfg.verify-bak" ]; then mv -f "$cfg.verify-bak" "$cfg"; fi
	if holds_lock; then rm -rf "$lock"; fi
}
trap cleanup EXIT
cp "$cfg" "$cfg.verify-bak"

if ! docker info >/dev/null 2>&1; then
	open -a Docker
	for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 3; done
	docker info >/dev/null 2>&1 || { echo "Docker did not start" >&2; exit 1; }
fi

# A stolen lock usually means the last run never reached its EXIT trap, so its stack may still be up and
# `supabase start` would reuse it. This waits for Docker because a stop fails while Docker is down, and the
# stack's unless-stopped containers would then come back with Docker.
if [ -n "$stole" ]; then supabase stop --project-id "$project" --no-backup >/dev/null 2>&1 || true; fi

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
