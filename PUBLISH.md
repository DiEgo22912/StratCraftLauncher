Publishing updates (short guide)

1) Set GitHub repository info in `package.json` under `build.publish`:
   - `owner`: your GitHub user/org
   - `repo`: repo name

2) Add a secret `GH_TOKEN` in repository Settings → Secrets (personal access token with `repo` scope).

3) Create a tag (e.g., `v1.0.0`) and push it to trigger the workflow:
   - git tag v1.0.0
   - git push origin v1.0.0

4) The workflow `Build and Publish` will run and publish a release with the NSIS installer. The launcher auto-updater will use the release artifacts for updates.

Notes:
- For testing, you can run `npx electron-builder --win nsis --publish never` locally and upload the generated files manually to a test release.
- Make sure `productName`/`appId` in `package.json` are set correctly.
