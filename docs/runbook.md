# Runbook

fiveguesses.app is a static build served by Apache 2.4 on a KeyHelp host; `.htaccess` in the
docroot holds the single-page fallback, caching and security headers. Values below are examples:
host `203.0.113.10`, user `deploy`, docroot `/home/deploy/www/fiveguesses.app/`.

## 1. Domain

1. In KeyHelp add `fiveguesses.app`, redirect `www.` to it, turn on Let's Encrypt and force HTTPS.
   Renewal uses `.well-known/` in the docroot, which every sync excludes.
2. Once HTTPS works, enable the commented-out `Strict-Transport-Security` line in
   `public/.htaccess` with the next release.

## 2. Deploy key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/fiveguesses-deploy -C "deploy fiveguesses.app" -N ""
```

Add the public key to the deploy user's `~/.ssh/authorized_keys`, limited to rsync into the
docroot (`command -v rrsync` on the host gives the path):

```text
restrict,command="/usr/bin/rrsync -wo /home/deploy/www/fiveguesses.app" ssh-ed25519 AAAA... deploy fiveguesses.app
```

If rrsync can't run there (it needs `python3` and a non-jailed shell), use at least `restrict`.
Check the restriction: `ssh -i ~/.ssh/fiveguesses-deploy deploy@203.0.113.10 true` must fail.
If it succeeds, set `DEPLOY_PATH` to the full docroot path, never `.`.

## 3. Secrets

Repository secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY` (the whole private key file) and
`DEPLOY_PATH` (`.` with rrsync, otherwise the docroot path without a trailing slash). Without all
four the deploy job is skipped.

## 4. Deploy

release-please needs "Allow GitHub Actions to create and approve pull requests" (Settings →
Actions → General). A release published by the release run does not trigger the deploy, so start
it by hand once the release is out:

```bash
gh workflow run deploy.yml -R luminare-dev/FiveGuesses -f tag=vX.Y.Z
```

The workflow downloads the web archive and `SHA256SUMS` of that release, verifies the checksum,
extracts with `tar --touch` and syncs with
`rsync -az --delete-after --delay-updates --exclude='.well-known/'`. `--touch` matters: the archive
dates every file to 1970, and without it rsync would skip a changed `index.html` of the same size.

Manual deploy, from an empty temp folder:

```bash
gh release download vX.Y.Z -R luminare-dev/FiveGuesses --pattern 'fiveguesses-web-*.tar.gz' --pattern SHA256SUMS
sha256sum -c --ignore-missing SHA256SUMS
mkdir site && tar -xzf fiveguesses-web-X.Y.Z.tar.gz --strip-components=1 --touch -C site
rsync -az --delete-after --delay-updates --exclude='.well-known/' -e 'ssh -i ~/.ssh/fiveguesses-deploy' site/ deploy@203.0.113.10:./
```

## 5. Verify

```bash
curl -sSI https://fiveguesses.app/ | grep -iE '^(HTTP|content-security-policy|x-content-type-options|cache-control)'
curl -sSI https://fiveguesses.app/manifest.webmanifest | grep -iE '^(HTTP|content-type)'
curl -sSI https://fiveguesses.app/legal/ | grep -i '^HTTP'
```

Expect `200`, a CSP header, `nosniff`, `cache-control: no-cache` on the page and
`application/manifest+json` for the manifest. Then play a round.

## 6. Rollback

Run the deploy workflow (or the manual deploy) with the previous tag.

## 7. Logs

Shorten IP addresses after at most 7 days and delete logs after at most 5 weeks. The privacy page
(`/legal/`) states these values, so the server setting must match.

## 8. API (api.fiveguesses.app)

The Worker `fiveguesses-api` (Cloudflare Workers Free, Durable Objects on SQLite) serves song
sources, playlist import and rooms. The account needs a workers.dev subdomain once (open Workers
in the dashboard) before the first upload.

```sh
set -a; . /path/to/fiveguesses.env; set +a   # CLOUDFLARE_API_TOKEN, YOUTUBE_API_KEY
python3 -I api/scripts/deploy.py             # upload, migration, secret, custom domain, health poll
node api/scripts/smoke.mjs                   # live checks, rooms over WebSocket included
```

Rollback: check out the previous `api/` and run `deploy.py --no-secret` again. To remove it:
`DELETE /accounts/{account}/workers/domains/{domain_id}`, then
`DELETE /accounts/{account}/workers/scripts/fiveguesses-api?force=true`.

## When things break

- **Site down after a deploy** (403, 500, blank page): roll back, then check that `index.html`,
  `.htaccess`, `_expo/` and `legal/` are in the docroot and that `AllowOverride` is on.
- **Certificate expired**: request it again in KeyHelp; make sure `.well-known/` was not deleted
  and DNS is right.
- **Deploy workflow red**: a checksum mismatch means the release files changed; `Permission denied`
  means a wrong key or user; `No such file` means a wrong `DEPLOY_PATH`.
- **Manifest served as `application/octet-stream`**: `.htaccess` overrides are off for the domain.
