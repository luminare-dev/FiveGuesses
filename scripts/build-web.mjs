// Builds the static web site into web-build/: runs the Expo web export, writes the licence notices
// of the npm packages in the bundle, copies the font next to the bundle, names the stylesheets after
// their content hash, injects the precache list and build id into the service worker, and checks
// that the shell carries no inline style or script (the Content-Security-Policy allows neither).
// Node standard library only; `npm run build`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'web-build');

function fail(message) {
  console.error(`build-web: ${message}`);
  process.exit(1);
}

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]
  );

// 1. Export the web bundle and the public/ files. The source maps only tell step 1b which packages
// the bundle holds; step 1b removes them again.
execFileSync(
  process.execPath,
  [
    require.resolve('expo/bin/cli'),
    'export', '--platform', 'web', '--output-dir', 'web-build', '--clear', '--source-maps',
  ],
  { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' } }
);

// 1b. Third-party notices. The minified bundle drops the licence notices of the npm packages it
// contains, so every package named in a bundle's source map is listed in
// web-build/third-party-notices.txt with its version, its licence and the licence files it ships.
// A package without a licence file must declare MIT: its entry then carries the copyright lines of
// its bundled files and the MIT terms of this repository's LICENSE. Then the source map is deleted
// and the comment lines that point to it are cut from the end of the bundle, which leaves the bundle
// byte for byte as an export without source maps.
const bundleDir = join(outDir, '_expo', 'static', 'js', 'web');
const bundleNames = existsSync(bundleDir) ? readdirSync(bundleDir).filter((name) => name.endsWith('.js')) : [];
const packageFiles = new Map(); // package folder from the project root -> its bundled files
for (const name of bundleNames) {
  const jsPath = join(bundleDir, name);
  if (!existsSync(`${jsPath}.map`)) fail(`${name} has no source map, so its third-party notices are unknown`);
  for (const source of JSON.parse(readFileSync(`${jsPath}.map`, 'utf8')).sources) {
    const at = source.lastIndexOf('/node_modules/');
    if (at === -1) continue; // the app's own files and the stubs the bundler generates
    const parts = source.slice(at + '/node_modules/'.length).split('/');
    const dir = source.slice(0, at) + '/node_modules/' + parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/');
    packageFiles.set(dir, [...(packageFiles.get(dir) ?? []), source]);
  }
  rmSync(`${jsPath}.map`);
  const bytes = readFileSync(jsPath);
  const tail = /(?:\n\/\/# (?:sourceMappingURL|debugId)=[^\n]*)+$/.exec(bytes.toString('latin1'));
  const pointsToMap = (line) => line.startsWith('//# sourceMappingURL=') && line.endsWith(`/${name}.map`);
  if (tail === null || !tail[0].split('\n').some(pointsToMap)) {
    fail(`${name} does not end with the reference to its source map`);
  }
  writeFileSync(jsPath, bytes.subarray(0, tail.index));
}
const leftMaps = listFiles(outDir).filter((file) => file.endsWith('.map'));
if (leftMaps.length > 0) {
  fail(`source maps left in the export: ${leftMaps.map((file) => relative(outDir, file)).join(', ')}`);
}
const onDisk = (path) => (path.startsWith(root + sep) ? path : join(root, path)); // map paths start at the root
const licence = readFileSync(join(root, 'LICENSE'), 'utf8');
const mitTerms = licence.slice(licence.indexOf('Permission is hereby granted'));
if (!licence.startsWith('MIT License') || mitTerms === licence) fail('LICENSE does not hold the MIT terms');
const rule = (char) => char.repeat(80);
const entries = new Map(); // "name version" -> entry text; a second copy of the same release adds nothing
for (const [dir, files] of packageFiles) {
  const pkg = JSON.parse(readFileSync(join(onDisk(dir), 'package.json'), 'utf8'));
  const spdx = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'not declared');
  const licenceFiles = readdirSync(onDisk(dir))
    .filter((file) => /^(licen[cs]e|copying|notice)(\.(md|markdown|txt))?$/i.test(file))
    .sort();
  let text;
  if (licenceFiles.length > 0) {
    text = licenceFiles.map((file) => readFileSync(join(onDisk(dir), file), 'utf8').trim()).join('\n\n');
  } else {
    if (spdx !== 'MIT') {
      fail(`${pkg.name} ${pkg.version} ships no licence file and declares ${spdx}; write its notice by hand`);
    }
    const holders = new Set();
    for (const file of files) {
      const lines = readFileSync(onDisk(file), 'utf8').matchAll(/^[\s/*#]*(Copyright (?:\(c\)|©|\d{4}).*)$/gm);
      for (const match of lines) holders.add(match[1].trim());
    }
    if (holders.size === 0) {
      fail(`${pkg.name} ${pkg.version} ships no licence file and its bundled files name no copyright holder`);
    }
    text = `MIT License\n\n${[...holders].join('\n')}\n\n${mitTerms.trim()}`;
  }
  const key = `${pkg.name} ${pkg.version}`;
  if (!entries.has(key)) entries.set(key, `${rule('=')}\n${key}\nLicence: ${spdx}\n${rule('-')}\n${text}\n`);
}
writeFileSync(
  join(outDir, 'third-party-notices.txt'),
  [
    'Third-party notices for the FiveGuesses web build',
    '',
    'The script bundle in _expo/static/js/web/ contains code from the npm packages below. Each entry',
    'gives the package, its version and its licence, followed by the licence text the package ships;',
    'for a package without a licence file, the copyright lines of its files and the MIT terms it',
    'declares. The Sora typeface in fonts/ is licensed under the SIL Open Font License 1.1, whose text',
    'is in fonts/Sora-OFL.txt.',
    '',
    ...[...entries.keys()].sort().map((key) => entries.get(key)),
  ].join('\n')
);

// 2. The one font copy in git is served from /fonts/.
mkdirSync(join(outDir, 'fonts'), { recursive: true });
for (const name of ['Sora-Variable.ttf', 'Sora-OFL.txt']) {
  copyFileSync(join(root, 'assets', 'fonts', name), join(outDir, 'fonts', name));
}

// 2b. Each stylesheet is renamed after the first 32 hex characters of the SHA-256 of its bytes
// (styles.<hash>.css, legal/legal.<hash>.css), and the page that links it is rewritten to the new
// name. A deploy that changes a stylesheet thereby changes its URL, so neither the browser's HTTP
// cache nor the service worker's cache can pair a new page and bundle with the previous styles,
// and .htaccess can let the browser keep a stylesheet for a year. A stylesheet that public/ does
// not hold is skipped, like a missing precache candidate.
const stylesheets = [
  { page: 'index.html', href: '/styles.css' },
  { page: 'legal/index.html', href: '/legal/legal.css' },
];
const hashedStylesheets = stylesheets.flatMap(({ page, href }) => {
  const cssPath = join(outDir, href.slice(1));
  const pagePath = join(outDir, page);
  if (!existsSync(cssPath)) return [];
  if (!existsSync(pagePath)) fail(`web-build/${page} was not written`);
  const digest = createHash('sha256').update(readFileSync(cssPath)).digest('hex').slice(0, 32);
  const hashedHref = href.replace(/\.css$/, `.${digest}.css`);
  const link = `href="${href}"`;
  const pageText = readFileSync(pagePath, 'utf8');
  if (pageText.split(link).length !== 2) fail(`web-build/${page} does not link ${href} exactly once`);
  renameSync(cssPath, join(outDir, hashedHref.slice(1)));
  writeFileSync(pagePath, pageText.replace(link, `href="${hashedHref}"`));
  return [hashedHref];
});

// 3. Precache list: the shell files that exist plus every bundle and every file Expo wrote under
// /assets/ (the images the bundle requires, such as the About sheet's lockup), sorted. The
// stylesheets, the bundles and the assets carry a content hash in their names, so the worker's
// cache-first answer is never stale.
const candidates = [
  '/',
  '/index.html',
  ...hashedStylesheets,
  '/manifest.webmanifest',
  '/register-sw.js',
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icons/app-icon-192.png',
  '/icons/app-icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/fonts/Sora-Variable.ttf',
  '/legal/index.html',
];
const bundles = bundleNames.map((name) => `/_expo/static/js/web/${name}`);
// Each path segment is written as the browser serialises a URL path, so the entry equals the
// worker's url.pathname also for names with '@' (scoped packages), spaces or non-ASCII letters.
const urlSegment = (name) =>
  new URL('http://build.invalid/' + name.replace(/[%#?\\]/g, encodeURIComponent)).pathname.slice(1);
const assetDir = join(outDir, 'assets');
const assets = existsSync(assetDir)
  ? listFiles(assetDir).map((file) => '/' + relative(outDir, file).split(sep).map(urlSegment).join('/'))
  : [];
const toFile = (url) => join(outDir, url === '/' ? 'index.html' : decodeURIComponent(url.slice(1)));
const precache = [...candidates, ...bundles, ...assets].filter((url) => existsSync(toFile(url))).sort();

// 4. Build id: sha256 over the bytes of every precached file, in list order.
const hash = createHash('sha256');
for (const url of precache) hash.update(readFileSync(toFile(url)));
const buildId = hash.digest('hex').slice(0, 12);

// 5. Service worker placeholders.
const swPath = join(outDir, 'sw.js');
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8');
  if (!sw.includes('__PRECACHE__')) fail('web-build/sw.js has no __PRECACHE__ placeholder');
  if (!sw.includes('__BUILD_ID__')) fail('web-build/sw.js has no __BUILD_ID__ placeholder');
  writeFileSync(
    swPath,
    sw.replaceAll('__PRECACHE__', () => JSON.stringify(precache)).replaceAll('__BUILD_ID__', () => buildId)
  );
} else {
  console.log('sw.js not present; precache skipped');
}

// 6. Shell guard: no inline style or script, and the mount point must be there.
const htmlPath = join(outDir, 'index.html');
if (!existsSync(htmlPath)) fail('web-build/index.html was not written');
const html = readFileSync(htmlPath, 'utf8');
if (/<style[\s>]/i.test(html)) fail('web-build/index.html contains an inline <style> element');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) fail('web-build/index.html contains an inline <script> element');
if (/\sstyle="/i.test(html)) fail('web-build/index.html contains a style attribute');
if (!html.includes('<div id="root">')) fail('web-build/index.html lacks <div id="root">');

// 7. The Apache settings must travel with the export.
if (!existsSync(join(outDir, '.htaccess'))) fail('web-build/.htaccess is missing (public/.htaccess was not copied)');

// 8. Report the numbers the README quotes.
for (const url of bundles) {
  const bytes = readFileSync(toFile(url));
  const gzipped = gzipSync(bytes, { level: 9 }).length;
  console.log(`bundle ${url.slice(url.lastIndexOf('/') + 1)}: ${bytes.length} bytes, ${gzipped} bytes gzip`);
}
console.log(`precache: ${precache.length} files, build id ${buildId}`);
