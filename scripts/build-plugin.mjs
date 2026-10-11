#!/usr/bin/env node
// Builds the Claude Code plugin (plugins/claude-code/) and the marketplace manifest
// (.claude-plugin/marketplace.json) from the setup in this repository, with the plugin generator of
// @athenode/cli. This script only reads the setup (plugin-setup.mjs), hands it to the generator and
// writes what comes back: the names, the frontmatter and the layout are the generator's.
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
const GENERATOR_ENTRY = 'dist/plugin/index.js';

const DESCRIPTION =
    "Athenode's spec-driven development workflow: think the work through as a specification tree, then have Claude Code build it.";
const HOMEPAGE = 'https://athenode.com';
const OWNER = { name: 'Athenode', url: HOMEPAGE };

/** What the setup itself has nothing for. No `version`: Claude Code then takes the commit as the version. */
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

/**
 * Finds the generator: the installed `@athenode/cli` (`node_modules`), then a checkout named by
 * `ATHENODE_CLI_DIR`, then the sibling checkout `../cli`; the last two need a built `dist/`.
 * Whatever the source, its version must be the one package.json pins (`config.athenodeCli`).
 *
 * Returns `{module, version, source, tried}`: `module` is the generator's exports, or `null` when
 * none of the places holds it (`tried` lists them). Throws on a missing pin, on a version other
 * than the pin and on an `ATHENODE_CLI_DIR` without a built generator.
 */
export function resolveGenerator({ root = ROOT, env = process.env } = {}) {
    const version = readJson(join(root, 'package.json')).config?.athenodeCli;
    if (typeof version !== 'string' || !version) {
        throw new Error(`package.json must pin the generator's version in config.athenodeCli`);
    }
    const require = createRequire(join(root, 'package.json'));
    const installed = join(root, 'node_modules', GENERATOR_PACKAGE);
    const sibling = resolve(root, '..', 'cli');
    const candidates = [
        { source: `node_modules/${GENERATOR_PACKAGE}`, dir: installed, entry: () => require.resolve(`${GENERATOR_PACKAGE}/plugin`) },
        ...(env.ATHENODE_CLI_DIR
            ? [{ source: `ATHENODE_CLI_DIR (${env.ATHENODE_CLI_DIR})`, dir: resolve(env.ATHENODE_CLI_DIR), entry: null, required: true }]
            : []),
        { source: `the sibling checkout ${sibling}`, dir: sibling, entry: null },
    ];
    for (const candidate of candidates) {
        const manifest = join(candidate.dir, 'package.json');
        const entry = candidate.entry ? null : join(candidate.dir, GENERATOR_ENTRY);
        if (!existsSync(manifest) || (entry && !existsSync(entry))) {
            if (candidate.required) {
                throw new Error(`${candidate.source} holds no ${GENERATOR_ENTRY}; run \`npm run build\` in that checkout of ${GENERATOR_PACKAGE}`);
            }
            continue;
        }
        const found = readJson(manifest).version;
        if (found !== version) {
            throw new Error(`${GENERATOR_PACKAGE} in ${candidate.source} is version ${found}, but package.json pins ${version} (config.athenodeCli)`);
        }
        return { module: require(entry ?? candidate.entry()), version, source: candidate.source, tried: [] };
    }
    return { module: null, version, source: null, tried: candidates.map((candidate) => candidate.source) };
}

/**
 * Builds the showcase from the setup under `root`: a map from a path relative to `root` to the
 * bytes of the file, the package under `plugins/claude-code/` and the marketplace manifest. Holds
 * exactly what the generator returned. Throws when the generator left something of the setup out
 * or had something to say about it: the showcase is the whole setup or nothing.
 */
export function buildShowcase(root, generator) {
    const result = generator.module.buildPluginPackage(loadPluginSetup(root), TOOL, OPTIONS);
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

function notInstalled(generator) {
    return [
        `${GENERATOR_PACKAGE} ${generator.version} is not installed, and the plugin is built by its generator.`,
        `Looked in: ${generator.tried.join('; ')}.`,
        `Check ${GENERATOR_PACKAGE} out next to this repository (../cli) or point ATHENODE_CLI_DIR at a checkout,`,
        `at version ${generator.version}, and run \`npm ci && npm run build\` in it. See README.md, "Claude Code plugin".`,
    ].join('\n');
}

const isSet = (value) => Boolean(value) && value !== 'false' && value !== '0';

/** The command: returns the exit code. */
export function main(args, { root = ROOT, env = process.env, log = console.log, error = console.error } = {}) {
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
        const generator = resolveGenerator({ root, env });
        if (!generator.module) {
            if (check && isSet(env.CI)) {
                // Until the pinned version is on npm, a CI checkout has no generator: say so where it shows.
                log(`::warning::plugin drift check SKIPPED: ${GENERATOR_PACKAGE} ${generator.version} is not installed. `
                    + `${PLUGIN_DIR}/ was NOT compared with the setup in this run.`);
                return 0;
            }
            return fail(notInstalled(generator));
        }
        const files = buildShowcase(root, generator);
        const from = `${GENERATOR_PACKAGE} ${generator.version} from ${generator.source}`;
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
