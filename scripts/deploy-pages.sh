#!/bin/sh
# Runs npm run check (types, tests, build), then bumps the version when there
# are feat/fix/perf commits since the last v* tag, builds the game and
# publishes dist/ to the gh-pages branch of origin, then makes sure GitHub Pages serves that branch. Safe to run repeatedly:
# each run replaces gh-pages with a single fresh commit. Refuses to start
# unless main is checked out, clean and equal to origin/main; after the
# deploy it pushes the release commit and tag (plain push, never forced).
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

stop() {
  echo "deploy-pages: $1" >&2
  shift
  for line in "$@"; do echo "  $line" >&2; done
  echo "Nothing was built, committed or pushed." >&2
  exit 1
}

warn() {
  if [ -t 2 ]; then printf '\033[1;31m%s\033[0m\n' "$1" >&2; else printf '%s\n' "$1" >&2; fi
}

# Releasing from anything but an up-to-date main leaves a release commit
# that origin/main does not have, and the two branches split on the next
# PR merge.
git fetch -q origin || stop "git fetch origin failed." \
  "Check the network and 'git remote get-url origin', then run again."
BRANCH=$(git symbolic-ref --short -q HEAD || true)
if [ "$BRANCH" != main ]; then
  stop "deploy only runs on main (current: ${BRANCH:-detached HEAD})." \
    "Run: git switch main && git pull --ff-only"
fi
DIRTY=$(git status --porcelain --untracked-files=no)
if [ -n "$DIRTY" ]; then
  stop "the working tree has uncommitted changes:" "$DIRTY" \
    "Commit them through a PR, or discard them, then run again."
fi
git rev-parse -q --verify origin/main >/dev/null ||
  stop "origin/main not found." "Push main once: git push origin main"
LOCAL=$(git rev-parse HEAD)
UPSTREAM=$(git rev-parse origin/main)
if [ "$LOCAL" != "$UPSTREAM" ]; then
  AHEAD=$(git rev-list --count origin/main..HEAD)
  BEHIND=$(git rev-list --count HEAD..origin/main)
  if [ "$AHEAD" -eq 0 ]; then
    stop "local main is $BEHIND commit(s) behind origin/main." \
      "Run: git pull --ff-only" "Then run the deploy again."
  fi
  HEAD_TAG=$(git tag --points-at HEAD --list 'v[0-9]*' | head -n 1)
  if [ "$BEHIND" -eq 0 ]; then
    if [ -n "$HEAD_TAG" ]; then
      stop "local main has $AHEAD commit(s) that origin/main does not, ending at release $HEAD_TAG." \
        "Push them first: git push origin main $HEAD_TAG"
    fi
    stop "local main has $AHEAD commit(s) that origin/main does not:" \
      "$(git log --oneline origin/main..HEAD)" \
      "Push them (git push origin main) or move them to a branch and open a PR, then run again."
  fi
  stop "local main and origin/main have split ($AHEAD local, $BEHIND remote commit(s))." \
    "Inspect: git log --oneline --left-right main...origin/main" \
    "Keep what you need on a branch (git branch backup/main-<date>), then: git reset --hard origin/main"
fi

# A half-finished install can leave node_modules/ without the build tools,
# so check the tools and the installed lockfile, not just the directory.
REINSTALL=
if [ ! -d node_modules ]; then
  REINSTALL="node_modules/ is missing"
elif [ ! -x node_modules/.bin/tsc ] || [ ! -x node_modules/.bin/vite ]; then
  REINSTALL="node_modules/.bin/tsc or node_modules/.bin/vite is missing"
elif ! cmp -s node_modules/.package-lock.json package-lock.json; then
  REINSTALL="node_modules/.package-lock.json differs from package-lock.json"
fi
if [ -n "$REINSTALL" ]; then
  echo "Running npm ci: $REINSTALL."
  npm ci
fi
# Types, tests and build on the merged commit, before release.mjs: a failing
# test leaves no release commit or tag behind. Two vitest workers by default:
# more time out on a busy machine and fail the deploy for nothing.
VITEST_MAX_WORKERS=${VITEST_MAX_WORKERS:-2} npm run check || stop "npm run check failed (types, tests or build)." \
  "Fix it through a PR, then run the deploy again."

# Before the build, so the bundle shows the new version.
TAG_BEFORE=$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)
node scripts/release.mjs
TAG_AFTER=$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)

npm run build

REMOTE_URL=$(git remote get-url origin)
# git@github.com:owner/repo.git or https://github.com/owner/repo(.git) -> owner/repo
SLUG=$(printf '%s\n' "$REMOTE_URL" | sed -E 's#^(git@[^:]+:|ssh://git@[^/]+/|https?://([^@/]+@)?[^/]+/)##; s#/$##; s#\.git$##')
OWNER=${SLUG%%/*}
REPO=${SLUG#*/}
SOURCE_SHA=$(git rev-parse --short HEAD)
AUTHOR_NAME=$(git config user.name || echo "deploy-pages")
AUTHOR_EMAIL=$(git config user.email || echo "deploy-pages@localhost")

TMP=$(mktemp -d "${TMPDIR:-/tmp}/deploy-pages.XXXXXX")
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

if [ "$TAG_AFTER" != "$TAG_BEFORE" ]; then
  echo ""
  echo "Pushing release $TAG_AFTER to origin..."
  if git push origin main "$TAG_AFTER"; then
    echo "Pushed main and $TAG_AFTER."
  else
    warn "WARNING: pushing the release commit and tag $TAG_AFTER failed."
    warn "The site is deployed, but origin/main does not have the release commit yet."
    warn "Do not merge PRs until this works: git push origin main $TAG_AFTER"
    exit 1
  fi
fi
