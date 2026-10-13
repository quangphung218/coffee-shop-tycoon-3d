#!/bin/sh
# Builds the game and publishes dist/ to the gh-pages branch of origin,
# then makes sure GitHub Pages serves that branch. Safe to run repeatedly:
# each run replaces gh-pages with a single fresh commit.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if [ ! -d node_modules ]; then
  npm ci
fi
npm run build

REMOTE_URL=$(git remote get-url origin)
# git@github.com:owner/repo.git or https://github.com/owner/repo(.git) -> owner/repo
SLUG=$(printf '%s\n' "$REMOTE_URL" | sed -E 's#^(git@[^:]+:|ssh://git@[^/]+/|https?://([^@/]+@)?[^/]+/)##; s#/$##; s#\.git$##')
OWNER=${SLUG%%/*}
REPO=${SLUG#*/}
SOURCE_SHA=$(git rev-parse --short HEAD)
AUTHOR_NAME=$(git config user.name || echo "deploy-pages")
AUTHOR_EMAIL=$(git config user.email || echo "deploy-pages@localhost")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

cp -R dist/. "$TMP/"
# Keep files starting with "_" and skip the Jekyll build.
touch "$TMP/.nojekyll"

git -C "$TMP" init -q
git -C "$TMP" checkout -q -b gh-pages
git -C "$TMP" add -A
git -C "$TMP" -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" \
  commit -q -m "deploy: build from $SOURCE_SHA"
git -C "$TMP" push -q -f "$REMOTE_URL" gh-pages:gh-pages
echo "Pushed dist/ to gh-pages ($SOURCE_SHA)."

PAGE_URL="https://$OWNER.github.io/$REPO/"
if command -v gh >/dev/null 2>&1; then
  if ! gh api "repos/$OWNER/$REPO/pages" >/dev/null 2>&1; then
    echo "Enabling GitHub Pages for gh-pages..."
    gh api -X POST "repos/$OWNER/$REPO/pages" \
      -f 'source[branch]=gh-pages' -f 'source[path]=/' >/dev/null
  fi
  PAGE_URL=$(gh api "repos/$OWNER/$REPO/pages" --jq '.html_url' 2>/dev/null || echo "$PAGE_URL")
else
  echo "gh not found: enable Pages manually (Settings > Pages > Branch: gh-pages, / (root))." >&2
fi

echo "Site: $PAGE_URL"
