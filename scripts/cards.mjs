// Builds stats.svg and langs.svg for the profile README in the pink theme.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const outDir = process.argv[2] || "dist";
const user = process.env.GH_USER || "zainab-salah";

const PINK = "#FF8AAE";
const PLUM = "#94248c";
const TEXT = "#5a4a5e";
const BG = "#fff5f9";
const BORDER = "#f6c1d9";
const CARD_H = 216;

const query = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } }
      }
    }
    contributionsCollection {
      totalCommitContributions
      contributionCalendar { totalContributions weeks { contributionDays { contributionCount date } } }
    }
  }
}`;

async function load() {
  // Local preview: node scripts/cards.mjs dist sample.json
  if (process.argv[3]) return JSON.parse(readFileSync(process.argv[3], "utf8"));
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-cards" },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`); }
  if (!json.data?.user) throw new Error(`GraphQL failed: ${JSON.stringify(json.errors || json)}`);
  return json.data.user;
}

function streaks(days) {
  let longest = 0, run = 0;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today may have no contributions yet, so the current streak can end yesterday.
  let current = 0;
  let i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--;
  for (; i >= 0 && days[i].contributionCount > 0; i--) current++;
  return { current, longest };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function frame(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
  <style>
    .t { font: 600 16px 'Segoe UI', Ubuntu, sans-serif; fill: ${PLUM}; }
    .l { font: 400 13px 'Segoe UI', Ubuntu, sans-serif; fill: ${TEXT}; }
    .v { font: 700 13px 'Segoe UI', Ubuntu, sans-serif; fill: ${PLUM}; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${BG}" stroke="${BORDER}"/>
  <text x="24" y="34" class="t">${esc(title)}</text>
${body}
</svg>
`;
}

function statsCard(u) {
  const days = u.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  const { current, longest } = streaks(days);
  const stars = u.repositories.nodes.reduce((n, r) => n + r.stargazerCount, 0);
  const rows = [
    ["🌸", "Contributions (last year)", u.contributionsCollection.contributionCalendar.totalContributions],
    ["🔥", "Current streak", `${current} day${current === 1 ? "" : "s"}`],
    ["🏆", "Longest streak", `${longest} day${longest === 1 ? "" : "s"}`],
    ["📦", "Public repos", u.repositories.totalCount],
    ["⭐", "Stars", stars],
    ["🔀", "Pull requests", u.pullRequests.totalCount],
  ];
  const body = rows
    .map(([icon, label, value], i) => {
      const y = 66 + i * 25;
      return `  <g>
    <text x="24" y="${y}" class="l">${icon}  ${esc(label)}</text>
    <text x="296" y="${y}" class="v" text-anchor="end">${esc(value)}</text>
  </g>`;
    })
    .join("\n");
  return frame(320, CARD_H, "Zainab's GitHub stats", body);
}

function langsCard(u) {
  const totals = new Map();
  for (const repo of u.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      const prev = totals.get(node.name) || { size: 0, color: node.color || PINK };
      totals.set(node.name, { size: prev.size + size, color: prev.color });
    }
  }
  const top = [...totals.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 6);
  const sum = top.reduce((n, [, v]) => n + v.size, 0) || 1;
  const barW = 272;
  let x = 24;
  const bar = top
    .map(([, v]) => {
      const w = (v.size / sum) * barW;
      const seg = `<rect x="${x.toFixed(1)}" y="50" width="${w.toFixed(1)}" height="10" fill="${v.color}"/>`;
      x += w;
      return seg;
    })
    .join("");
  const legend = top
    .map(([name, v], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const lx = 24 + col * 140, ly = 86 + row * 24;
      return `  <g>
    <circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${v.color}"/>
    <text x="${lx + 16}" y="${ly}" class="l">${esc(name)} ${((v.size / sum) * 100).toFixed(1)}%</text>
  </g>`;
    })
    .join("\n");
  const body = `  <clipPath id="c"><rect x="24" y="50" width="${barW}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#c)">${bar}</g>
${legend}`;
  return frame(320, CARD_H, "Most used languages", body);
}

mkdirSync(outDir, { recursive: true });
try {
  const u = await load();
  writeFileSync(`${outDir}/stats.svg`, statsCard(u));
  writeFileSync(`${outDir}/langs.svg`, langsCard(u));
  console.log(`Wrote ${outDir}/stats.svg and ${outDir}/langs.svg`);
} catch (err) {
  // Keep the snake publishing even if the stats query fails; the error is saved next to the cards.
  console.error(err);
  writeFileSync(`${outDir}/cards-error.txt`, String(err?.stack || err));
}
