# StratCraftClient — client auto-update scaffolding

This folder contains scaffolding to implement auto-updates for the Minecraft client (Forge 1.20.1) using an "archive"-based strategy and optional CloudPub mirror.

Important security note
- **Do not commit** API keys or tokens to the repository.
- Add your CloudPub API key as a repository secret (e.g. `CLO_API_KEY`) and, if needed, a `CLOUDPUB_WEBDAV_URL` secret with the WebDAV upload endpoint.

What is included
- `manifest.example.json` — example manifest format for an archive-based client update.
- `build-client.sh` — simple script to create the client ZIP and generate a manifest with sha512.
- `upload-to-cloudpub.sh` — template script showing how to upload to CloudPub (WebDAV/curl). Fill in your WebDAV URL and credentials or use secrets.
- `.github/workflows/client-publish.yml.example` — a GitHub Actions workflow template (manual dispatch) that calls the build script, creates a release, and optionally uploads to CloudPub.

How it works (high-level)
1. CI builds the client archive (zip) and computes sha512; generates `client-manifest.json`.
2. CI publishes the zip and manifest as a GitHub Release asset (and optionally uploads to CloudPub WebDAV as a mirror).
3. Launcher checks the manifest URL, verifies sha512, downloads the ZIP to a temp folder, verifies checksum, then atomically replaces the client folder (with backup/rollback support).

Next steps I can do for you (pick any):
- Wire the workflow into your repo (create `.github/workflows/client-publish.yml`) and make it run manually on your confirmation.
- Add a small client update API to the launcher (main/preload/renderer) to check/download/apply updates and UI.
- If you want me to set the GitHub secret `CLO_API_KEY` from the key you provided, confirm and I will store it securely (I will not echo the key anywhere).

If you'd like, I'll now add the example files and a workflow template into the repository.
