#!/usr/bin/env node
/**
 * Fixture tests for scripts/validate-skills.mjs.
 * Each case is a temp catalog. Expected failures name the mistake a wrong
 * validator would miss.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const validator = join(dirname(fileURLToPath(import.meta.url)), "validate-skills.mjs");
let failed = 0;

function run(dir) {
  return spawnSync(process.execPath, [validator, dir], { encoding: "utf8" });
}

function writeSkill(root, name, frontmatter, body = "\n# Skill\n") {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\n${frontmatter}\n---${body}`);
  return dir;
}

function check(label, dir, expectOk, needle) {
  const result = run(dir);
  const ok = result.status === 0;
  const output = `${result.stdout}\n${result.stderr}`;
  const matched = !needle || output.includes(needle);
  if (ok !== expectOk || !matched) {
    failed += 1;
    console.error(`FAIL ${label}`);
    console.error(`  expected ${expectOk ? "pass" : "fail"}${needle ? ` containing ${JSON.stringify(needle)}` : ""}`);
    console.error(`  status ${result.status}\n${output}`);
    return;
  }
  console.log(`ok ${label}`);
}

const root = mkdtempSync(join(tmpdir(), "skills-validate-"));

check("empty catalog", root, true, "skills catalog is empty");

const quoted = mkdtempSync(join(tmpdir(), "skills-quoted-"));
writeSkill(
  quoted,
  "quoted-skill",
  [
    "name: quoted-skill",
    'description: "Fetches tasks from Notion. Triggers on: my tasks, show work."',
    "license: MIT",
    "metadata:",
    "  author: fixture",
    "  internal: false",
  ].join("\n"),
  "\n# Quoted\n\nSee [note](references/note.md).\n",
);
mkdirSync(join(quoted, "quoted-skill", "references"));
writeFileSync(join(quoted, "quoted-skill", "references", "note.md"), "note\n");
check("quoted description with colon", quoted, true, "validated 1 skill");

const multiline = mkdtempSync(join(tmpdir(), "skills-multi-"));
writeSkill(
  multiline,
  "folded-skill",
  ["name: folded-skill", "description: >-", "  Checks folded YAML.", "  Use when the description wraps."].join("\n"),
);
check("folded multiline description", multiline, true, "validated 1 skill");

const literal = mkdtempSync(join(tmpdir(), "skills-literal-"));
writeSkill(
  literal,
  "literal-skill",
  ["name: literal-skill", "description: |", "  Keeps a literal block.", "  Use when the description is a block."].join("\n"),
);
check("literal multiline description", literal, true, "validated 1 skill");

const nullName = mkdtempSync(join(tmpdir(), "skills-null-"));
writeSkill(nullName, "null-name", "name:\ndescription: present but name is null");
check("null name", nullName, false, "name must be a string (got null)");

const boolDesc = mkdtempSync(join(tmpdir(), "skills-bool-"));
writeSkill(boolDesc, "bool-desc", "name: bool-desc\ndescription: true");
check("boolean description", boolDesc, false, "description must be a string (got boolean)");

const arrayName = mkdtempSync(join(tmpdir(), "skills-array-"));
writeSkill(arrayName, "array-name", "name: [array-name]\ndescription: not a string name");
check("array name", arrayName, false, "name must be a string (got array)");

const numCompat = mkdtempSync(join(tmpdir(), "skills-num-"));
writeSkill(numCompat, "num-compat", "name: num-compat\ndescription: numeric compatibility is not a string\ncompatibility: 1");
check("numeric compatibility", numCompat, false, "compatibility must be a string (got number)");

const orphan = mkdtempSync(join(tmpdir(), "skills-orphan-"));
mkdirSync(join(orphan, "orphan-skill", "references"), { recursive: true });
writeFileSync(join(orphan, "orphan-skill", "references", "note.md"), "no skill\n");
check("directory missing SKILL.md", orphan, false, "missing SKILL.md");

const missingRef = mkdtempSync(join(tmpdir(), "skills-missing-ref-"));
writeSkill(
  missingRef,
  "missing-ref",
  "name: missing-ref\ndescription: points at a file that is not there",
  "\nSee [gone](references/gone.md).\n",
);
check("missing local reference", missingRef, false, "missing referenced file: references/gone.md");

const encodedEscape = mkdtempSync(join(tmpdir(), "skills-escape-"));
writeSkill(
  encodedEscape,
  "encoded-escape",
  "name: encoded-escape\ndescription: percent-encoded parent traversal",
  "\nSee [outside](references/%2E%2E/%2E%2E/secrets.md).\n",
);
check("percent-encoded traversal", encodedEscape, false, "must stay inside the skill directory");

const dotdot = mkdtempSync(join(tmpdir(), "skills-dotdot-"));
writeSkill(
  dotdot,
  "dotdot-ref",
  "name: dotdot-ref\ndescription: literal parent traversal",
  "\nSee [outside](../other/SKILL.md).\n",
);
check("dotdot reference", dotdot, false, "must stay inside the skill directory");

const link = mkdtempSync(join(tmpdir(), "skills-link-"));
mkdirSync(join(link, "outside"));
writeFileSync(join(link, "outside", "note.md"), "outside\n");
mkdirSync(join(link, "link-skill"));
writeFileSync(
  join(link, "link-skill", "SKILL.md"),
  "---\nname: link-skill\ndescription: references a symlink\n---\n\nSee [note](references/note.md).\n",
);
mkdirSync(join(link, "link-skill", "references"));
symlinkSync(join(link, "outside", "note.md"), join(link, "link-skill", "references", "note.md"));
check("symlinked resource", link, false, "referenced path is a symlink");

const linkedSkill = mkdtempSync(join(tmpdir(), "skills-linked-skill-"));
mkdirSync(join(linkedSkill, "real-skill"));
writeFileSync(
  join(linkedSkill, "real-skill", "SKILL.md"),
  "---\nname: real-skill\ndescription: the real file a symlink would hide\n---\n\n# Real\n",
);
symlinkSync(join(linkedSkill, "real-skill"), join(linkedSkill, "alias-skill"));
check("symlinked skill directory", linkedSkill, false, "symlinks are not allowed");

const mismatch = mkdtempSync(join(tmpdir(), "skills-mismatch-"));
writeSkill(mismatch, "alpha", "name: beta\ndescription: directory and name disagree");
check("name/directory mismatch", mismatch, false, 'name "beta" must match directory "alpha"');

const duplicate = mkdtempSync(join(tmpdir(), "skills-dup-"));
writeSkill(duplicate, "one", "name: one\ndescription: first claim");
writeSkill(duplicate, "gamma", "name: one\ndescription: second claim of the same name");
check("duplicate frontmatter name", duplicate, false, "duplicate name");

const badYaml = mkdtempSync(join(tmpdir(), "skills-badyaml-"));
mkdirSync(join(badYaml, "bad-yaml"));
writeFileSync(join(badYaml, "bad-yaml", "SKILL.md"), "---\nname: bad-yaml\ndescription: [unterminated\n---\n");
check("malformed YAML", badYaml, false, "YAML parse error");

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("all validator fixtures passed");
