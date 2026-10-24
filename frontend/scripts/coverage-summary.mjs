// Prints the Vitest coverage totals as a Markdown table (used for the CI job
// summary). Requires the json-summary reporter: coverage/coverage-summary.json.
import { readFileSync } from 'node:fs';

const { total } = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));

const rows = ['statements', 'branches', 'functions', 'lines'].map(
  (metric) =>
    `| ${metric} | ${total[metric].pct}% | ${total[metric].covered}/${total[metric].total} |`,
);

console.log(
  ['### Frontend coverage', '| Metric | % | Covered |', '|---|---|---|', ...rows].join('\n'),
);
