#!/bin/zsh
set -e
cd "$(dirname "$0")"

npm run build
PORT=4318 npm start &
SERVER_PID=$!
sleep 1
open "http://127.0.0.1:4318"
wait "$SERVER_PID"
