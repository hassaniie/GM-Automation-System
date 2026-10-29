#!/bin/sh
# Rebuilds index.html from src/. The output is byte-identical to the published prototype.
# The engine runs inside an IIFE so its top-level consts don't clash with the scene and UI scripts.
set -e
cd "$(dirname "$0")"
{
  cat src/00-shell-open.html
  cat src/01-head.html
  echo '<script>(function(){'; cat src/02-engine.js; echo '})();</script>'
  echo '<script>'; cat src/03-scene.js; echo '</script>'
  echo '<script>'; cat src/04-ui.js; echo '</script>'
  cat src/05-shell-close.html
} > index.html
wc -c index.html
