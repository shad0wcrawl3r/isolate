# Isolate

Firefox extension that opens pages in a fresh, throwaway container per tab,
so each isolated tab starts with no cookies or logins. A container and its
data are deleted when its last tab closes. Google One Tap sign-in prompts are
blocked inside isolated tabs.

- **Toolbar button / Ctrl+Alt+I**: reopen the current page in a new isolated tab.
- **Right-click a link → Open Link in Isolated Tab.**
- Isolated tabs show an `ISO` badge.

Desktop Firefox only (Android has no containers). Containers cannot be used
in private windows, so isolated tabs always open in a normal window.

## Releasing

Signed as an **unlisted** add-on on AMO (private, not in the public store).

One-time setup: create AMO API credentials at
<https://addons.mozilla.org/developers/addon/api/key/> and add them as
repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.

To release:

1. Bump `version` in `manifest.json` (AMO rejects a version it has already signed).
2. Commit, then tag and push:
   ```
   git tag v1.4.0
   git push origin main v1.4.0
   ```
3. The workflow signs the extension and attaches the `.xpi` to a GitHub release.
   Install it via `about:addons` → gear → *Install Add-on From File*.

## Local development

Load `manifest.json` from `about:debugging#/runtime/this-firefox` →
*Load Temporary Add-on*. Debug output is in the extension's *Inspect* console
(enable the *Debug* level for `[isolate]` lines).
