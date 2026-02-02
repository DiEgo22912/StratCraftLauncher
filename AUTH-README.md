Auth integration notes

- The launcher now attempts to use a remote auth API by default (see `preload.js` AUTH_API_URL).
- If remote API returns error or network is down, the launcher falls back to local registration/login (existing IPC handlers and local `data/users.json`).
- Successful register/login via remote API will save the JWT token into launcher settings (`authToken` in `data/launcher-settings.json`).

To change the remote API URL, edit `preload.js` and update the `AUTH_API_URL` constant or extend settings to make it configurable.