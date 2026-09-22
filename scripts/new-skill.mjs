#!/usr/bin/env node
/**
 * Scaffold one skill directory from templates/SKILL.md.template.
 * Usage: node scripts/new-skill.mjs <name>
 * Does not publish anything. Review the result before committing.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

if (!name || !namePattern.test(name) || name.length > 64) {
  console.error(
    "usage: node scripts/new-skill.mjs <name>\nname: 1-64 chars, lowercase letters, digits, single hyphens; no leading or trailing hyphen",
  );
  process.exit(2);
}

const dir = join(root, "skills", name);
const dest = join(dir, "SKILL.md");
if (existsSync(dest)) {
  console.error(`refusing to overwrite ${dest}`);
  process.exit(1);
}

const template = readFileSync(join(root, "templates", "SKILL.md.template"), "utf8");
const body = template.replaceAll("your-skill-name", name);
mkdirSync(dir, { recursive: true });
writeFileSync(dest, body);
console.log(`wrote skills/${name}/SKILL.md — replace the description and steps before committing`);
