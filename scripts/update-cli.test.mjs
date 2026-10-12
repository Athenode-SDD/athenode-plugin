// Tests of the raise of the @athenode/cli pin (update-cli.mjs), with npm, the build and git
// replaced. Run with `node --test scripts/*.test.mjs`.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { isNewer, main, nextPatch } from './update-cli.mjs';

const temporary = [];
after(() => {
    for (const dir of temporary) {
        rmSync(dir, { recursive: true, force: true });
    }
});

function project(pin = '0.9.1', version = '1.0.0') {
    const root = mkdtempSync(join(tmpdir(), 'athenode-update-cli-test-'));
    temporary.push(root);
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'fixture', version, devDependencies: { '@athenode/cli': pin } }, null, 2)}\n`);
    return root;
}

const manifest = (root) => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Runs the command with npm, the build and git recorded; `install` writes the pin as npm does. */
function run(args, root, { latest = () => '0.9.1', build = () => 0, env = {} } = {}) {
    const calls = [];
    const out = [];
    const err = [];
    const effects = {
        latest: () => latest(),
        install: (dir, version) => {
            calls.push(`install ${version}`);
            const written = manifest(dir);
            written.devDependencies['@athenode/cli'] = version;
            writeFileSync(join(dir, 'package.json'), `${JSON.stringify(written, null, 2)}\n`);
        },
        build: (dir) => {
            calls.push('build');
            return build(dir);
        },
        stage: (dir, paths) => calls.push(`stage ${paths.join(' ')}`),
    };
    const code = main(args, { root, env, effects, log: (line) => out.push(line), error: (line) => err.push(line) });
    return { code, calls, out: out.join('\n'), err: err.join('\n') };
}

describe('versions', () => {
    test('compares major, minor and patch as numbers', () => {
        assert.equal(isNewer('0.9.2', '0.9.1'), true);
        assert.equal(isNewer('0.10.0', '0.9.9'), true);
        assert.equal(isNewer('1.0.0', '0.99.99'), true);
        assert.equal(isNewer('0.9.1', '0.9.1'), false);
        assert.equal(isNewer('0.9.0', '0.9.1'), false);
    });

    test('raises the patch', () => {
        assert.equal(nextPatch('1.0.0'), '1.0.1');
        assert.equal(nextPatch('1.2.9'), '1.2.10');
    });
});

describe('the command', () => {
    test('changes nothing when the pin is the latest version', () => {
        const root = project();
        const result = run(['--stage'], root);
        assert.equal(result.code, 0);
        assert.deepEqual(result.calls, []);
        assert.equal(manifest(root).version, '1.0.0');
    });

    test('raises the pin and the plugin version, rebuilds and stages on a newer version', () => {
        const root = project();
        const result = run(['--stage'], root, { latest: () => '0.10.0' });
        assert.equal(result.code, 0);
        assert.deepEqual(result.calls, ['install 0.10.0', 'build', 'stage package.json package-lock.json plugins/claude-code .claude-plugin/marketplace.json']);
        assert.equal(manifest(root).devDependencies['@athenode/cli'], '0.10.0');
        assert.equal(manifest(root).version, '1.0.1');
        assert.match(result.out, /0\.9\.1 → 0\.10\.0, plugin 1\.0\.0 → 1\.0\.1; the plugin is rebuilt and staged/);
    });

    test('stages nothing without --stage', () => {
        const result = run([], project(), { latest: () => '0.9.2' });
        assert.equal(result.code, 0);
        assert.deepEqual(result.calls, ['install 0.9.2', 'build']);
    });

    test('lets the commit through when npm does not answer', () => {
        const root = project();
        const result = run(['--stage'], root, { latest: () => { throw new Error('offline'); } });
        assert.equal(result.code, 0);
        assert.deepEqual(result.calls, []);
        assert.match(result.out, /did not answer; @athenode\/cli stays at 0\.9\.1/);
    });

    test('fails on an answer that is not a version, and on a build that fails', () => {
        assert.equal(run([], project(), { latest: () => 'latest' }).code, 1);
        const failed = run(['--stage'], project(), { latest: () => '0.9.2', build: () => 1 });
        assert.equal(failed.code, 1);
        assert.deepEqual(failed.calls, ['install 0.9.2', 'build']);
        assert.match(failed.err, /did not build with @athenode\/cli 0\.9\.2/);
    });

    test('is skipped with ATHENODE_SKIP_CLI_UPDATE=1, and refuses an unknown argument', () => {
        assert.deepEqual(run(['--stage'], project(), { latest: () => '9.9.9', env: { ATHENODE_SKIP_CLI_UPDATE: '1' } }).calls, []);
        assert.equal(run(['--stgae'], project()).code, 1);
    });
});
