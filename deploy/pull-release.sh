#!/usr/bin/env bash
set -euo pipefail

base=/var/www/webscummtest
repository=/var/lib/webscummtest/repository
if [ ! -d "$repository/objects" ]; then
  git init --bare --quiet "$repository"
fi

git -C "$repository" fetch --quiet --no-tags --depth=1 https://github.com/yanakulov/WebSCUMM.git refs/heads/deploy
build=$(git -C "$repository" rev-parse FETCH_HEAD)
release="releases/$build"
if [ "$(readlink "$base/current" || true)" = "$release" ]; then exit 0; fi

if [ ! -d "$base/$release" ]; then
  git -C "$repository" ls-tree -r --format='%(objectmode) %(path)' "$build" |
    awk '$0 !~ /^100644 (index\.html|revision\.txt|assets\/[A-Za-z0-9_.-]+)$/ { bad=1 } END { exit bad }'

  stage=$(mktemp -d "$base/releases/.stage.XXXXXX")
  trap 'rm -rf -- "$stage"' EXIT
  git -C "$repository" archive "$build" | tar -x -C "$stage"
  test -s "$stage/index.html"
  test -d "$stage/assets"
  grep -Eq '^[a-f0-9]{40}$' "$stage/revision.txt"
  chmod 755 "$stage"
  mv -T -- "$stage" "$base/$release"
  trap - EXIT
fi

next="$base/.next"
ln -sfn -- "$release" "$next"
mv -Tf -- "$next" "$base/current"
printf 'Published WebSCUMM %s\n' "$(cat "$base/current/revision.txt")"
