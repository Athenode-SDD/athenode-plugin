// Tests of the check for the names @athenode/cli 0.10.7 renamed from "setup" to "plugin"
// (legacy-terms.mjs, run by validate.mjs). Run with `node --test scripts/*.test.mjs`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findLegacyTerms } from './legacy-terms.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const terms = (text) => findLegacyTerms(text).map((hit) => hit.term);

describe('the legacy terms', () => {
    test('finds an old setups_ tool, with its line', () => {
        assert.deepEqual(findLegacyTerms('Read it.\nLoad it with `setups_files_get`.\n'), [
            { line: 2, term: 'setups_files_get', instead: 'the plugins_ tool' },
        ]);
    });

    test('finds the old parameters', () => {
        assert.deepEqual(terms('Pass `setupId`, or `setup` with `setupById: true`, as {"setup": "x"}.'), ['setupId', 'setupById', '"setup"']);
    });

    test('finds the old CLI flags, and not a longer word', () => {
        assert.deepEqual(terms('Run `init --setup x`, `--setup-id y` or `--setup-by-id`.'), ['--setup', '--setup-id', '--setup-by-id']);
        assert.deepEqual(terms('`--setups-dir` and --setupx stay.'), []);
    });

    test('finds the repository\'s old name', () => {
        assert.deepEqual(terms('npx skills add Athenode-SDD/athenode-setup'), ['athenode-setup']);
    });

    test('lets the error codes 0.10.7 still returns pass', () => {
        assert.deepEqual(terms('Refused with `setup_name_conflict`, `setup_slug_conflict` or `setup_slug_*`.'), []);
    });

    test('lets actions/setup-node and the local directory as a path pass', () => {
        assert.deepEqual(terms('uses: actions/setup-node@v4'), []);
        assert.deepEqual(terms('The clone may still be in `athenode-setup/`.'), []);
    });

    test('lets plain words pass: setup, set up, plugin terms', () => {
        assert.deepEqual(terms('Set up the plugin with `plugins_files_get`, `pluginId` and `--plugin`; the setup works.'), []);
    });

    test('reports each term on a line in order, an allowed one in between', () => {
        assert.deepEqual(terms('`setupById` then `setup_name_conflict` then `setups_list`'), ['setupById', 'setups_list']);
    });
});

describe('validate.mjs', () => {
    test('passes on this repository', () => {
        const out = execFileSync(process.execPath, [join(ROOT, 'scripts/validate.mjs')], { encoding: 'utf8' });
        assert.match(out, /^OK:/);
    });
});
