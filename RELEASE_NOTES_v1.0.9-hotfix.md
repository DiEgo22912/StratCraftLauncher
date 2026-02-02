# v1.0.9 Hotfix (2026-02-01)

This hotfix addresses critical session and UX issues discovered after v1.0.9:

Fixed:
- Corrected "Остаться в системе" persistence: token is now saved only when the option is enabled; disabling it removes any persisted token.
- Prevented recursive `/api/me` session-restore loops that caused repeated requests.
- Made login transition non-blocking (UI is interactive immediately after login).
- Adjusted spacing between password and auth checkbox options for better layout.

Notes:
- Source code updated and pushed to `main` branch, commit: 66a5cdd.
- Please test login/logout and restart flows before distributing widely.
