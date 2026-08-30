#!/bin/zsh
set -e
cd "$(dirname "$0")"

mkdir -p native/build
swiftc native/QuotaTideCompanion.swift -module-cache-path native/build/module-cache -framework AppKit -framework CoreGraphics -o native/build/QuotaTideCompanion

if ! curl --silent --fail --max-time 1 http://127.0.0.1:4319/api/health >/dev/null 2>&1; then
  PORT=4319 node server/bridge.mjs >"${TMPDIR:-/tmp}/quota-tide-server.log" 2>&1 &
fi

for _ in {1..20}; do
  if curl --silent --fail --max-time 1 http://127.0.0.1:4319/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

exec native/build/QuotaTideCompanion
