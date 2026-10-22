# Runbook

How fiveguesses.app is hosted and deployed, and what to do when it breaks. The site is a static
build served by Apache 2.4 on a KeyHelp host; `.htaccess` in the docroot carries the single-page
fallback, the caching rules and the security headers. Every value below is an example: host
`203.0.113.10`, user `deploy`, docroot `/home/deploy/www/fiveguesses.app/`. Not affiliated with or
endorsed by Keyweb AG; KeyHelp is a registered trademark of Keyweb AG.

## 1. Create the domain

1. In KeyHelp add the domain `fiveguesses.app` and let `www.fiveguesses.app` redirect to it.
2. Turn on Let's Encrypt for the domain and force HTTPS. KeyHelp requests and renews the
   certificate through the `.well-known/` folder in the docroot; the deploy's rsync keeps that
   folder (`--exclude='.well-known/'`).
3. Note the docroot path: the deploy key of step 2 is limited to it, and without rrsync it is
   `DEPLOY_PATH`.
4. Once HTTPS answers, enable the `Strict-Transport-Security` line in `public/.htaccess` (it is
   commented out) with the next release.

## 2. Deploy user and SSH key

1. Use the KeyHelp account that owns the docroot as the deploy user (example: `deploy`), or create
   one for the domain. The user needs `rsync` on the host and write access to the docroot.
2. On your own machine generate a key pair without a passphrase (the workflow cannot type one).
   It goes into `~/.ssh/`, outside every clone of this repository:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/fiveguesses-deploy -C "deploy fiveguesses.app" -N ""
   ```

3. Append `~/.ssh/fiveguesses-deploy.pub` to the deploy user's `~/.ssh/authorized_keys` on the
   host, restricted to rsync into the docroot. `rrsync` ships with rsync 3.2.4 and later; run
   `command -v rrsync` on the host and use the path it prints. The line reads:

   ```text
   restrict,command="/usr/bin/rrsync -wo /home/deploy/www/fiveguesses.app" ssh-ed25519 AAAA... deploy fiveguesses.app
   ```

   `restrict` turns off forwarding and the terminal, and the forced command lets the key do
   nothing but write with rsync below the docroot (`-wo`: write only). rrsync needs `python3` and a
   normal, not chrooted, shell on the host; a jailed KeyHelp account may lack them. If rrsync
   cannot run there, put at least `restrict` in front of the key (`restrict ssh-ed25519 AAAA...`).
4. Test it with a dry run that changes nothing:

   ```bash
   mkdir -p /tmp/fg-empty && rsync -n -az -e 'ssh -i ~/.ssh/fiveguesses-deploy' /tmp/fg-empty/ deploy@203.0.113.10:./
   ```

   With the forced command, `./` is the docroot; without rrsync, use the docroot path instead
   (`deploy@203.0.113.10:/home/deploy/www/fiveguesses.app/`). The dry run succeeds either way, so
   also check that the restriction is active:

   ```bash
   ssh -i ~/.ssh/fiveguesses-deploy deploy@203.0.113.10 true; echo "exit $?"
   ```

   With rrsync in place this fails (a non-zero exit), because the key may run nothing but rsync.
   If it prints `exit 0`, the key is not restricted: set `DEPLOY_PATH` to the docroot path, never
   `.`. The deploy workflow runs the same check before it syncs to a relative path and stops when
   the command succeeds.

## 3. The four repository secrets

Settings → Secrets and variables → Actions → New repository secret, one per row:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `203.0.113.10` (or the host name) |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_KEY` | The whole content of the private key file `~/.ssh/fiveguesses-deploy`, including the BEGIN and END lines |
| `DEPLOY_PATH` | `.` with the rrsync key of step 2 (paths are relative to the folder rrsync allows; the workflow checks that the key is restricted before it syncs to a relative path); without rrsync the docroot, `/home/deploy/www/fiveguesses.app` (no trailing slash; the workflow adds one) |

The private key file stays on your machine or is deleted after the secret is set; it is never
committed.

## 4. Deploy with the workflow

release-please opens the release pull request with `GITHUB_TOKEN`, so it needs the setting "Allow
GitHub Actions to create and approve pull requests" (Settings → Actions → General → Workflow
permissions; when the organization's Actions settings turn it off, turn it on there first).

The release run that follows a merged release pull request publishes the release, but it does
not start the deploy: it publishes with `GITHUB_TOKEN`, and GitHub starts no workflow for a
release published that way. Once that run is green, start `.github/workflows/deploy.yml` with the
new tag: Actions → deploy → Run workflow → tag `vX.Y.Z`, or

```bash
gh workflow run deploy.yml -R luminare-dev/FiveGuesses -f tag=vX.Y.Z
```

The same command deploys any earlier tag again. The workflow also starts on its own when a person
publishes a release, for example a draft published by hand on the releases page.

The `check` job turns the four secrets into one output; without all four the `deploy` job is
skipped and the run stays green. The `deploy` job downloads `fiveguesses-web-X.Y.Z.tar.gz` and
`SHA256SUMS` from that release, verifies the checksum, extracts the site with `tar --touch` and
runs `rsync -az --delete-after --delay-updates --exclude='.well-known/'` over SSH into
`DEPLOY_PATH`. It never builds anything: the files are the ones the release workflow built and
checksummed.

The archive dates every file to 1970 (time stamp 0) so that its bytes are reproducible. rsync
treats files of the same size and time stamp as unchanged, and two releases often differ only in
the bundle hash inside `index.html` and `sw.js`, so without `--touch` both files would stay old
while the old bundle is deleted: the page would load a file that no longer exists, and Apache
would keep the old `ETag`. `--touch` dates the extracted files to the deploy. `--delay-updates`
with `--delete-after` moves the new files into place together at the end and deletes the old ones
only after that.

