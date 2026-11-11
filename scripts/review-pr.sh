#!/usr/bin/env bash
# Open a PR's app changes in the iOS simulator for review.
# Usage: npm run review -- <PR#> [--port <n>] [--keep] [--check [--out <dir>]]
#   --port   Metro port (default 8090)
#   --keep   keep the worktree afterwards (faster next time; remove later with
#            `git worktree remove --force .claude/worktrees/review-<PR#>`)
#   --check  for agents: open each deep link from the PR body, screenshot it, clean up and
#            exit instead of staying open. Screenshots go to --out (default: a temp dir).
# Env: SIM_UDID overrides the simulator (default: the iPhone 17 Pro on iOS 26.4).
#
# Makes a worktree at the PR head, copies .env.local, runs npm ci, starts Metro from the
# worktree's own expo binary (a nested worktree otherwise serves the main checkout's
# source), boots the simulator and opens the dev client. Ctrl-C stops Metro, frees the
# simulator lock and removes the worktree. No EAS commands, no database writes.
set -euo pipefail

usage() {
	echo "usage: npm run review -- <PR#> [--port <n>] [--keep] [--check [--out <dir>]]" >&2
	exit 2
}

pr=""
port=8090
keep=0
check=0
out=""
while [ $# -gt 0 ]; do
	case "$1" in
	--port)
		[ $# -ge 2 ] || usage
		port=$2
		shift 2
		;;
	--out)
		[ $# -ge 2 ] || usage
		out=$2
		shift 2
		;;
	--keep)
		keep=1
		shift
		;;
	--check)
		check=1
		shift
		;;
	-h | --help) usage ;;
	*)
		[ -z "$pr" ] || usage
		pr=$1
		shift
		;;
	esac
done
[[ "$pr" =~ ^[0-9]+$ ]] || usage
[[ "$port" =~ ^[0-9]+$ ]] || usage

udid=${SIM_UDID:-84553B81-B5D9-4DEB-BE01-0DCC4BBBFF60}
root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
wt="$root/.claude/worktrees/review-$pr"
ref="refs/review/$pr"
lock=/tmp/sw-books-sim.lock
metro_pid=""
have_lock=0

# True only for a registered worktree rooted exactly at $wt, so git -C never falls through
# to the main checkout.
is_review_worktree() {
	[ -f "$wt/.git" ] && [ "$(git -C "$wt" rev-parse --show-toplevel 2>/dev/null)" = "$wt" ]
}

