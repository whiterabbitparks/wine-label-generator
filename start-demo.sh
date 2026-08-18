#!/bin/bash
# One-command demo start (owner: double-click or `./start-demo.sh` in Terminal).
# Kills anything on :3200, builds if needed, starts the server, opens the page.
cd "$(dirname "$0")"
lsof -ti :3200 | xargs kill -9 2>/dev/null
sleep 1
if [ ! -f .next/BUILD_ID ]; then
  echo "No build found — building once (takes ~1 minute)…"
  npm run build
fi
PORT=3200 nohup npm run start > /tmp/8k-demo.log 2>&1 &
echo "Starting the press…"
for i in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3200/ | grep -q 200; then
    echo "Ready: http://localhost:3200  (classic: /classic, admin: /admin)"
    open http://localhost:3200
    exit 0
  fi
done
echo "Server did not come up — see /tmp/8k-demo.log"
exit 1
