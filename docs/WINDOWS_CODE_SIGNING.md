# Windows installer code signing

Rmango's Windows release workflow signs the installer only when a real, trusted Windows code-signing certificate and its private key are supplied.

## GitHub Actions secrets

In the repository's **Settings → Secrets and variables → Actions**, add:

- `RMANGO_SIGNING_PFX_BASE64`: the base64-encoded PFX file containing the publisher certificate and private key.
- `RMANGO_SIGNING_PFX_PASSWORD`: the PFX export password.

Keep both values in GitHub Actions secrets. Do not commit the PFX, put it in a public artifact, or paste the password into an issue or chat.

The PFX must be a genuine publisher code-signing certificate issued by a trusted certificate authority. A self-signed certificate does not establish a trusted publisher identity and will not remove Windows unknown-publisher warnings.

## Release behaviour

- With a valid certificate, the workflow signs the Windows build, verifies the installer with Authenticode, and may publish the stable release and auto-update feed.
- If no certificate is configured, the workflow can still build an unsigned CI artifact for testing, but it will not publish an unsigned stable release or an auto-update feed.
- If only one secret is configured, or the PFX cannot be read, the workflow fails rather than silently downgrading to an unsigned release.
- A signed installer must pass `Get-AuthenticodeSignature` with status `Valid` before it can be published.

After adding both secrets, run the Windows installer workflow again from the repository's Actions tab.
