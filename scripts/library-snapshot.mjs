#!/usr/bin/env node
// Builds the standard plugin in this repository as a library snapshot archive, the format Athenode's
// plugin library stores every version in: a zip of `snapshot.json` (the envelope around the neutral
// plugin export document) and one `blobs/<sha256>` entry per distinct bundle file. CI uploads it as the
// next version of the standard entry (scripts/publish-library.mjs). See README.md, "Plugin library".
//
// The loading (the subagents, the skills, the settings files with their `summary` frontmatter, the
// rules, the MCP servers and the description) has a twin, `loadStandardPlugin` in
// ssh-gateway/packages/plugins/build/fetch-standard-snapshot.mjs, which reads the same files into the
// standard plugin's snapshot the daemon and Pro bundle. This repository cannot depend on the monorepo,
// so the two are kept in step by hand: a change to how a file is read here belongs there too. A skill
// here may carry bundle files next to its SKILL.md.
//
//   node scripts/library-snapshot.mjs [out.zip]   write the archive (default: library-snapshot.zip)
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, inflateRawSync } from 'node:zlib';
import { parse as parseYaml } from 'yaml';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The standard entry as the library shows it. */
export const ENTRY = { name: 'Athenode', category: 'programming', pluginName: 'atn' };
/** The plugin's slug: the installed plugin's name and the prefix of its commands. */
export const PLUGIN_SLUG = 'atn';

export const SNAPSHOT_ENTRY = 'snapshot.json';
export const BLOB_PREFIX = 'blobs/';

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE_NAME = /^[A-Za-z0-9._-]+$/;

function fail(message) {
    throw new Error(message);
}

function readText(root, path) {
    const text = readFileSync(join(root, path), 'utf8');
    if (text.includes('\r')) {
        fail(`${path} has CR line endings; use LF`);
    }
    return text;
}

/** A text file whose stored value has no final newline: the file's single trailing newline is dropped. */
function readPlain(root, path) {
    const text = readText(root, path);
    return text.endsWith('\n') ? text.slice(0, -1) : text;
}

/** Splits `---\n<yaml>---\n` from the body; one blank line after the frontmatter is not part of the body. */
function readDocument(root, path) {
    const text = readText(root, path);
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

/** A skill or an agent: the metadata is the frontmatter without `name`. */
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
        if (value === null || typeof value !== 'object' || Array.isArray(value)
            || Object.values(value).some((v) => typeof v !== 'string')) {
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

// Code-unit order, the same on every machine.
const byKey = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
const listDir = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);

/** Every file under `dir`, recursively, as paths relative to it with `/`, sorted. */
function walk(dir) {
    const files = [];
    const visit = (current) => {
        for (const name of readdirSync(current).sort()) {
            const path = join(current, name);
            if (statSync(path).isDirectory()) {
                visit(path);
            } else {
                files.push(relative(dir, path).split(sep).join('/'));
            }
        }
    };
    visit(dir);
    return files.sort();
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Text when it holds no NUL byte and is valid UTF-8 (the server recomputes it anyway). */
function isText(bytes) {
    if (bytes.includes(0)) {
        return false;
    }
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return true;
    } catch {
        return false;
    }
}

/**
 * The standard plugin under `root`: `{entry, plugin, blobs}`, the envelope's entry and plugin document
 * (every list sorted) and the bundle files' bytes by hash.
 */
export function loadLibraryPlugin(root = ROOT) {
    const blobs = new Map();
    const agents = listDir(join(root, 'subagents')).map((file) => {
        if (!file.endsWith('.md')) {
            fail(`subagents/${file}: only <name>.md files belong here`);
        }
        return readItem(root, 'agent', file.slice(0, -3), `subagents/${file}`);
    });
    const skills = listDir(join(root, 'skills')).map((name) => {
        const dir = join(root, 'skills', name);
        if (!statSync(dir).isDirectory()) {
            fail(`skills/${name}: a skill is a directory holding its SKILL.md`);
        }
        const item = readItem(root, 'skill', name, `skills/${name}/SKILL.md`);
        const files = walk(dir).filter((path) => path !== 'SKILL.md').map((path) => {
            const bytes = readFileSync(join(dir, path));
            const hash = sha256(bytes);
            blobs.set(hash, bytes);
            const executable = (statSync(join(dir, path)).mode & 0o111) !== 0;
            return { path, mode: executable ? '0755' : '0644', isText: isText(bytes), size: bytes.length, sha256: hash };
        });
        return { ...item, files };
    });
    if (!agents.length && !skills.length) {
        fail(`${root} holds no subagents or skills`);
    }

    const settings = [];
    for (const file of listDir(join(root, 'settings'))) {
        const path = `settings/${file}`;
        if (!file.endsWith('.md') || !FILE_NAME.test(file) || !statSync(join(root, path)).isFile()) {
            fail(`${path}: only flat <name>.md files are supported`);
        }
        const { frontmatter, body } = readDocument(root, path);
        const keys = Object.keys(frontmatter);
        if (keys.length !== 1 || typeof frontmatter.summary !== 'string' || !frontmatter.summary.trim()) {
            fail(`${path}: the frontmatter must hold exactly one key, summary`);
        }
        settings.push({ path, kind: 'file', content: body, summary: frontmatter.summary });
    }
    const files = settings.length ? [{ path: 'settings', kind: 'directory', content: null, summary: null }, ...settings] : [];

    let mcp;
    try {
        mcp = JSON.parse(readText(root, 'mcp.json'));
    } catch (e) {
        fail(`mcp.json is not valid JSON: ${e.message}`);
    }
    if (mcp === null || typeof mcp !== 'object' || Array.isArray(mcp)
        || (mcp.mcpServers !== undefined && (mcp.mcpServers === null || typeof mcp.mcpServers !== 'object'))) {
        fail('mcp.json must be an object with an mcpServers object');
    }
    const mcpServers = Object.entries(mcp.mcpServers ?? {}).map(([name, server]) => readServer(name, server));

    const rules = readPlain(root, 'rules/athenode.md');
    return {
        entry: { ...ENTRY, description: readPlain(root, 'description.md') },
        plugin: {
            formatVersion: 1,
            slug: PLUGIN_SLUG,
            rules: rules.trim() ? rules : null,
            skills: skills.sort(byKey('name')),
            agents: agents.sort(byKey('name')),
            mcpServers: mcpServers.sort(byKey('name')),
            files: files.sort(byKey('path')),
        },
        blobs,
    };
}

/** The library snapshot envelope of a loaded plugin. */
export function envelope({ entry, plugin }) {
    return {
        format: 'athenode-library-snapshot',
        snapshotFormatVersion: 1,
        entry: { name: entry.name, description: entry.description, category: entry.category, pluginName: entry.pluginName },
        attributions: [],
        plugin: {
            formatVersion: plugin.formatVersion,
            slug: plugin.slug,
            rules: plugin.rules,
            skills: plugin.skills.map((skill) => ({
                name: skill.name, metadata: skill.metadata, content: skill.content, files: skill.files,
            })),
            agents: plugin.agents.map((agent) => ({ name: agent.name, metadata: agent.metadata, content: agent.content })),
            mcpServers: plugin.mcpServers,
            files: plugin.files,
        },
    };
}

// ---------------------------------------------------------------- zip

/** 1980-01-01 00:00, the zip format's first date: the same bytes on every run. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** A zip of `entries` ([name, bytes] in order), stored (not compressed), with fixed dates. */
export function writeZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [name, data] of entries) {
        const nameBytes = Buffer.from(name, 'utf8');
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 names
        local.writeUInt16LE(0, 8); // stored
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, nameBytes, data);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(DOS_TIME, 12);
        central.writeUInt16LE(DOS_DATE, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBytes);
        offset += local.length + nameBytes.length + data.length;
    }
    const centralSize = centrals.reduce((size, part) => size + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
}

