#!/usr/bin/env node
// Builds the Claude Code plugin (plugins/claude-code/) and the marketplace manifest
// (.claude-plugin/marketplace.json) from the setup in this repository, with the plugin generator of
// @athenode/cli. This script reads the setup (plugin-setup.mjs), pins Athenode's MCP server to the
// generator's version, drops the unscoped Bash from the skills' allowed-tools, hands it to the
// generator and writes what comes back with the plugin's README and icon: the names, the
// frontmatter and the layout are the generator's.
// See README.md, "Claude Code plugin".
//
//   node scripts/build-plugin.mjs           write the plugin
//   node scripts/build-plugin.mjs --check   write nothing; fail when the committed plugin differs
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPluginSetup } from './plugin-setup.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_DIR = 'plugins/claude-code';
const TOOL = 'claudecode';
const GENERATOR_PACKAGE = '@athenode/cli';

/** The plugin's README, which the setup has nothing for: copied into the plugin as `README.md`. */
const README_SOURCE = 'docs/plugin-readme.md';
/** The plugin's icon, a square PNG of 512 to 2048 px: copied into the plugin as `.claude-plugin/icon.png`. */
const ICON_SOURCE = 'assets/icon.png';
/** Athenode's MCP server in `mcp.json`: `@athenode/cli`, with or without a version or a tag. */
const CLI_PACKAGE_ARG = /^@athenode\/cli(@[^@/\s]*)?$/;

const DESCRIPTION =
    "Athenode's spec-driven development workflow: think the work through as a specification tree, then have Claude Code build it.";
const HOMEPAGE = 'https://athenode.com';
const OWNER = { name: 'Athenode', url: HOMEPAGE };

/** What the setup itself has nothing for. The `version` is package.json's, added by `buildShowcase`. */
const OPTIONS = {
    manifest: {
        description: DESCRIPTION,
        author: OWNER,
        homepage: HOMEPAGE,
        repository: 'https://github.com/Athenode-SDD/athenode-setup',
        license: 'Apache-2.0',
        keywords: ['spec-driven-development', 'specifications', 'workflow', 'athenode'],
    },
    marketplace: { name: 'athenode', owner: OWNER, source: `./${PLUGIN_DIR}`, description: DESCRIPTION },
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** An exact version: the only form of the pin, so that the build is the same on every machine. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Finds the generator: the installed `@athenode/cli` (`node_modules`), which must be the version
 * package.json pins in `devDependencies`, exactly. `scripts/update-cli.mjs` raises the pin.
 *
 * Returns `{module, version}`, `module` being the generator's exports. Throws on a pin that is not
 * an exact version, on a generator that is not installed and on an installed version other than
 * the pin.
 */
export function resolveGenerator({ root = ROOT } = {}) {
    const version = readJson(join(root, 'package.json')).devDependencies?.[GENERATOR_PACKAGE];
    if (typeof version !== 'string' || !EXACT_VERSION.test(version)) {
        throw new Error(`package.json must pin ${GENERATOR_PACKAGE} to an exact version (major.minor.patch) in devDependencies`);
    }
    const manifest = join(root, 'node_modules', GENERATOR_PACKAGE, 'package.json');
    if (!existsSync(manifest)) {
        throw new Error(`${GENERATOR_PACKAGE} ${version} is not installed; run \`npm ci\``);
    }
    const found = readJson(manifest).version;
    if (found !== version) {
        throw new Error(`the installed ${GENERATOR_PACKAGE} is version ${found}, but package.json pins ${version}; run \`npm ci\``);
    }
    const require = createRequire(join(root, 'package.json'));
    return { module: require(`${GENERATOR_PACKAGE}/plugin`), version };
}

/**
 * Pins Athenode's MCP server to `version`: Anthropic's plugin directory refuses a launcher without
 * an exact version (`@latest` included). The setup itself keeps `@latest`, so that a project's
 * copy follows the CLI's releases; the plugin follows them when the pin is raised.
 */
export function pinAthenodeServer(setup, version) {
    const pin = (arg) => (CLI_PACKAGE_ARG.test(arg) ? `@athenode/cli@${version}` : arg);
    return {
        ...setup,
        mcpServers: setup.mcpServers.map((server) => (server.args ? { ...server, args: server.args.map(pin) } : server)),
    };
}

/**
 * Drops the unscoped `Bash` from each skill's Claude Code `allowed-tools`: Anthropic's plugin
 * directory holds a plugin whose skill pre-approves any shell command. In the plugin, Claude Code
 * asks before each shell command instead; a scoped entry such as `Bash(git status:*)` stays.
 */
export function dropUnscopedBash(setup) {
    const narrow = (tools) => {
        const list = Array.isArray(tools) ? tools : tools.split(',').map((tool) => tool.trim());
        const kept = list.filter((tool) => tool !== 'Bash');
        return Array.isArray(tools) ? kept : kept.join(', ');
    };
    return {
        ...setup,
        skills: setup.skills.map((skill) => {
            const block = skill.metadata.claudecode;
            const tools = block?.['allowed-tools'];
            if (typeof tools !== 'string' && !Array.isArray(tools)) {
                return skill;
            }
            const { 'allowed-tools': _, ...rest } = block;
            const narrowed = narrow(tools);
            const claudecode = narrowed.length ? { ...rest, 'allowed-tools': narrowed } : rest;
            return { ...skill, metadata: { ...skill.metadata, claudecode } };
        }),
    };
}

/**
 * Builds the showcase from the setup under `root`: a map from a path relative to `root` to the
 * bytes of the file, the package under `plugins/claude-code/` and the marketplace manifest. Holds
 * what the generator returned, given the setup with Athenode's MCP server pinned to the generator's
 * version and without the unscoped `Bash` in the skills' `allowed-tools`, and package.json's
 * `version`, plus the README from `docs/plugin-readme.md` and the icon from `assets/icon.png`. Throws when
 * the generator left something of the setup out or had something to say about it: the showcase is
 * the whole setup or nothing.
 */
export function buildShowcase(root, generator) {
    const { version } = readJson(join(root, 'package.json'));
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`package.json must hold the plugin's version as major.minor.patch in "version"`);
    }
    if (!existsSync(join(root, README_SOURCE))) {
        throw new Error(`${README_SOURCE} is missing: it is the plugin's README`);
    }
    if (!existsSync(join(root, ICON_SOURCE))) {
        throw new Error(`${ICON_SOURCE} is missing: it is the plugin's icon`);
    }
    const setup = dropUnscopedBash(pinAthenodeServer(loadPluginSetup(root), generator.version));
    const result = generator.module.buildPluginPackage(setup, TOOL, { ...OPTIONS, version });
    const problems = [
        ...result.notices.map((notice) => `${notice.code}: ${notice.message}`),
        ...result.leftOutServers.map((left) => `MCP server "${left.server.name}" left out (${left.code}): ${left.reason}`),
        ...result.notPackaged.map((item) => `${item.kind} "${item.name}" not packaged (${item.code}): ${item.reason}`),
    ];
    if (problems.length) {
        throw new Error(`the generator did not package the setup as it is:\n${[...new Set(problems)].map((problem) => `  ${problem}`).join('\n')}`);
    }
    if (!result.catalog) {
        throw new Error('the generator returned no marketplace manifest');
    }
    const files = new Map();
    for (const file of result.files) {
        files.set(`${PLUGIN_DIR}/${file.path}`, Buffer.from(file.content));
    }
    files.set(`${PLUGIN_DIR}/README.md`, readFileSync(join(root, README_SOURCE)));
    files.set(`${PLUGIN_DIR}/.claude-plugin/icon.png`, readFileSync(join(root, ICON_SOURCE)));
    files.set(result.catalog.path, Buffer.from(result.catalog.content));
    return files;
}

