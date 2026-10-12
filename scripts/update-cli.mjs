#!/usr/bin/env node
// Raises the pin of @athenode/cli (devDependencies) to its latest version on npm, raises the
// plugin's version and rebuilds the plugin with the new generator. Run by the pre-commit hook
// (.githooks/pre-commit) and by `npm run update-cli`.
//
//   node scripts/update-cli.mjs           raise the pin when npm has a newer version
//   node scripts/update-cli.mjs --stage   and `git add` the files it changed (the hook)
//
// Without npm's registry it changes nothing and says so: a commit is never blocked by the network.
// ATHENODE_SKIP_CLI_UPDATE=1 skips it.
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main as buildPlugin } from './build-plugin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = '@athenode/cli';
/** What a raise changes, for `--stage`. */
const CHANGED = ['package.json', 'package-lock.json', 'plugins/claude-code', '.claude-plugin/marketplace.json'];

const parse = (version) => version.split('.').map(Number);

/** Whether `candidate` is a later major.minor.patch than `current`. */
export function isNewer(candidate, current) {
    const [a, b] = [parse(candidate), parse(current)];
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) {
            return a[i] > b[i];
        }
    }
    return false;
}

/** `1.2.3` → `1.2.4`. */
export function nextPatch(version) {
    const [major, minor, patch] = parse(version);
    return `${major}.${minor}.${patch + 1}`;
}

/** Runs npm the same way on every platform: Node refuses to start `npm.cmd` without a shell. */
function npm(args, root) {
    return execFileSync('npm', args, { cwd: root, encoding: 'utf8', timeout: 120_000, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
}

const DEFAULTS = {
    latest: (root) => npm(['view', PACKAGE, 'version'], root).trim(),
    install: (root, version) => npm(['install', '--save-dev', '--save-exact', `${PACKAGE}@${version}`], root),
    build: (root) => buildPlugin([], { root, log: () => {} }),
    stage: (root, paths) => execFileSync('git', ['add', '--', ...paths], { cwd: root, stdio: 'inherit' }),
};

/**
 * The command: returns the exit code. `effects` replaces the calls to npm, the build and git
 * (`latest`, `install`, `build`, `stage`), for the tests.
 */
export function main(args, { root = ROOT, env = process.env, log = console.log, error = console.error, effects = {} } = {}) {
    const { latest, install, build, stage } = { ...DEFAULTS, ...effects };
    const fail = (message) => {
        error(`update-cli.mjs: ${message}`);
        return 1;
    };
    const unknown = args.filter((arg) => arg !== '--stage');
    if (unknown.length) {
        return fail(`unknown argument ${unknown.join(' ')}; usage: node scripts/update-cli.mjs [--stage]`);
    }
    if (env.ATHENODE_SKIP_CLI_UPDATE === '1') {
        return 0;
    }
    const manifestPath = join(root, 'package.json');
    const pinned = JSON.parse(readFileSync(manifestPath, 'utf8')).devDependencies?.[PACKAGE];
    let available;
    try {
        available = latest(root);
    } catch {
        log(`update-cli.mjs: npm's registry did not answer; ${PACKAGE} stays at ${pinned}.`);
        return 0;
    }
    if (!/^\d+\.\d+\.\d+$/.test(available ?? '')) {
        return fail(`npm reported "${available}" as the latest ${PACKAGE}, which is not a major.minor.patch version`);
    }
    if (!isNewer(available, pinned)) {
        return 0;
    }
    try {
        install(root, available);
    } catch (cause) {
        return fail(`could not install ${PACKAGE} ${available}: ${cause instanceof Error ? cause.message : cause}`);
    }
    // npm rewrote package.json with the new pin: raise the plugin's version on what it wrote.
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const from = manifest.version;
    manifest.version = nextPatch(from);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (build(root) !== 0) {
        return fail(`the plugin did not build with ${PACKAGE} ${available}; fix it, or commit with ATHENODE_SKIP_CLI_UPDATE=1`);
    }
    if (args.includes('--stage')) {
        stage(root, CHANGED);
    }
    log(`update-cli.mjs: ${PACKAGE} ${pinned} → ${available}, plugin ${from} → ${manifest.version}; the plugin is rebuilt${args.includes('--stage') ? ' and staged' : ''}.`);
    return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
