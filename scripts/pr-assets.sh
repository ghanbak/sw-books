#!/usr/bin/env bash
# Upload PR screenshots or diagrams to the `pr-assets` branch and print Markdown image links.
# Usage: scripts/pr-assets.sh <head-branch> <file>...
# Files land at <head-branch with / → ->/<filename>; links pin the commit so later uploads never change them.
# No checkout or worktree: builds the commit with a temp index, retries on concurrent pushes.
set -euo pipefail

[ $# -ge 2 ] || { echo "usage: $0 <head-branch> <file>..." >&2; exit 2; }
key=${1//\//-}
shift
remote=${PR_ASSETS_REMOTE:-origin}
repo=${PR_ASSETS_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}

for f in "$@"; do
	case "$f" in
	*.png | *.jpg | *.jpeg | *.gif | *.svg) ;;
	*) echo "not an image: $f" >&2; exit 2 ;;
	esac
	[ -f "$f" ] || { echo "missing: $f" >&2; exit 2; }
	[ "$(wc -c <"$f")" -le 5000000 ] || { echo "over 5 MB: $f" >&2; exit 2; }
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export GIT_INDEX_FILE="$tmp/index"

for attempt in 1 2 3 4 5; do
	parent=""
	if git fetch -q "$remote" pr-assets 2>/dev/null; then parent=$(git rev-parse FETCH_HEAD); fi
	rm -f "$GIT_INDEX_FILE"
	if [ -n "$parent" ]; then git read-tree "$parent"; else git read-tree --empty; fi
	for f in "$@"; do
		blob=$(git hash-object -w "$f")
		git update-index --add --cacheinfo "100644,$blob,$key/$(basename "$f")"
	done
	tree=$(git write-tree)
	if [ -n "$parent" ]; then
		commit=$(git commit-tree "$tree" -p "$parent" -m "assets: $key")
	else
		commit=$(git commit-tree "$tree" -m "assets: $key")
	fi
	if git push -q "$remote" "$commit:refs/heads/pr-assets" 2>/dev/null; then
		for f in "$@"; do
			name=$(basename "$f")
			echo "![${name%.*}](https://raw.githubusercontent.com/$repo/$commit/$key/$name)"
		done
		exit 0
	fi
	sleep $((attempt * 2))
done
echo "push to pr-assets failed after 5 attempts" >&2
exit 1
