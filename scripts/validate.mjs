#!/usr/bin/env node
// Checks the layout and the frontmatter of this repository (see README.md, "Format").
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { CHECKED_DIRS, CHECKED_FILES, findLegacyTerms } from './legacy-terms.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TARGETS = new Set([
    'claudecode', 'codexcli', 'cursor', 'copilot', 'copilotcli', 'opencode', 'antigravity-ide',
    'antigravity-cli', 'devin', 'junie', 'kiro-ide', 'kiro-cli', 'kilo', 'factorydroid', 'grokcli',
    'qoder', 'commandcode', 'codewhale', 'mimocode', 'zcode', 'vibe', 'rovodev', 'zoocode', 'pool',
    'qwencode', 'codebuddy', 'augmentcode', 'goose', 'kimi-code', 'deepagents', 'omp', 'reasonix', 'bob',
]);
const errors = [];
const error = (path, message) => errors.push(`${path}: ${message}`);

function read(path) {
    const text = readFileSync(join(ROOT, path), 'utf8');
    if (text.includes('\r')) {
        error(path, 'has CR line endings; use LF');
    }
    for (const tag of ['$body$', '$r$']) {
        if (text.includes(tag)) {
            error(path, `must not contain ${tag}`);
        }
    }
    return text;
}

function frontmatter(path) {
    const text = read(path);
    const end = text.startsWith('---\n') ? text.indexOf('\n---\n', 3) : -1;
    if (end < 0) {
        error(path, 'must start with a YAML frontmatter block between --- lines');
        return null;
    }
    let data;
    try {
        data = parseYaml(text.slice(4, end + 1));
    } catch (e) {
        error(path, `invalid YAML frontmatter: ${e.message}`);
        return null;
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        error(path, 'the frontmatter must be a mapping');
        return null;
    }
    if (!text.slice(end + 5).trim()) {
        error(path, 'the body is empty');
    }
    return data;
}

function checkItem(path, name) {
    if (!NAME.test(name) || name.length > 64) {
        error(path, `"${name}" must be lowercase words joined by hyphens, at most 64 characters`);
    }
    const data = frontmatter(path);
    if (!data) {
        return;
    }
    if (data.name !== name) {
        error(path, `frontmatter name must be "${name}"`);
    }
    if (typeof data.description !== 'string' || !data.description.trim()) {
        error(path, 'the frontmatter needs a description');
    }
    for (const [key, value] of Object.entries(data)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value) && !TARGETS.has(key)) {
            error(path, `"${key}" is not a known target (see docs/targets.md)`);
        }
    }
}

const list = (dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).sort() : []);

for (const file of list('subagents')) {
    if (file.endsWith('.md')) {
        checkItem(`subagents/${file}`, file.slice(0, -3));
    } else {
        error(`subagents/${file}`, 'only <name>.md files belong here');
    }
}
for (const name of list('skills')) {
    const dir = `skills/${name}`;
    const entries = statSync(join(ROOT, dir)).isDirectory() ? readdirSync(join(ROOT, dir)) : [];
    if (entries.length !== 1 || entries[0] !== 'SKILL.md') {
        error(dir, 'a skill is a directory holding only SKILL.md');
    } else {
        checkItem(`${dir}/SKILL.md`, name);
    }
}
for (const file of list('settings')) {
    const path = `settings/${file}`;
    if (!/^[A-Za-z0-9._-]+\.md$/.test(file) || !statSync(join(ROOT, path)).isFile()) {
        error(path, 'only flat <name>.md files are supported');
        continue;
    }
    const data = frontmatter(path);
    if (data && (Object.keys(data).length !== 1 || typeof data.summary !== 'string' || !data.summary.trim())) {
        error(path, 'the frontmatter must hold exactly one key, summary');
    }
}
if (!existsSync(join(ROOT, 'settings/SETTINGS.md'))) {
    error('settings/SETTINGS.md', 'is missing');
}
for (const path of ['description.md', 'rules/athenode.md']) {
    if (!existsSync(join(ROOT, path))) {
        error(path, 'is missing');
    } else if (!read(path).trim()) {
        error(path, 'is empty');
    }
}
try {
    const servers = JSON.parse(read('mcp.json')).mcpServers ?? {};
    if (!Object.keys(servers).length) {
        error('mcp.json', 'declares no mcpServers');
    }
    for (const [name, server] of Object.entries(servers)) {
        if (server.type === 'stdio' ? typeof server.command !== 'string' : !['http', 'sse'].includes(server.type) || typeof server.url !== 'string') {
            error('mcp.json', `server "${name}" needs type stdio with a command, or type http/sse with a url`);
        }
    }
} catch (e) {
    error('mcp.json', e.message);
}
// The skills.sh repository page (see README.md, "skills.sh"): one group that holds every skill.
try {
    const { groupings } = JSON.parse(read('skills.sh.json'));
    const [group] = Array.isArray(groupings) ? groupings : [];
    if (groupings?.length !== 1 || typeof group.title !== 'string' || !group.title.trim() || typeof group.description !== 'string' || !group.description.trim()) {
        error('skills.sh.json', 'must hold exactly one group with a title and a description');
    } else if (!Array.isArray(group.skills) || [...group.skills].sort().join() !== list('skills').join()) {
        error('skills.sh.json', `the group must list every skill of skills/ once: ${list('skills').join(', ')}`);
    }
} catch (e) {
    error('skills.sh.json', e.message);
}
// The names @athenode/cli 0.10.7 renamed from "setup" to "plugin" (see scripts/legacy-terms.mjs).
function filesUnder(dir) {
    return list(dir).flatMap((entry) => {
        const path = `${dir}/${entry}`;
        return statSync(join(ROOT, path)).isDirectory() ? filesUnder(path) : [path];
    });
}
for (const path of [...CHECKED_DIRS.flatMap(filesUnder), ...CHECKED_FILES.filter((file) => existsSync(join(ROOT, file)))]) {
    if (!path.endsWith('.md')) {
        continue;
    }
    for (const { line, term, instead } of findLegacyTerms(readFileSync(join(ROOT, path), 'utf8'))) {
        error(`${path}:${line}`, `"${term}" is an old name; write ${instead}`);
    }
}

if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
}
console.log(`OK: ${list('subagents').length} subagents, ${list('skills').length} skills, ${list('settings').length} settings files.`);