function filesUnder(root, dir) {
    const found = [];
    for (const entry of existsSync(join(root, dir)) ? readdirSync(join(root, dir)).sort() : []) {
        const path = `${dir}/${entry}`;
        if (statSync(join(root, path)).isDirectory()) {
            found.push(...filesUnder(root, path));
        } else {
            found.push(path);
        }
    }
    return found;
}

/**
 * Compares the tree under `root` with a build, byte for byte. Returns the problems, sorted: a
 * `missing:` or `changed:` line per built file, and a `not generated:` line per file under
 * `plugins/claude-code/` the build does not hold. Empty when the tree is the build.
 */
export function checkShowcase(root, expected) {
    const problems = [];
    for (const [path, content] of expected) {
        if (!existsSync(join(root, path))) {
            problems.push(`missing: ${path}`);
        } else if (!content.equals(readFileSync(join(root, path)))) {
            problems.push(`changed: ${path}`);
        }
    }
    for (const path of filesUnder(root, PLUGIN_DIR)) {
        if (!expected.has(path)) {
            problems.push(`not generated: ${path}`);
        }
    }
    return problems.sort();
}

function writeShowcase(root, files) {
    rmSync(join(root, PLUGIN_DIR), { recursive: true, force: true });
    for (const [path, content] of files) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
    }
}

/** The command: returns the exit code. */
export function main(args, { root = ROOT, log = console.log, error = console.error } = {}) {
    const fail = (message) => {
        error(`build-plugin.mjs: ${message}`);
        return 1;
    };
    const unknown = args.filter((arg) => arg !== '--check');
    if (unknown.length) {
        return fail(`unknown argument ${unknown.join(' ')}; usage: node scripts/build-plugin.mjs [--check]`);
    }
    const check = args.includes('--check');
    try {
        const generator = resolveGenerator({ root });
        const files = buildShowcase(root, generator);
        const from = `${GENERATOR_PACKAGE} ${generator.version}`;
        if (check) {
            const problems = checkShowcase(root, files);
            if (problems.length) {
                return fail(`the plugin is out of date; run \`npm run build\` and commit the result.\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
            }
            log(`OK: the plugin matches the setup (${files.size} files, ${from}).`);
        } else {
            writeShowcase(root, files);
            log(`Wrote ${files.size} files with ${from}: ${[...files.keys()].filter((path) => !path.startsWith(`${PLUGIN_DIR}/`)).concat(`${PLUGIN_DIR}/`).join(' and ')}.`);
        }
        return 0;
    } catch (cause) {
        return fail(cause instanceof Error ? cause.message : String(cause));
    }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
