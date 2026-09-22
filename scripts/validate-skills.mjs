#!/usr/bin/env node
/**
 * Validate the public skills catalog.
 * Exits 0 when skills/ is empty or every skill is valid.
 *
 * Uses the yaml package, the same parser family as `npx skills`. A skill the
 * CLI would skip (bad YAML, non-string name/description) is a catalog error,
 * not a silent pass.
 */

import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = process.argv[2] ? resolveArg(process.argv[2]) : join(root, "skills");
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const errors = [];
const claimed = new Map();

function resolveArg(value) {
  return value.startsWith("/") ? value : join(process.cwd(), value);
}

function fail(path, message) {
  errors.push(`${display(path)}: ${message}`);
}

function display(path) {
  const rel = relative(root, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function parseFrontmatter(text, rel) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    fail(rel, "SKILL.md must start with YAML frontmatter");
    return null;
  }
  let data;
  try {
    data = parseYaml(match[1]);
  } catch (error) {
    fail(rel, `YAML parse error: ${error.message}`);
    return null;
  }
  if (!isRecord(data)) {
    fail(rel, "frontmatter must be a YAML mapping");
    return null;
  }
  return { data, body: match[2] ?? "" };
}

function checkString(rel, fields, key, { required = false, max } = {}) {
  if (!(key in fields)) {
    if (required) fail(rel, `missing ${key}`);
    return;
  }
  const value = fields[key];
  if (typeof value !== "string") {
    fail(rel, `${key} must be a string (got ${typeName(value)})`);
    return;
  }
  if (required && value.length === 0) fail(rel, `${key} must be a non-empty string`);
  if (max && value.length > max) fail(rel, `${key} exceeds ${max} characters`);
}

function checkReferences(body, skillDir, rel) {
  const refs = new Set();
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) refs.add(match[1]);
  for (const match of body.matchAll(/(?:^|\s)((?:references|scripts|assets)\/[A-Za-z0-9_./%-]+)/gm)) {
    refs.add(match[1]);
  }
  for (const raw of refs) {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      fail(rel, `reference has invalid percent-encoding: ${raw}`);
      continue;
    }
    const clean = decoded.split("#")[0].split("?")[0].trim();
    if (!clean || /^(?:https?:|mailto:)/i.test(clean)) continue;
    if (clean.startsWith("/") || clean.split("/").includes("..")) {
      fail(rel, `reference must stay inside the skill directory: ${raw}`);
      continue;
    }
    const target = normalize(join(skillDir, clean));
    const rootWithSep = skillDir.endsWith(sep) ? skillDir : skillDir + sep;
    if (target !== skillDir && !target.startsWith(rootWithSep)) {
      fail(rel, `reference escapes the skill directory: ${raw}`);
      continue;
    }
    let stat;
    try {
      stat = lstatSync(target);
    } catch {
      fail(rel, `missing referenced file: ${clean}`);
      continue;
    }
    if (stat.isSymbolicLink()) {
      fail(rel, `referenced path is a symlink: ${clean}`);
      continue;
    }
    if (!stat.isFile()) fail(rel, `referenced path is not a file: ${clean}`);
  }
}

function validateSkill(skillDir, dirName) {
  const rel = join(skillDir, "SKILL.md");
  let text;
  try {
    text = readFileSync(rel, "utf8");
  } catch (error) {
    fail(rel, `unreadable: ${error.message}`);
    return;
  }
  const parsed = parseFrontmatter(text, rel);
  if (!parsed) return;
  const { data, body } = parsed;
  checkString(rel, data, "name", { required: true, max: 64 });
  checkString(rel, data, "description", { required: true, max: 1024 });
  checkString(rel, data, "license");
  checkString(rel, data, "compatibility", { max: 500 });
  checkString(rel, data, "allowed-tools");
  if ("metadata" in data && data.metadata !== undefined && !isRecord(data.metadata)) {
    fail(rel, `metadata must be a mapping (got ${typeName(data.metadata)})`);
  } else if (isRecord(data.metadata)) {
    for (const [key, value] of Object.entries(data.metadata)) {
      if (typeof value !== "string" && typeof value !== "boolean" && typeof value !== "number") {
        fail(rel, `metadata.${key} must be a string, boolean, or number`);
      }
    }
  }
  if (typeof data.name === "string") {
    if (!namePattern.test(data.name)) {
      fail(rel, "name must be 1-64 chars of lowercase letters, digits, and single hyphens");
    } else if (data.name !== dirName) {
      fail(rel, `name "${data.name}" must match directory "${dirName}"`);
    }
    if (claimed.has(data.name)) {
      fail(rel, `duplicate name also at ${display(claimed.get(data.name))}`);
    } else {
      claimed.set(data.name, rel);
    }
  }
  checkReferences(body, skillDir, rel);
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    fail(dir, `unreadable: ${error.message}`);
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".gitkeep") continue;
    const full = join(dir, entry.name);
    if (entry.name.startsWith(".")) {
      fail(full, "hidden entries are not allowed in skills/");
      continue;
    }
    let stat;
    try {
      stat = lstatSync(full);
    } catch (error) {
      fail(full, `unreadable: ${error.message}`);
      continue;
    }
    if (stat.isSymbolicLink()) {
      fail(full, "symlinks are not allowed in the catalog");
      continue;
    }
    if (!stat.isDirectory()) {
      fail(full, "unexpected file in skills/; only <name>/ directories belong here");
      continue;
    }
    const skillFile = join(full, "SKILL.md");
    let skillStat;
    try {
      skillStat = lstatSync(skillFile);
    } catch {
      skillStat = null;
    }
    if (!skillStat) {
      fail(full, "skill directory is missing SKILL.md");
      continue;
    }
    if (skillStat.isSymbolicLink()) {
      fail(skillFile, "symlinks are not allowed in the catalog");
      continue;
    }
    if (!skillStat.isFile()) {
      fail(skillFile, "SKILL.md must be a regular file");
      continue;
    }
    validateSkill(full, entry.name);
  }
}

const rootStat = lstatSync(skillsDir, { throwIfNoEntry: false });
if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
  fail(skillsDir, "skills directory does not exist");
} else {
  walk(skillsDir);
}

if (errors.length) {
  console.error(`invalid skills catalog (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  claimed.size === 0
    ? "skills catalog is empty (valid)"
    : `validated ${claimed.size} skill${claimed.size === 1 ? "" : "s"}`,
);