/** The entries of a zip by name (stored or deflated), from its central directory. */
export function readZip(zip) {
    let end = zip.length - 22;
    while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) {
        end--;
    }
    if (end < 0) {
        fail('not a zip archive');
    }
    const count = zip.readUInt16LE(end + 10);
    let cursor = zip.readUInt32LE(end + 16);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
        if (zip.readUInt32LE(cursor) !== 0x02014b50) {
            fail('broken zip central directory');
        }
        const method = zip.readUInt16LE(cursor + 10);
        const compressedSize = zip.readUInt32LE(cursor + 20);
        const nameLength = zip.readUInt16LE(cursor + 28);
        const extraLength = zip.readUInt16LE(cursor + 30);
        const commentLength = zip.readUInt16LE(cursor + 32);
        const localOffset = zip.readUInt32LE(cursor + 42);
        const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
        const localNameLength = zip.readUInt16LE(localOffset + 26);
        const localExtraLength = zip.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const data = zip.subarray(start, start + compressedSize);
        entries.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
        cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

/**
 * The library snapshot of the standard plugin under `root`: the envelope, its `snapshot.json` bytes,
 * the blobs and the archive.
 */
export function buildSnapshot(root = ROOT) {
    const loaded = loadLibraryPlugin(root);
    const snapshot = envelope(loaded);
    const json = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    const blobEntries = [...loaded.blobs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([hash, bytes]) => [`${BLOB_PREFIX}${hash}`, bytes]);
    return { envelope: snapshot, json, blobs: loaded.blobs, archive: writeZip([[SNAPSHOT_ENTRY, json], ...blobEntries]) };
}

// ---------------------------------------------------------------- comparison

/** A JSON value with every object's keys sorted, for comparing two documents. */
function sortKeys(value) {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
    }
    return value;
}

/**
 * What a snapshot's content is, without what the server adds or recomputes (the plugin's id and
 * digest, the item slugs, the text flags): two envelopes with the same content give the same string.
 */
export function contentOf(snapshot) {
    const plugin = snapshot.plugin ?? {};
    const item = ({ slug, ...rest }) => rest;
    const content = {
        entry: snapshot.entry,
        attributions: snapshot.attributions ?? [],
        plugin: {
            formatVersion: plugin.formatVersion,
            slug: plugin.slug,
            rules: plugin.rules ?? null,
            skills: (plugin.skills ?? []).map((skill) => ({
                ...item(skill),
                metadata: skill.metadata ?? {},
                files: (skill.files ?? []).map(({ isText: _isText, ...file }) => file),
            })),
            agents: (plugin.agents ?? []).map((agent) => ({ ...item(agent), metadata: agent.metadata ?? {} })),
            mcpServers: (plugin.mcpServers ?? []).map(item),
            files: plugin.files ?? [],
        },
    };
    return JSON.stringify(sortKeys(content));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const out = process.argv[2] ?? 'library-snapshot.zip';
    const { envelope: snapshot, archive } = buildSnapshot();
    writeFileSync(out, archive);
    console.log(`Wrote ${out}: ${snapshot.plugin.skills.length} skills, ${snapshot.plugin.agents.length} agents, `
        + `${snapshot.plugin.mcpServers.length} MCP servers, ${snapshot.plugin.files.length} plugin files `
        + `(${archive.length} bytes).`);
}
