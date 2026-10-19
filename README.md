# Isolate

A Firefox extension that opens pages in their own throwaway container, so an
isolated tab starts with no cookies, no logins and no site storage from your
other tabs or earlier sessions.

## Features

- **One container per isolated tab.** Every isolated tab gets a brand-new
  container. Open as many as you like; none of them share anything.
- **Cleaned up automatically.** When the last tab in a container closes, its
  cookies, local storage, IndexedDB and service workers are wiped and the
  container is deleted.
- **No Google One Tap.** "Sign in with Google" prompts are blocked inside
  isolated tabs.
- **No data collection.** The extension makes no network requests of its own.

## Usage

| Action | What it does |
| --- | --- |
| Toolbar button or <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd> | Reopen the current page in a new isolated tab |
| Right-click a link → **Open Link in Isolated Tab** | Open the link in a new isolated tab |

Isolated tabs show an **ISO** badge on the toolbar button and the container
name ("Isolated xxxx") in the address bar. Links opened from an isolated tab
stay in its container. You can change the shortcut in `about:addons` → gear
→ *Manage Extension Shortcuts*.

## Limitations

- Desktop Firefox only. Firefox for Android has no containers.
- Containers can't be used in private windows, so isolated tabs opened from a
  private window open in a normal window.
- Isolation covers cookies and site storage. Your IP address, browser
  fingerprint and normal browsing history are not affected.

## Development

Load `manifest.json` from `about:debugging#/runtime/this-firefox` →
*Load Temporary Add-on*. Click *Inspect* for the extension's console, and
enable the *Debug* level to see `[isolate]` log lines.

## Releasing

Pushing a tag that matches the `version` in `manifest.json` runs
`.github/workflows/release.yml`, which lints the extension, submits it to
addons.mozilla.org and creates a GitHub release:

```sh
git tag v1.5.0
git push origin main v1.5.0
```

The workflow needs AMO API credentials
(<https://addons.mozilla.org/developers/addon/api/key/>) stored as the
repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`. AMO rejects a
version number it has already received, so bump `version` before each release.

## Built with AI

This project was written with the help of an AI coding assistant
(Claude, by Anthropic), including the extension code, the release workflow
and this README. The author directed the work and tested every change by hand
in Firefox.

## License

[MIT](LICENSE)
