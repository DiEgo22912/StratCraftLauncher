Keytar integration notes

- Keytar will be used (when available) to store the auth token securely in the OS credential store.
- If Keytar is not available (native build missing), launcher falls back to storing `authToken` in `data/launcher-settings.json`.

Dev notes:
- Native module requires rebuilding for Electron. We added `electron-rebuild` as a devDependency and a `postinstall` script:
  - `npm install` will run `electron-rebuild -f -w keytar` to build Keytar for the current Electron version.

Windows prerequisites (if `npm install` fails):
- Install "Desktop development with C++" workload for Visual Studio 2022 (or Build Tools) and try again.

Migration:
- On startup, if a token exists in settings, it will be migrated to Keytar (and removed from the settings file).
