#!/usr/bin/env node
/**
 * Fail if notify-site.yml would notify anything other than a successful
 * push to main in this repository. Mirrors the job if expression.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(dirname(fileURLToPath(import.meta.url)), "../.github/workflows/notify-site.yml");
const text = readFileSync(file, "utf8");
const required = [
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.event == 'push'",
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "github.event.workflow_run.head_branch == 'main'",
];
const missing = required.filter((clause) => !text.includes(clause));
if (missing.length) {
  console.error("notify-site.yml is missing guard clauses:");
  for (const clause of missing) console.error(`- ${clause}`);
  process.exit(1);
}
if (!text.includes("conclusion == 'success' &&")) {
  console.error("success is not AND-joined to the trust guards");
  process.exit(1);
}

const repo = "skastr0/skills";
function shouldNotify(run) {
  return (
    run.conclusion === "success" &&
    run.event === "push" &&
    run.head_repository?.full_name === repo &&
    run.head_branch === "main"
  );
}

const cases = [
  {
    label: "trusted main push",
    run: { conclusion: "success", event: "push", head_branch: "main", head_repository: { full_name: repo } },
    expect: true,
  },
  {
    label: "failed main push",
    run: { conclusion: "failure", event: "push", head_branch: "main", head_repository: { full_name: repo } },
    expect: false,
  },
  {
    label: "pull_request from main",
    run: { conclusion: "success", event: "pull_request", head_branch: "main", head_repository: { full_name: repo } },
    expect: false,
  },
  {
    label: "fork pull_request whose head branch is main",
    run: { conclusion: "success", event: "pull_request", head_branch: "main", head_repository: { full_name: "attacker/skills" } },
    expect: false,
  },
  {
    label: "fork push reported as main",
    run: { conclusion: "success", event: "push", head_branch: "main", head_repository: { full_name: "attacker/skills" } },
    expect: false,
  },
  {
    label: "push to another branch",
    run: { conclusion: "success", event: "push", head_branch: "feature", head_repository: { full_name: repo } },
    expect: false,
  },
];

let failed = 0;
for (const item of cases) {
  const actual = shouldNotify(item.run);
  if (actual !== item.expect) {
    failed += 1;
    console.error(`FAIL ${item.label}: expected ${item.expect}, got ${actual}`);
  } else {
    console.log(`ok ${item.label}`);
  }
}
if (failed) process.exit(1);
console.log("notify guard matches trusted main pushes only");
