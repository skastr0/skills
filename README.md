# skills

Public agent skills for [@skastr0](https://github.com/skastr0). The catalog is empty until a real skill is published.

Skills follow the [Agent Skills](https://agentskills.io/specification) format and install with the [skills CLI](https://github.com/vercel-labs/skills).

## Install

List what is published:

```bash
npx skills add skastr0/skills --list
```

Install one skill by its frontmatter `name`:

```bash
npx skills add skastr0/skills --skill <frontmatter-name>
```

An empty catalog is expected right now. `--list` reports no skills, and `--skill` has nothing to select.

## Layout

```text
skills/<name>/SKILL.md
```

`name` in the frontmatter must match `<name>`. Optional files live beside `SKILL.md` (`scripts/`, `references/`, `assets/`) and are referenced with relative paths.

Do not put a skill at the repository root, under `templates/`, or under `tests/`. The CLI discovers `skills/**/SKILL.md`.

## Author a skill

```bash
node scripts/new-skill.mjs my-skill
```

That copies [templates/SKILL.md.template](templates/SKILL.md.template) to `skills/my-skill/SKILL.md`. Replace the description and steps, then check the catalog:

```bash
npm ci
npm test
node scripts/validate-skills.mjs
```

The template is named `SKILL.md.template` so it is not discovered or installed. Do not rename it to `SKILL.md`.

### Frontmatter

```yaml
---
name: my-skill
description: What it does and when to use it.
---
```

- `name`: 1–64 characters, lowercase letters, digits, and single hyphens. Must match the directory. Must be unique in this catalog.
- `description`: 1–1024 characters. Third person. Say what it does and when to use it.
- `license`: optional. This repository is MIT; a skill may name a different license if its contents require one.

Validation uses the `yaml` package. It rejects a bad name, a name that does not match its directory, a duplicate name, a non-string `name` or `description` (`null`, `true`, `[]`), a skill directory with no `SKILL.md`, a symlink, and a local reference that is missing, percent-encoded to escape the skill, or itself a symlink.

## Website hook

[Validate skills](.github/workflows/validate.yml) runs on every push and pull request. [Notify website](.github/workflows/notify-site.yml) runs only after that workflow succeeds on `main`. It exits without calling anything until the repository secret `SITE_DEPLOY_HOOK` is set to the website project's Vercel deploy hook URL (Vercel → Project → Settings → Git → Deploy Hooks). The hook URL is a secret. Do not commit it, and do not invent one.

## License

[MIT](LICENSE)
