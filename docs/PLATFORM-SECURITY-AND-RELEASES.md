# Platform security and release policy

## Local credential protection

Rmango uses Electron's asynchronous `safeStorage` API for cloud-session tokens and the optional local conversation cache.

- Windows: Windows DPAPI.
- macOS: the user's login Keychain.
- Linux: Secret Service / GNOME Keyring or KWallet. The app refuses Electron's `basic_text` fallback rather than saving account tokens through that fallback.

The app shows the detected key-store status under Settings → Privacy & Security. If the key store is unavailable, sign-in/session persistence is blocked instead of writing account credentials in plain text.

The desktop renderer keeps Node integration disabled, context isolation and sandboxing enabled, a restrictive Content Security Policy, denied web permissions, and sender-checked IPC.

## Email verification and account security

Account registration uses Supabase email confirmation and redirects to the Rmango confirmation page. The desktop app can request another confirmation email. The resend endpoint returns a generic response to avoid exposing whether an email address belongs to an account, and Supabase remains responsible for its configured resend limits.

Access tokens are returned with `Cache-Control: no-store` headers. Supabase credentials with administrative privileges must remain on the cloud server; they must never be bundled in the desktop app.

## Build targets

Run these commands from the `app` directory:

- Windows: `npm run dist:win`
- Linux x64: `npm run dist:linux` (AppImage and DEB)
- macOS: `npm run dist:mac` (DMG and ZIP; build on macOS)

The macOS target enables the hardened runtime and uses `build/entitlements.mac.plist`. A proper Developer ID signature and notarization are still required for normal Gatekeeper trust and consistent Keychain access. These credentials must be configured by the release owner; do not use an ad-hoc signature as a public release identity.

Linux builds require a desktop Secret Service/KWallet provider for secure account persistence. The app currently does not ship a Flatpak package.

## Stable update policy

- Pushes to `main` create CI-only prerelease artifacts. They do not publish stable update feeds or create a sequence of public app updates.
- A deliberate `vMAJOR.MINOR.PATCH` tag, or a manual workflow dispatch with a version tag, is required to publish a stable Windows update.
- Windows update releases are published only when a trusted Authenticode signing certificate and cloud update endpoint are configured. Unsigned CI installers are not published to the in-app update feed.
- The installed Windows app checks on the configured five-minute cadence, accepts only newer stable versions, reuses Electron updater's checksum-validated cached installer, and waits for the user to install it.
- macOS auto-update is not enabled until signed and notarized release infrastructure exists.
- Linux auto-update is not enabled until a signed update-manifest trust chain is configured. Use the latest published AppImage/DEB package manually until then.

## Remaining release-owner action

The live Supabase security advisor still reports **Leaked Password Protection Disabled**. Enable it in the Supabase Dashboard under **Authentication → Security / Password Security**. This setting is controlled by the Supabase Auth project configuration, not by the SQL schema, so the desktop application cannot safely toggle it through a migration.