cleanup() {
	trap - EXIT INT TERM
	if [ -n "$metro_pid" ] && kill -0 "$metro_pid" 2>/dev/null; then
		kill "$metro_pid" 2>/dev/null || true
		wait "$metro_pid" 2>/dev/null || true
	fi
	if [ "$have_lock" = 1 ]; then rm -rf "$lock"; fi
	if [ "$keep" = 0 ] && [ -d "$wt" ]; then
		if git -C "$root" worktree remove --force "$wt" 2>/dev/null; then
			echo "Removed $wt"
		else
			echo "Couldn't remove $wt; run: git worktree remove --force $wt" >&2
		fi
	fi
	git -C "$root" update-ref -d "$ref" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

info=$(gh pr view "$pr" --json title,labels,state,body)
title=$(jq -r .title <<<"$info")
state=$(jq -r .state <<<"$info")
echo "#$pr $title ($state)"
if jq -e '.labels[].name | select(. == "needs-build")' <<<"$info" >/dev/null; then
	echo "Warning: #$pr is labeled needs-build. It changes native code, so the installed dev client" >&2
	echo "may crash or miss features. Review it on a dev build with its native changes instead." >&2
fi

# Worktree at the PR head. A named ref avoids racing other fetches on FETCH_HEAD.
git -C "$root" fetch -q origin "+pull/$pr/head:$ref"
head=$(git -C "$root" rev-parse "$ref")
if [ -e "$wt" ] && ! is_review_worktree; then
	echo "Recreating stale $wt"
	rm -rf "$wt"
	git -C "$root" worktree prune
fi
if is_review_worktree; then
	git -C "$wt" checkout -q --detach "$head"
else
	git -C "$root" worktree add -q --detach "$wt" "$head"
fi
echo "Worktree: $wt at ${head:0:9}"

if [ -f "$root/.env.local" ]; then
	cp "$root/.env.local" "$wt/.env.local"
	supabase_url=$(sed -n 's/^EXPO_PUBLIC_SUPABASE_URL=//p' "$wt/.env.local" | tr -d '"' | head -1)
	case "$supabase_url" in
	http://127.0.0.1* | http://localhost*)
		curl -s -o /dev/null --max-time 3 "$supabase_url" ||
			echo "Warning: local Supabase isn't answering at $supabase_url; run \`supabase start\` (Docker first)." >&2
		;;
	esac
else
	echo "Warning: no .env.local in $root; the app won't reach Supabase." >&2
fi

changed=$(gh pr diff "$pr" --name-only 2>/dev/null || true)
if grep -q '^supabase/migrations/' <<<"$changed"; then
	echo "Note: this PR adds migrations. If .env.local points at your local stack, the new" >&2
	echo "schema isn't there yet; apply it yourself (this script never touches the database)." >&2
fi

# npm ci only when the lockfile changed since the last run in this worktree.
stamp="$wt/node_modules/.review-lock-hash"
lock_hash=$(git -C "$wt" hash-object package-lock.json)
if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$lock_hash" ]; then
	echo "Installing dependencies…"
	(cd "$wt" && npm ci --no-audit --no-fund --loglevel=error)
	echo "$lock_hash" >"$stamp"
fi

# One user of the simulator at a time (agents use the same lock). A lock left by a
# review-pr.sh run whose process is gone is stale and gets taken over.
waited=0
until mkdir "$lock" 2>/dev/null && have_lock=1; do
	holder=$(sed -n 's/^pid=//p' "$lock/owner" 2>/dev/null || true)
	if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
		# Rename first so only one waiting run takes over the stale lock.
		if mv "$lock" "$lock.stale.$$" 2>/dev/null; then
			echo "Removed stale simulator lock (pid $holder is gone)."
			rm -rf "$lock.stale.$$"
		fi
		continue
	fi
	[ "$waited" = 0 ] && echo "Simulator busy ($(head -1 "$lock/owner" 2>/dev/null || echo unknown)); waiting up to 15 min…"
	waited=$((waited + 10))
	[ "$waited" -le 900 ] || {
		echo "Simulator still locked. Remove $lock if nothing is using it." >&2
		exit 1
	}
	sleep 10
done
printf 'review-pr #%s %s\npid=%s\n' "$pr" "$(date '+%Y-%m-%d %H:%M')" "$$" >"$lock/owner"

if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
	echo "Port $port is in use; pass --port <n>." >&2
	exit 1
fi

xcrun simctl boot "$udid" 2>/dev/null || true
open -a "$(xcode-select -p)/Applications/Simulator.app" 2>/dev/null || true
xcrun simctl ui "$udid" appearance dark

echo "Starting Metro on :$port…"
(cd "$wt" && exec "$wt/node_modules/.bin/expo" start --dev-client --port "$port") &
metro_pid=$!
for _ in $(seq 1 90); do
	curl -fs "http://127.0.0.1:$port/status" 2>/dev/null | grep -q running && break
	kill -0 "$metro_pid" 2>/dev/null || {
		echo "Metro exited." >&2
		exit 1
	}
	sleep 1
done

xcrun simctl openurl "$udid" "exp+ossus-archives://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A$port"

links=$(jq -r .body <<<"$info" | grep -oE 'ossusarchives://[^ )`"<>]+' | sort -u || true)

if [ "$check" = 1 ]; then
	out=${out:-$(mktemp -d)}
	mkdir -p "$out"
	sleep 25 # first bundle + sign-in restore
	n=0
	xcrun simctl io "$udid" screenshot "$out/review-$pr-$n.png" >/dev/null
	echo "Screenshot: $out/review-$pr-$n.png"
	if [ -n "$links" ]; then
		while IFS= read -r l; do
			n=$((n + 1))
			xcrun simctl openurl "$udid" "$l"
			sleep 4
			xcrun simctl io "$udid" screenshot "$out/review-$pr-$n.png" >/dev/null
			echo "Screenshot: $out/review-$pr-$n.png ($l)"
		done <<<"$links"
	else
		echo "No ossusarchives:// links in the PR body." >&2
	fi
	exit 0
fi

echo
echo "Reviewing #$pr in the simulator. Sign in on the login screen if asked."
if [ -n "$links" ]; then
	echo "Deep links from the PR's review guide:"
	while IFS= read -r l; do echo "  xcrun simctl openurl $udid \"$l\""; done <<<"$links"
else
	echo "Open a screen: xcrun simctl openurl $udid \"ossusarchives://<route>\""
fi
echo "Ctrl-C to stop Metro and clean up."
wait "$metro_pid"
