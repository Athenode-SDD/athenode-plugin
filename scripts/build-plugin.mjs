#!/usr/bin/env node
// Generates the Claude Code plugin (plugins/claude-code/) and the marketplace manifest
// (.claude-plugin/marketplace.json) from the setup in this repository. See README.md, "Claude Code plugin".
//
//   node scripts/build-plugin.mjs           write the plugin
//   node scripts/build-plugin.mjs --check   write nothing; fail when the committed plugin differs
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_DIR = 'plugins/claude-code';
const MARKETPLACE_FILE = '.claude-plugin/marketplace.json';

// A plugin's skills are run as /<plugin>:<skill> and its agents are named <plugin>:<agent>, so the
// plugin takes the skills' prefix as its name and the skills drop it: /atn-mindmap is /atn:mindmap.
const PLUGIN_NAME = 'atn';
const MARKETPLACE_NAME = 'athenode';
const SKILL_PREFIX = 'atn-';
const TARGET = 'claudecode';
const DESCRIPTION =
    "Athenode's spec-driven development workflow: think the work through as a specification tree, then have Claude Code build it.";
const HOMEPAGE = 'https://athenode.com';
const REPOSITORY = 'https://github.com/Athenode-SDD/athenode-setup';
const OWNER = { name: 'Athenode', url: HOMEPAGE };
function fail(message) {
    console.error(`build-plugin.mjs: ${message}`);
    process.exit(1);
}

function readDocument(path) {
    const text = readFileSync(join(ROOT, path), 'utf8');
    const end = text.startsWith('---\n') ? text.indexOf('\n---\n', 3) : -1;
    if (end < 0) {
        fail(`${path} must start with a YAML frontmatter block between --- lines`);
    }
    const body = text.slice(end + 5);
    return { frontmatter: parseYaml(text.slice(4, end + 1)), body: body.startsWith('\n') ? body.slice(1) : body };
}

const list = (dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).sort() : []);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const skills = list('skills').map((name) => {
    if (!name.startsWith(SKILL_PREFIX)) {
        fail(`skills/${name}: a skill name must start with "${SKILL_PREFIX}" to get its plugin name`);
    }
    return { name, pluginName: name.slice(SKILL_PREFIX.length), ...readDocument(`skills/${name}/SKILL.md`) };
});
const agents = list('subagents').map((file) => ({ name: file.slice(0, -3), ...readDocument(`subagents/${file}`) }));
const servers = JSON.parse(readFileSync(join(ROOT, 'mcp.json'), 'utf8')).mcpServers;

// Longest names first, so that a name that starts another one never matches inside it.
const alternation = (names) => [...names].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
const skillReference = new RegExp(`(?<![\\w-])${escapeRegExp(SKILL_PREFIX)}(${alternation(skills.map((s) => s.pluginName))})(?![\\w-])`, 'g');
const agentReference = new RegExp(`(?<![\\w:/-])(${alternation(agents.map((a) => a.name))})(?![\\w-])`, 'g');
const serverReference = new RegExp(`\\bmcp__(${alternation(Object.keys(servers))})(?![A-Za-z0-9-])`, 'g');

/** Rewrites the names a text uses for the setup's skills, agents and MCP servers to their names in the plugin. */
function toPluginNames(text) {
    return text
        .replace(skillReference, `${PLUGIN_NAME}:$1`)
        .replace(agentReference, `${PLUGIN_NAME}:$1`)
        .replace(serverReference, `mcp__plugin_${PLUGIN_NAME}_$1`);
}

/** The frontmatter Claude Code reads: the common keys, then the fields of the claudecode block. */
function claudeFrontmatter(name, frontmatter) {
    const result = { name, description: frontmatter.description };
    for (const [key, value] of Object.entries(frontmatter)) {
        const isBlock = value !== null && typeof value === 'object' && !Array.isArray(value);
        if (key !== 'name' && key !== 'description' && !isBlock) {
            result[key] = value;
        }
    }
    for (const [key, value] of Object.entries(frontmatter[TARGET] ?? {})) {
        result[key] = typeof value === 'string' ? toPluginNames(value) : value;
    }
    return result;
}

const document = (frontmatter, body) => `---\n${stringifyYaml(frontmatter, { lineWidth: 0 })}---\n${toPluginNames(body)}`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const files = new Map();
files.set(`${PLUGIN_DIR}/.claude-plugin/plugin.json`, json({
    name: PLUGIN_NAME,
    description: DESCRIPTION,
    author: OWNER,
    homepage: HOMEPAGE,
    repository: REPOSITORY,
    license: 'Apache-2.0',
    keywords: ['spec-driven-development', 'specifications', 'workflow', 'athenode'],
}));
for (const skill of skills) {
    files.set(`${PLUGIN_DIR}/skills/${skill.pluginName}/SKILL.md`, document(claudeFrontmatter(skill.pluginName, skill.frontmatter), skill.body));
}
for (const agent of agents) {
    files.set(`${PLUGIN_DIR}/agents/${agent.name}.md`, document(claudeFrontmatter(agent.name, agent.frontmatter), agent.body));
}
files.set(`${PLUGIN_DIR}/.mcp.json`, json({ mcpServers: servers }));

// The rules are not part of the plugin: a plugin cannot write into CLAUDE.md, and the Athenode CLI
// writes them into the project's rules file in every install mode.
files.set(MARKETPLACE_FILE, json({
    name: MARKETPLACE_NAME,
    owner: OWNER,
    plugins: [{ name: PLUGIN_NAME, source: `./${PLUGIN_DIR}`, description: DESCRIPTION, homepage: HOMEPAGE }],
}));

function existingFiles(dir) {
    const found = [];
    for (const entry of list(dir)) {
        const path = `${dir}/${entry}`;
        if (statSync(join(ROOT, path)).isDirectory()) {
            found.push(...existingFiles(path));
        } else {
            found.push(path);
        }
    }
    return found;
}

if (process.argv.includes('--check')) {
    const stale = [...files].filter(([path, content]) => !existsSync(join(ROOT, path)) || readFileSync(join(ROOT, path), 'utf8') !== content)
        .map(([path]) => path);
    const extra = existingFiles(PLUGIN_DIR).filter((path) => !files.has(path));
    if (stale.length || extra.length) {
        fail(`the plugin is out of date; run \`npm run build\` and commit the result.\n${[...stale.map((p) => `  changed: ${p}`), ...extra.map((p) => `  not generated: ${p}`)].join('\n')}`);
    }
    console.log(`OK: the plugin matches the setup (${files.size} files).`);
} else {
    rmSync(join(ROOT, PLUGIN_DIR), { recursive: true, force: true });
    for (const [path, content] of files) {
        mkdirSync(dirname(join(ROOT, path)), { recursive: true });
        writeFileSync(join(ROOT, path), content);
    }
    console.log(`Wrote ${files.size} files: ${relative(ROOT, join(ROOT, PLUGIN_DIR))}/ and ${MARKETPLACE_FILE}.`);
}
