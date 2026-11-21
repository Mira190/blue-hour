#!/usr/bin/env bash
# Vercel's build (vercel.json buildCommand): nothing is compiled, web/ is served as it is. It leaves any
# video out of the deployment, and stamps the page and writes web/version.json for it (the release reads as the
# VERSION and the commit, as GitHub Pages' reads as the VERSION and the run number: .github/workflows/pages.yml).
# A script, not a line in vercel.json: Vercel refuses a buildCommand longer than 256 characters.
set -eu
cd "$(dirname "$0")/.."
find web/data \( -name '*.mp4' -o -name '*.webm' \) -delete
v=$(tr -d '[:space:]' < VERSION)
c=${VERCEL_GIT_COMMIT_SHA:-}
# The stamp (tools/stamp.js, issue 116): version.json, and every address the page asks for given the hash of its
# file, so that one page load is of one commit whatever a browser kept from the one before.
node tools/stamp.js --commit "${c:-local}" --version "$v" --release "$(printf '%s+%.7s' "$v" "$c")"
