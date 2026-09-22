#!/usr/bin/env node
/**
 * Validate the public skills catalog.
 * Zero dependencies. Exits 0 when the catalog is empty or every skill is valid.
 *
 * Checks:
 * - directory and frontmatter names match, and names are unique
 * - name/description constraints from https://agentskills.io/specification
 * - frontmatter is a flat YAML subset (no nested maps except metadata)
 * - local markdown/script references in SKILL.md exist
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = process.argv[2] ? resolve(process.argv[2]) : join(root, "skills");
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

function listSkillFiles(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const skill = join(full, "SKILL.md");
      if (existsSync(skill)) found.push(skill);
      else {
        for (const nested of readdirSync(full, { withFileTypes: true })) {
          if (!nested.isDirectory() || nested.name.startsWith(".")) continue;
          const nestedSkill = join(full, nested.name, "SKILL.md");
          if (existsSync(nestedSkill)) {
            fail(
              relative(root, nestedSkill),
              "nested catalog layout is not used here; put skills at skills/<name>/SKILL.md",
            );
          }
        }
      }
    } else if (entry.name === "SKILL.md") {
      fail(relative(root, full), "SKILL.md must live in skills/<name>/, not directly under skills/");
    } else if (entry.name !== ".gitkeep") {
      fail(relative(root, full), "unexpected file in skills/; only <name>/ directories belong here");
    }
  }
  return found.sort();
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\(["'\\])/g, "$1");
  }
  return trimmed;
}

function parseFrontmatter(text, rel) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    fail(rel, "missing opening frontmatter delimiter");
    return null;
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    fail(rel, "missing closing frontmatter delimiter");
    return null;
  }
  const block = text.slice(text.indexOf("\n") + 1, end);
  const fields = {};
  const lines = block.split(/\r?\n/);
  let metadata = null;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const meta = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.*)$/);
    if (meta && metadata) {
      metadata[meta[1]] = unquote(meta[2]);
      continue;
    }
    if (/^\s+\S/.test(line)) {
      fail(rel, `unsupported nested YAML: ${line.trim()}`);
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      fail(rel, `unparseable frontmatter line: ${line}`);
      continue;
    }
    const key = match[1];
    const raw = match[2];
    if (key === "metadata" && raw === "") {
      metadata = {};
      fields.metadata = metadata;
      continue;
    }
    if (key in fields) fail(rel, `duplicate frontmatter key ${key}`);
    fields[key] = unquote(raw);
    metadata = null;
  }
  return fields;
}

function checkReferences(text, skillFile) {
  const rel = relative(root, skillFile);
  const skillRoot = dirname(skillFile);
  const refs = new Set();
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) refs.add(match[1]);
  for (const match of text.matchAll(/(?:^|\s)((?:references|scripts|assets)\/[A-Za-z0-9_./-]+)/gm)) {
    refs.add(match[1]);
  }
  for (const ref of refs) {
    const clean = ref.split("#")[0].split("?")[0].trim();
    if (!clean || clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("mailto:")) {
      continue;
    }
    if (clean.startsWith("/") || clean.includes("..")) {
      fail(rel, `reference must be a relative path inside the skill: ${ref}`);
      continue;
    }
    const target = normalize(join(skillRoot, clean));
    if (!target.startsWith(skillRoot)) {
      fail(rel, `reference escapes the skill directory: ${ref}`);
      continue;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      fail(rel, `missing referenced file: ${clean}`);
    }
  }
}

const seen = new Map();
for (const file of listSkillFiles(skillsDir)) {
  const rel = relative(root, file);
  const dirName = dirname(file).split("/").at(-1);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    fail(rel, `unreadable: ${error.message}`);
    continue;
  }
  const fields = parseFrontmatter(text, rel);
  if (!fields) continue;
  const name = fields.name ?? "";
  const description = fields.description ?? "";
  if (!name) fail(rel, "missing name");
  else if (name.length > 64 || !namePattern.test(name)) {
    fail(rel, "name must be 1-64 chars of lowercase letters, digits, and single hyphens");
  }
  if (name && name !== dirName) fail(rel, `name "${name}" must match directory "${dirName}"`);
  if (name) {
    if (seen.has(name)) fail(rel, `duplicate name also at ${seen.get(name)}`);
    else seen.set(name, rel);
  }
  if (!description) fail(rel, "missing description");
  else if (description.length > 1024) fail(rel, "description exceeds 1024 characters");
  if (typeof fields.compatibility === "string" && fields.compatibility.length > 500) {
    fail(rel, "compatibility exceeds 500 characters");
  }
  checkReferences(text, file);
}

if (errors.length) {
  console.error(`invalid skills catalog (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  seen.size === 0
    ? "skills catalog is empty (valid)"
    : `validated ${seen.size} skill${seen.size === 1 ? "" : "s"}`,
);
