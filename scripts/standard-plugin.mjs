// Reads the standard plugin in this repository as the `PluginSetup` the plugin generator of
// @athenode/cli takes: the skills, the agents and the MCP servers in the shape of Athenode's export,
// which is what a project's copy of the standard plugin is built from.
//
// The twin of `loadStandardPlugin` in athenode/packages/plugins/build/fetch-standard-snapshot.mjs,
// which reads the same files into the standard plugin's snapshot the daemon and Pro bundle. This
// repository cannot depend on the monorepo, so the two are kept in step by hand: a change to how a
// file is read there belongs here too.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** The plugin's name: the prefix of the skills, so that /atn-mindmap is /atn:mindmap in the plugin. */
export const PLUGIN_SLUG = 'atn';

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function fail(message) {
    throw new Error(message);
}

/** Splits `---\n<yaml>---\n` from the body; one blank line after the frontmatter is not part of the body. */
function readDocument(root, path) {
    const text = readFileSync(join(root, path), 'utf8');
    const end = text.startsWith('---\n') ? text.indexOf('\n---\n', 3) : -1;
    if (end < 0) {
        fail(`${path} must start with a YAML frontmatter block between --- lines`);
    }
    const frontmatter = parseYaml(text.slice(4, end + 1));
    if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
        fail(`${path}: the frontmatter must be a mapping`);
    }
    let body = text.slice(end + 5);
    if (body.startsWith('\n')) {
        body = body.slice(1);
    }
    return { frontmatter, body };
}

/** A skill or an agent: the metadata is the frontmatter without `name`, per-target blocks under their target ids. */
function readItem(root, kind, name, path) {
    if (!NAME.test(name) || name.length > 64) {
        fail(`${path}: "${name}" is not a valid ${kind} name`);
    }
    const { frontmatter, body } = readDocument(root, path);
    const { name: declared, ...metadata } = frontmatter;
    if (declared !== name) {
        fail(`${path}: frontmatter name "${declared}" must be "${name}"`);
    }
    if (typeof metadata.description !== 'string' || !metadata.description.trim()) {
        fail(`${path}: the frontmatter needs a description`);
    }
    if (!body.trim()) {
        fail(`${path}: the body is empty`);
    }
    return { name, metadata, content: body };
}

function readServer(name, server) {
    const where = `mcp.json: server "${name}"`;
    const stringMap = (value, field) => {
        if (value === undefined) {
            return null;
        }
        if (value === null || typeof value !== 'object' || Object.values(value).some((v) => typeof v !== 'string')) {
            fail(`${where}: ${field} must map names to strings`);
        }
        return value;
    };
    if (server?.type === 'stdio') {
        if (typeof server.command !== 'string' || !server.command) {
            fail(`${where}: a stdio server needs a command`);
        }
        const args = server.args ?? [];
        if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
            fail(`${where}: args must be a list of strings`);
        }
        return { name, transport: 'stdio', command: server.command, args, env: stringMap(server.env, 'env'), url: null, headers: null };
    }
    if (server?.type === 'http' || server?.type === 'sse') {
        if (typeof server.url !== 'string' || !server.url) {
            fail(`${where}: an ${server.type} server needs a url`);
        }
        return { name, transport: server.type, command: null, args: null, env: null, url: server.url, headers: stringMap(server.headers, 'headers') };
    }
    return fail(`${where}: type must be stdio, http or sse`);
}

const listDir = (dir) => (existsSync(dir) ? readdirSync(dir) : []);
// Code-unit order, the same on every machine.
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * The standard plugin under `root` as a `PluginSetup`: `{slug, skills, agents, mcpServers}`, each
 * list sorted by name. The rules and the settings files are not part of it: a plugin package
 * carries neither.
 */
export function loadStandardPlugin(root) {
    const skills = listDir(join(root, 'skills')).map((name) => {
        const dir = join(root, 'skills', name);
        const extra = statSync(dir).isDirectory() ? readdirSync(dir).filter((file) => file !== 'SKILL.md') : [name];
        if (extra.length) {
            // A standard skill has no bundle files, so the plugin package has none either: a file here
            // would be left out of the package, and is refused instead of dropped.
            fail(`skills/${name}: a standard skill is a directory holding only SKILL.md (found ${extra.sort().join(', ')})`);
        }
        return { ...readItem(root, 'skill', name, `skills/${name}/SKILL.md`), files: [] };
    });
    const agents = listDir(join(root, 'subagents')).map((file) => {
        if (!file.endsWith('.md')) {
            fail(`subagents/${file}: only <name>.md files belong here`);
        }
        return readItem(root, 'agent', file.slice(0, -3), `subagents/${file}`);
    });
    const mcp = JSON.parse(readFileSync(join(root, 'mcp.json'), 'utf8'));
    const mcpServers = Object.entries(mcp.mcpServers ?? {}).map(([name, server]) => readServer(name, server));
    return { slug: PLUGIN_SLUG, skills: skills.sort(byName), agents: agents.sort(byName), mcpServers: mcpServers.sort(byName) };
}
