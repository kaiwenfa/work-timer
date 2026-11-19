#!/usr/bin/env bash
# Uploads apps-script/ to Google and points the existing web-app deployment at a new version.
# The sync URL stays the same. Needs a one-time clasp setup (see docs/SETUP.md, "Updating the script with clasp").
set -euo pipefail
cd "$(dirname "$0")/../apps-script"

CLASP="npx --yes @google/clasp@3.4.1"
if [[ ! -f .clasp.json || ! -s .deployment-id ]]; then
  echo "Missing apps-script/.clasp.json or apps-script/.deployment-id; do the clasp setup first." >&2
  exit 1
fi
DEPLOYMENT_ID="$(tr -d '[:space:]' < .deployment-id)"
DESC="${1:-Update from work-timer repo $(git rev-parse --short HEAD 2>/dev/null || echo local)}"

echo "→ Uploading code"
$CLASP push --force 2>&1 | grep -v "npm warn"

echo "→ Creating version"
VERSION="$($CLASP create-version "$DESC" 2>&1 | grep -v "npm warn" | grep -oE '[0-9]+' | tail -1)"
[[ -n "$VERSION" ]] || { echo "Could not read the new version number." >&2; exit 1; }
echo "  version $VERSION"

echo "→ Updating the web-app deployment (URL unchanged)"
$CLASP update-deployment "$DEPLOYMENT_ID" -V "$VERSION" -d "$DESC" 2>&1 | grep -v "npm warn" | sed -E 's/AKfy[A-Za-z0-9_-]+/AKfy…/g'
echo "✓ Done"
