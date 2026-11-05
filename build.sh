#!/bin/sh
# Rebuilds index.html from src/.
# The engine runs inside an IIFE so its top-level consts don't clash with the scene and UI scripts.
set -e
cd "$(dirname "$0")"
{
  cat src/00-shell-open.html
  cat src/01-head.html
  echo '<script>(function(){'; cat src/02-engine.js; echo '})();</script>'
  echo '<script>'; cat src/03-scene.js; echo '</script>'
  echo "<script>"; cat src/04-ui.js src/05-app.js src/06-auth.js src/07-admin.js src/08-screens.js src/08b-reports.js src/08c-how.js src/90-boot.js; echo "</script>"
  cat src/99-shell-close.html
} > index.html
wc -c index.html
