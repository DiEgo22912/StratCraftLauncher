#!/usr/bin/env bash
set -euo pipefail

# Usage: build-client.sh <source_dir> <output_dir> <version>
# Example: ./build-client.sh ./client-sample dist 1.20.1-forge-2026-01-31

SRC_DIR=${1:-client-files}
OUT_DIR=${2:-dist}
VERSION=${3:-dev}

mkdir -p "$OUT_DIR"
ARCHIVE_NAME="StratCraftClient-${VERSION}.zip"
ARCHIVE_PATH="$OUT_DIR/$ARCHIVE_NAME"

if [ ! -d "$SRC_DIR" ]; then
  echo "Source directory '$SRC_DIR' not found"
  exit 1
fi

# Create archive
(cd "$SRC_DIR" && zip -r "../$ARCHIVE_PATH" .)

# Compute size
SIZE=$(stat -c%s "$ARCHIVE_PATH" 2>/dev/null || stat -f%z "$ARCHIVE_PATH")

# Compute sha512 and base64-encode (portable)
if command -v openssl >/dev/null 2>&1; then
  SHA512_BASE64=$(openssl dgst -sha512 -binary "$ARCHIVE_PATH" | openssl base64 -A)
else
  # fallback to sha512sum + base64
  SHA512_HEX=$(sha512sum "$ARCHIVE_PATH" | awk '{print $1}')
  # convert hex to binary then base64
  SHA512_BASE64=$(echo "$SHA512_HEX" | xxd -r -p | base64 -w0)
fi

MANIFEST="$OUT_DIR/client-manifest.json"
cat > "$MANIFEST" <<EOF
{
  "version": "$VERSION",
  "type": "archive",
  "archive": {
    "url": "$ARCHIVE_NAME",
    "sha512": "$SHA512_BASE64",
    "size": $SIZE
  },
  "notes": "Built by CI",
  "published": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Built $ARCHIVE_PATH"
echo "Manifest: $MANIFEST"

echo "Done."