## 5. Manual deploy from the latest release

Run these commands in an empty scratch folder outside the repository (for example
`cd "$(mktemp -d)"`), so the downloaded files and `site/` never land in a clone.

```bash
gh release download vX.Y.Z -R luminare-dev/FiveGuesses --pattern 'fiveguesses-web-*.tar.gz' --pattern SHA256SUMS
sha256sum -c --ignore-missing SHA256SUMS
gh attestation verify fiveguesses-web-X.Y.Z.tar.gz -R luminare-dev/FiveGuesses   # only for releases published after the repository went public
mkdir site && tar -xzf fiveguesses-web-X.Y.Z.tar.gz --strip-components=1 --touch -C site
rsync -az --delete-after --delay-updates --exclude='.well-known/' -e 'ssh -i ~/.ssh/fiveguesses-deploy' site/ deploy@203.0.113.10:./
```

The destination `./` is the docroot with the rrsync key of step 2; without rrsync, use the docroot
path (`deploy@203.0.113.10:/home/deploy/www/fiveguesses.app/`). Keep `--touch` and the rsync
options as they are (step 4 says why). The archive contains `.htaccess`; it must land in the
docroot. rsync copies it, while a file manager upload may hide dotfiles, so check afterwards with
`ls -la` in the docroot over your own SSH login (the deploy key only runs rsync), or with the
headers of step 6.

## 6. Verify

```bash
curl -sSI https://fiveguesses.app/ | grep -iE '^(HTTP|content-security-policy|x-content-type-options|cache-control)'
curl -sSI https://fiveguesses.app/manifest.webmanifest | grep -iE '^(HTTP|content-type)'
curl -sSI https://fiveguesses.app/fonts/Sora-Variable.ttf | grep -iE '^(HTTP|content-type)'
curl -sSI https://fiveguesses.app/legal/ | grep -i '^HTTP'
curl -sSI https://fiveguesses.app/no-such-page | grep -i '^HTTP'
```

Expected: `200` for the first four with `content-security-policy` and `x-content-type-options: nosniff`
on the page, `cache-control: no-cache` on `index.html`, `content-type: application/manifest+json`
for the manifest and `font/ttf` for the font; `200` for an unknown path too (the single-page
fallback serves `index.html`). Then open the site, play a round, open About and the privacy page.

## 7. Rollback

Deploy the previous release again: Actions → deploy → Run workflow with the previous tag, or step
5 with that tag. Both check the archive against that release's `SHA256SUMS`; with immutable
releases turned on (Settings → General → Releases), the archive and `SHA256SUMS` cannot have
changed since the release was published.

## 8. Log retention

Set the log policy for this domain to the same values as luminare.tech: IP addresses shortened
after at most 7 days, log files deleted after at most 5 weeks. The privacy page (`/legal/`) states
exactly these values, so the server setting must match it.

## 9. Failure modes

### Site down after a deploy

| | |
|---|---|
| **Meaning** | The rsync replaced the docroot with an incomplete or wrong tree, or `.htaccess` is missing. |
| **Impact** | Visitors get a 403, a 500 or a blank page. |
| **Diagnosis** | `curl -sSI https://fiveguesses.app/`; `ls -la` in the docroot over your own SSH login, not the deploy key (`index.html`, `.htaccess`, `_expo/`, `legal/`, `fonts/` present?); the Apache error log of the domain in KeyHelp. |
| **Mitigation** | Step 7 (rollback to the previous release). |
| **Fix** | Compare the extracted archive with the docroot; if `.htaccess` is rejected by Apache, check that `AllowOverride` is on for the domain in KeyHelp. |

### Certificate expired

| | |
|---|---|
| **Meaning** | Let's Encrypt renewal failed, usually because `.well-known/` was deleted or the DNS changed. |
| **Impact** | Browsers show a certificate warning; the service worker stops updating. |
| **Diagnosis** | `curl -sSI https://fiveguesses.app/` reports the TLS error; KeyHelp shows the certificate state of the domain. |
| **Mitigation** | Request the certificate again in KeyHelp. |
| **Fix** | Keep `.well-known/` out of every sync (the workflow and step 5 already exclude it) and fix the DNS record. |

### The `deploy` workflow is red

| | |
|---|---|
| **Meaning** | The download, the checksum, the SSH connection or the rsync failed. |
| **Impact** | The site stays on the previous release. |
| **Diagnosis** | Read the failed step in the run: `sha256sum` mismatch means the release files changed; `Permission denied` means the key or the user is wrong; `No such file` means `DEPLOY_PATH` is wrong (`.` with the rrsync key of step 2). |
| **Mitigation** | Step 5 (manual deploy). |
| **Fix** | Correct the secret in question (step 3) and re-run the workflow with the tag (step 4). |

### Wrong MIME type for `.webmanifest`

| | |
|---|---|
| **Meaning** | The host serves the manifest as `application/octet-stream`; the `AddType` line in `.htaccess` is not applied. |
| **Impact** | The browser does not offer to install the app. |
| **Diagnosis** | `curl -sSI https://fiveguesses.app/manifest.webmanifest` shows the wrong `content-type`. |
| **Mitigation** | None needed; the game plays without the manifest. |
| **Fix** | Allow `.htaccess` overrides for the domain in KeyHelp, or add the MIME type in the domain's Apache settings. |
