#!/usr/bin/env bash
# Builds the Approach Control pages into $1 (a copy of atc/ and privacy/ already there):
# obfuscates the scripts, minifies the CSS and HTML, and stamps asset URLs with $2.
set -euo pipefail
OUT="$1"; V="${2:-dev}"
for f in "$OUT"/atc/assets/*.js; do
  npx -y javascript-obfuscator@4.1.1 "$f" --output "$f" \
    --compact true \
    --control-flow-flattening true \
    --control-flow-flattening-threshold 0.5 \
    --string-array true \
    --string-array-encoding base64 \
    --string-array-threshold 0.8 \
    --identifier-names-generator hexadecimal \
    --transform-object-keys true \
    --simplify true >/dev/null
done
npx -y clean-css-cli@5.6.3 -o "$OUT/atc/assets/atc.css" "$OUT/atc/assets/atc.css"
for f in "$OUT"/atc/index.html "$OUT"/atc/support/index.html "$OUT"/privacy/index.html; do
  sed -i.bak -E "s#(/atc/assets/[a-z]+\.(js|css))\"#\1?v=$V\"#g" "$f" && rm -f "$f.bak"
  npx -y html-minifier-terser@7.2.0 --collapse-whitespace --remove-comments --minify-js true "$f" -o "$f"
done
