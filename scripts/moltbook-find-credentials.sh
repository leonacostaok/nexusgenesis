#!/usr/bin/env bash
# Moltbook credentials recovery — search common paths only.
# Run on the production server (e.g. /opt/nexusgenesis).
set +e

echo "═══════════════════════════════════════════════════════════════"
echo "  1. ~/.config/moltbook/"
echo "═══════════════════════════════════════════════════════════════"
ls -la "$HOME/.config/moltbook/" 2>/dev/null || echo "  (not found at \$HOME/.config/moltbook/)"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  2. /opt/nexusgenesis/.config/moltbook/"
echo "═══════════════════════════════════════════════════════════════"
ls -la "/opt/nexusgenesis/.config/moltbook/" 2>/dev/null || echo "  (not found)"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  3. Project root .moltbook/ or .moltbot/"
echo "═══════════════════════════════════════════════════════════════"
for p in "/opt/nexusgenesis" "$HOME" "$(pwd)"; do
  if [ -d "$p/.moltbook" ]; then
    echo "FOUND: $p/.moltbook"
    ls -la "$p/.moltbot/skills/moltbook/" 2>/dev/null
  fi
  if [ -d "$p/.moltbot" ]; then
    echo "FOUND: $p/.moltbot"
    ls -la "$p/.moltbot/" 2>/dev/null
    ls -la "$p/.moltbot/skills/moltbook/" 2>/dev/null
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  4. Find any 'credentials.json' under /opt and \$HOME"
echo "═══════════════════════════════════════════════════════════════"
find /opt "$HOME" -maxdepth 5 -type f -name 'credentials.json' 2>/dev/null | head -20

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  5. Find any file containing 'moltbook_' (api key prefix)"
echo "═══════════════════════════════════════════════════════════════"
find /opt "$HOME" -maxdepth 6 -type f \( -name '*.json' -o -name '*.txt' -o -name '*.env*' \) 2>/dev/null | \
  xargs grep -l 'moltbook_' 2>/dev/null | head -20

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  6. Env vars in current shell + any loaded .env"
echo "═══════════════════════════════════════════════════════════════"
env | grep -i moltbook || echo "  (no MOLTBOOK_* env vars)"
for f in "/opt/nexusgenesis/.env" "$HOME/.env" "$(pwd)/.env" "/opt/nexusgenesis/.env.local"; do
  if [ -f "$f" ]; then
    echo "  $f:"
    grep -i moltbook "$f" 2>/dev/null | sed 's/=.*/=<REDACTED>/' || true
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Done. Copy the output above and send back."
echo "═══════════════════════════════════════════════════════════════"
