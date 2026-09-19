// Renders a "trending in Python" card as an SVG.
//
// GitHub has no official trending API, so this approximates it the way most
// tools do: repositories created recently, ordered by stars. That surfaces
// genuinely new projects rather than the same permanent giants. One is picked
// at random from the top of the list, so the card changes on every run even
// when the underlying ranking is stable.
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = 'dist';
const OUT_FILE = 'trending-python.svg';
const WINDOW_DAYS = 30;
const POOL = 15;

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// SVG has no text wrapping, so wrap by hand.
function wrap(text, maxChars, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line.length) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1,3}$/, '…');
  }
  return lines;
}

// Round DOWN, so 2,962 reads as 2.9k rather than being inflated to 3k.
const stars = (n) =>
  n >= 1000 ? (Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);

async function fetchTrending() {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  const q = encodeURIComponent(`language:python created:>${since}`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${POOL}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'd4v1dexe-profile-card',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const items = (data.items || []).filter((r) => !r.fork && !r.archived);
  if (!items.length) throw new Error('search returned no repositories');
  return items[Math.floor(Math.random() * items.length)];
}

function render(repo) {
  const desc = wrap(repo.description || 'No description.', 52, 2);
  const name = esc(repo.full_name.length > 38 ? repo.full_name.slice(0, 37) + '…' : repo.full_name);
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 170" width="520" height="170" role="img" aria-label="Trending Python repository: ${name}">
  <title>Trending in Python: ${name}</title>
  <style>
    .bg     { fill: #ffffff; stroke: #d0d7de; }
    .kicker { fill: #57606a; }
    .name   { fill: #0969da; }
    .desc   { fill: #424a53; }
    .meta   { fill: #57606a; }
    .star   { fill: #9a6700; }
    @media (prefers-color-scheme: dark) {
      .bg     { fill: #0d1117; stroke: #30363d; }
      .kicker { fill: #8b949e; }
      .name   { fill: #58a6ff; }
      .desc   { fill: #c9d1d9; }
      .meta   { fill: #8b949e; }
      .star   { fill: #e3b341; }
    }
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .t-kicker { font-size: 11px; letter-spacing: 2.2px; }
    .t-name   { font-size: 19px; font-weight: 600; }
    .t-desc   { font-size: 12.5px; }
    .t-meta   { font-size: 11px; }
  </style>

  <rect class="bg" x="0.5" y="0.5" width="519" height="169" rx="10" stroke-width="1"/>

  <text class="kicker t-kicker" x="24" y="32">TRENDING IN PYTHON</text>

  <text class="name t-name" x="24" y="64">${name}</text>

  <g class="desc t-desc">
${desc.map((l, i) => `    <text x="24" y="${92 + i * 19}">${esc(l)}</text>`).join('\n')}
  </g>

  <g transform="translate(24,140)">
    <path class="star" transform="scale(0.85)" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
    <text class="meta t-meta" x="22" y="12">${stars(repo.stargazers_count)}</text>
    <text class="meta t-meta" x="70" y="12">created ${esc(repo.created_at.slice(0, 10))}</text>
  </g>

  <text class="meta t-meta" x="496" y="152" text-anchor="end">updated ${esc(when)}</text>
</svg>
`;
}

// A fixed URL that forwards to whatever repo is currently on the card. The
// README links here, so the link can never fall out of step with the picture.
function redirect(repo) {
  const url = esc(repo.html_url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${url}">
<link rel="canonical" href="${url}">
<title>Redirecting to ${esc(repo.full_name)}</title>
</head>
<body>
<p>Redirecting to <a href="${url}">${esc(repo.full_name)}</a>.</p>
</body>
</html>
`;
}

const repo = await fetchTrending();
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, OUT_FILE), render(repo), 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), redirect(repo), 'utf8');
console.log(`picked ${repo.full_name} (${repo.stargazers_count} stars) -> ${repo.html_url}`);
