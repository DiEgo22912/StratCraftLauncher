#!/usr/bin/env bash
set -euo pipefail

# Template: upload a file to CloudPub WebDAV endpoint.
# Requires:
# - CLOUDPUB_WEBDAV_URL (e.g., https://mounpoint.cloudpub.ru/your/path/)
# - CLO_API_KEY (used here as Basic user:token or in Authorization header depending on your account)
# Example usage:
# CLOUDPUB_WEBDAV_URL="https://mounpoint.cloudpub.ru/stratcraft-client/" CLO_API_KEY="token..." ./upload-to-cloudpub.sh dist/StratCraftClient-1.0.0.zip

FILE=${1:?file to upload}
if [ -z "${CLOUDPUB_WEBDAV_URL:-}" ]; then
  echo "Please set CLOUDPUB_WEBDAV_URL env var to your WebDAV upload URL"
  exit 1
fi

if [ -z "${CLO_API_KEY:-}" ]; then
  echo "Please set CLO_API_KEY env var with your CloudPub API key or token"
  exit 1
fi

FNAME=$(basename "$FILE")
DEST_URL="${CLOUDPUB_WEBDAV_URL%/}/$FNAME"

# This is a template: CloudPub authentication for WebDAV may require basic auth or token header.
# Adjust headers according to your CloudPub account settings.

# Example with token header:
curl -X PUT "$DEST_URL" \
  -H "Authorization: Bearer $CLO_API_KEY" \
  --data-binary "@$FILE"

echo "Uploaded $FILE -> $DEST_URL"
