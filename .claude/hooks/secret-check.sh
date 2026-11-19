#!/usr/bin/env bash
# PreToolUse hook (Bash): blocks `git commit` / `git push` when a repo in this sandbox would
# record or publish a Google Apps Script secret: a web-app URL, a deployment ID (AKfy…),
# or the exact script/deployment IDs kept in a project's git-ignored clasp files.
# Prints a "deny" decision as JSON; prints nothing (allow) otherwise.
set -uo pipefail

input="$(cat)"
cmd="$(jq -r '.tool_input.command // ""' <<<"$input")"

# Only care about commands that commit or push.
grep -qE '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(commit|push)\b' <<<"$cmd" || exit 0
action=commit; grep -qE 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push\b' <<<"$cmd" && action=push

root="${CLAUDE_PROJECT_DIR:-$(jq -r '.cwd // "."' <<<"$input")}"
PATTERN='macros/s/AKfy[A-Za-z0-9_-]{20,}|AKfy[A-Za-z0-9_-]{40,}|script\.google\.com/macros/s/[A-Za-z0-9_-]{30,}'

hits=""
# Every git repo directly under the sandbox (and the sandbox itself, if it is one).
while IFS= read -r gitdir; do
  repo="$(dirname "$gitdir")"
  # Exact local secrets, if this project has clasp set up.
  extra=()
  [[ -s "$repo/apps-script/.deployment-id" ]] && extra+=("$(tr -d '[:space:]' < "$repo/apps-script/.deployment-id")")
  [[ -f "$repo/apps-script/.clasp.json" ]] && extra+=("$(jq -r '.scriptId // empty' "$repo/apps-script/.clasp.json")")
  # Pattern matches first, then the exact IDs as literal strings.
  found="$(git -C "$repo" grep -n --cached -E -e "$PATTERN" 2>/dev/null)"
  for s in "${extra[@]}"; do
    [[ -n "$s" ]] && found+=$'\n'"$(git -C "$repo" grep -n --cached -F -e "$s" 2>/dev/null)"
  done
  if [[ "$action" == push ]]; then
    # Also check every commit that the push would publish.
    range="@{u}..HEAD"; git -C "$repo" rev-parse -q --verify '@{u}' >/dev/null || range="HEAD"
    log="$(git -C "$repo" log -p "$range" 2>/dev/null)"
    grep -qE "$PATTERN" <<<"$log" && found+=$'\n'"(in an unpushed commit)"
    for s in "${extra[@]}"; do [[ -n "$s" ]] && grep -qF "$s" <<<"$log" && found+=$'\n'"(in an unpushed commit)"; done
  fi
  found="$(grep -v '^$' <<<"$found" | awk '!seen[$0]++' | sed -E 's/(AKfy[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/\1…/g' | head -5)"
  [[ -n "$found" ]] && hits+="${repo##*/}:"$'\n'"$found"$'\n'
done < <(find "$root" -maxdepth 2 -name .git -type d 2>/dev/null)

[[ -z "$hits" ]] && exit 0

reason="Blocked git $action: an Apps Script secret (sync URL / deployment or script ID) is in tracked or staged files. Remove it (keep it only in git-ignored files) before retrying. Matches (IDs shortened):
$hits"
jq -n --arg r "$reason" '{
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r },
  systemMessage: "🔒 Secret-check hook blocked a git commit/push — see Claude'"'"'s note."
}'
exit 0
