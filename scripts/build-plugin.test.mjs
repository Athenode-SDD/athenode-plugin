// Tests of the plugin build: the adapter (plugin-setup.mjs), the generator's resolver, the build
// and the drift check (build-plugin.mjs). Run with `node --test scripts/*.test.mjs`.
//
// The tests that build a package need the generator of @athenode/cli; where it cannot be resolved
// (see README.md, "Claude Code plugin") they are skipped, and the others still run.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildShowcase, checkShowcase, main, resolveGenerator } from './build-plugin.mjs';
import { loadPluginSetup } from './plugin-setup.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).config.athenodeCli;
const PLUGIN_DIR = 'plugins/claude-code';
const MARKETPLACE_FILE = '.claude-plugin/marketplace.json';

const temporary = [];
after(() => {
    for (const dir of temporary) {
        rmSync(dir, { recursive: true, force: true });
    }
});

function tempDir() {
    const dir = mkdtempSync(join(tmpdir(), 'athenode-setup-test-'));
    temporary.push(dir);
    return dir;
}

function write(root, path, content) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
}

const document = (name, extra, body) => `---\nname: ${name}\ndescription: Use when ${name} is needed.\n${extra}---\n\n${body}`;
const STDIO = { type: 'stdio', command: 'npx', args: ['-y', 'some-server'] };

/** A setup directory: `skills` and `agents` map a name to a body, or to a whole file with `{raw}`. */
function fixture({ skills = { 'atn-one': 'Body of one.\n' }, agents = { helper: 'Prompt of helper.\n' }, servers = { local: STDIO }, pin = PIN } = {}) {
    const root = join(tempDir(), 'setup');
    write(root, 'package.json', JSON.stringify({ name: 'fixture', config: { athenodeCli: pin } }));
    for (const [name, body] of Object.entries(skills)) {
        write(root, `skills/${name}/SKILL.md`, typeof body === 'string' ? document(name, '', body) : body.raw);
    }
    for (const [name, body] of Object.entries(agents)) {
        write(root, `subagents/${name}.md`, typeof body === 'string' ? document(name, '', body) : body.raw);
    }
    write(root, 'mcp.json', JSON.stringify({ mcpServers: servers }));
    return root;
}

/** A stand-in for the @athenode/cli package: a manifest with a version and a module that says where it was loaded from. */
function fakeCli(dir, version, marker) {
    write(dir, 'package.json', JSON.stringify({
        name: '@athenode/cli',
        version,
        exports: { './plugin': './dist/plugin/index.js', './package.json': './package.json' },
    }));
    write(dir, 'dist/plugin/index.js', `exports.marker = ${JSON.stringify(marker)};\nexports.buildPluginPackage = () => { throw new Error('a stand-in'); };\n`);
}

const text = (files, path) => files.get(path).toString('utf8');

describe('the adapter', () => {
    test('takes the metadata from the frontmatter without the name, per-target blocks included', () => {
        const root = fixture({
            skills: {
                'atn-one': { raw: '---\nname: atn-one\ndescription: Use when one.\nclaudecode:\n  argument-hint: "[id]"\n  allowed-tools: Read, Bash\ncopilot:\n  allowed-tools:\n    - execute\n---\n\nBody of one.\n' },
            },
        });
        const [skill] = loadPluginSetup(root).skills;
        assert.equal(skill.name, 'atn-one');
        assert.deepEqual(skill.metadata, {
            description: 'Use when one.',
            claudecode: { 'argument-hint': '[id]', 'allowed-tools': 'Read, Bash' },
            copilot: { 'allowed-tools': ['execute'] },
        });
        assert.deepEqual(skill.files, []);
    });

    test('drops one blank line after the frontmatter, and only one', () => {
        const root = fixture({
            skills: { 'atn-one': { raw: '---\nname: atn-one\ndescription: Use when one.\n---\n\n\nSecond line.\n' } },
            agents: { helper: { raw: '---\nname: helper\ndescription: Use when helping.\n---\nNo blank line.\n' } },
        });
        const setup = loadPluginSetup(root);
        assert.equal(setup.skills[0].content, '\nSecond line.\n');
        assert.equal(setup.agents[0].content, 'No blank line.\n');
        assert.deepEqual(setup.agents[0].metadata, { description: 'Use when helping.' });
    });

    test('refuses a file without frontmatter', () => {
        const root = fixture({ agents: { helper: { raw: 'Just a prompt.\n' } } });
        assert.throws(() => loadPluginSetup(root), /subagents\/helper\.md must start with a YAML frontmatter block/);
    });

    test('refuses a frontmatter that is not a mapping', () => {
        const root = fixture({ agents: { helper: { raw: '---\n- a\n- b\n---\n\nPrompt.\n' } } });
        assert.throws(() => loadPluginSetup(root), /the frontmatter must be a mapping/);
    });

    test('refuses a file without a name, and a name other than the file name', () => {
        const noName = fixture({ agents: { helper: { raw: '---\ndescription: Use when helping.\n---\n\nPrompt.\n' } } });
        assert.throws(() => loadPluginSetup(noName), /subagents\/helper\.md: frontmatter name "undefined" must be "helper"/);
        const otherName = fixture({ skills: { 'atn-one': { raw: '---\nname: atn-two\ndescription: Use when one.\n---\n\nBody.\n' } } });
        assert.throws(() => loadPluginSetup(otherName), /SKILL\.md: frontmatter name "atn-two" must be "atn-one"/);
    });

    test('refuses a missing description and an empty body', () => {
        const noDescription = fixture({ agents: { helper: { raw: '---\nname: helper\n---\n\nPrompt.\n' } } });
        assert.throws(() => loadPluginSetup(noDescription), /the frontmatter needs a description/);
        const noBody = fixture({ agents: { helper: { raw: '---\nname: helper\ndescription: Use when helping.\n---\n\n' } } });
        assert.throws(() => loadPluginSetup(noBody), /the body is empty/);
    });

    test('refuses a name that is not a valid path segment', () => {
        const root = fixture({ agents: { Helper_One: 'Prompt.\n' } });
        assert.throws(() => loadPluginSetup(root), /"Helper_One" is not a valid agent name/);
    });

    test('refuses an extra file in a skill directory, so that a bundle file is never dropped silently', () => {
        const root = fixture();
        write(root, 'skills/atn-one/reference.md', 'More.\n');
        assert.throws(() => loadPluginSetup(root), /skills\/atn-one: .*only SKILL\.md \(found reference\.md\)/);
    });

    test('refuses a file in skills/ and a file other than <name>.md in subagents/', () => {
        const strayFile = fixture();
        write(strayFile, 'skills/notes.txt', 'x');
        assert.throws(() => loadPluginSetup(strayFile), /skills\/notes\.txt/);
        const notMarkdown = fixture();
        write(notMarkdown, 'subagents/helper.txt', 'x');
        assert.throws(() => loadPluginSetup(notMarkdown), /subagents\/helper\.txt: only <name>\.md files belong here/);
    });

    test('maps a stdio and an http server to the shape of the export, with nulls', () => {
        const root = fixture({
            servers: {
                remote: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Key': 'k' } },
                local: { type: 'stdio', command: 'node', args: ['server.js'], env: { MODE: 'x' } },
                bare: { type: 'stdio', command: 'bare' },
                events: { type: 'sse', url: 'https://example.com/sse' },
            },
        });
        assert.deepEqual(loadPluginSetup(root).mcpServers, [
            { name: 'bare', transport: 'stdio', command: 'bare', args: [], env: null, url: null, headers: null },
            { name: 'events', transport: 'sse', command: null, args: null, env: null, url: 'https://example.com/sse', headers: null },
            { name: 'local', transport: 'stdio', command: 'node', args: ['server.js'], env: { MODE: 'x' }, url: null, headers: null },
            { name: 'remote', transport: 'http', command: null, args: null, env: null, url: 'https://example.com/mcp', headers: { 'X-Key': 'k' } },
        ]);
    });

    test('refuses a malformed server', () => {
        assert.throws(() => loadPluginSetup(fixture({ servers: { x: { type: 'pipe' } } })), /server "x": type must be stdio, http or sse/);
        assert.throws(() => loadPluginSetup(fixture({ servers: { x: { type: 'stdio' } } })), /a stdio server needs a command/);
        assert.throws(() => loadPluginSetup(fixture({ servers: { x: { type: 'http' } } })), /an http server needs a url/);
        assert.throws(() => loadPluginSetup(fixture({ servers: { x: { type: 'stdio', command: 'a', args: [1] } } })), /args must be a list of strings/);
        assert.throws(() => loadPluginSetup(fixture({ servers: { x: { type: 'stdio', command: 'a', env: { A: 1 } } } })), /env must map names to strings/);
    });

    test('names the plugin atn and sorts everything by name', () => {
        const root = fixture({
            skills: { 'atn-two': 'Two.\n', 'atn-one': 'One.\n', 'atn-three': 'Three.\n' },
            agents: { zeta: 'Z.\n', alpha: 'A.\n' },
            servers: { second: STDIO, first: STDIO },
        });
        const setup = loadPluginSetup(root);
        assert.equal(setup.slug, 'atn');
        assert.deepEqual(setup.skills.map((s) => s.name), ['atn-one', 'atn-three', 'atn-two']);
        assert.deepEqual(setup.agents.map((a) => a.name), ['alpha', 'zeta']);
        assert.deepEqual(setup.mcpServers.map((s) => s.name), ['first', 'second']);
        assert.deepEqual(loadPluginSetup(root), setup);
    });

    test('reads this repository: seven atn- skills, ten agents and the athenode server', () => {
        const setup = loadPluginSetup(ROOT);
        assert.equal(setup.slug, 'atn');
        assert.equal(setup.skills.length, 7);
        assert.ok(setup.skills.every((skill) => skill.name.startsWith('atn-') && skill.files.length === 0));
        assert.equal(setup.agents.length, 10);
        assert.deepEqual(setup.mcpServers.map((server) => server.name), ['athenode']);
        assert.equal(setup.mcpServers[0].transport, 'stdio');
        assert.ok(!('rules' in setup));
    });
});

describe('the resolver of the generator', () => {
    test('prefers the installed module', () => {
        const root = fixture();
        fakeCli(join(root, 'node_modules/@athenode/cli'), PIN, 'installed');
        fakeCli(join(root, '../cli'), PIN, 'sibling');
        const other = tempDir();
        fakeCli(other, PIN, 'env');
        const generator = resolveGenerator({ root, env: { ATHENODE_CLI_DIR: other } });
        assert.equal(generator.module.marker, 'installed');
        assert.equal(generator.version, PIN);
        assert.match(generator.source, /node_modules/);
    });

    test('uses ATHENODE_CLI_DIR before the sibling checkout', () => {
        const root = fixture();
        fakeCli(join(root, '../cli'), PIN, 'sibling');
        const other = tempDir();
        fakeCli(other, PIN, 'env');
        const generator = resolveGenerator({ root, env: { ATHENODE_CLI_DIR: other } });
        assert.equal(generator.module.marker, 'env');
        assert.match(generator.source, /ATHENODE_CLI_DIR/);
    });

    test('falls back to the sibling checkout', () => {
        const root = fixture();
        fakeCli(join(root, '../cli'), PIN, 'sibling');
        const generator = resolveGenerator({ root, env: {} });
        assert.equal(generator.module.marker, 'sibling');
        assert.equal(typeof generator.module.buildPluginPackage, 'function');
    });

    test('rejects a version other than the pin, whatever the source', () => {
        const installed = fixture();
        fakeCli(join(installed, 'node_modules/@athenode/cli'), '0.0.1', 'installed');
        fakeCli(join(installed, '../cli'), PIN, 'sibling');
        assert.throws(() => resolveGenerator({ root: installed, env: {} }), new RegExp(`is version 0\\.0\\.1, but package\\.json pins ${PIN.replaceAll('.', '\\.')}`));

        const fromEnv = fixture();
        const other = tempDir();
        fakeCli(other, '0.0.2', 'env');
        assert.throws(() => resolveGenerator({ root: fromEnv, env: { ATHENODE_CLI_DIR: other } }), /is version 0\.0\.2/);

        const sibling = fixture();
        fakeCli(join(sibling, '../cli'), '0.0.3', 'sibling');
        assert.throws(() => resolveGenerator({ root: sibling, env: {} }), /is version 0\.0\.3/);
    });

    test('rejects an ATHENODE_CLI_DIR that holds no built generator', () => {
        const root = fixture();
        const empty = tempDir();
        assert.throws(() => resolveGenerator({ root, env: { ATHENODE_CLI_DIR: empty } }), /ATHENODE_CLI_DIR .*holds no dist\/plugin\/index\.js/);
    });

    test('rejects a package.json without a pin', () => {
        const root = fixture();
        write(root, 'package.json', JSON.stringify({ name: 'fixture' }));
        assert.throws(() => resolveGenerator({ root, env: {} }), /config\.athenodeCli/);
    });

    test('reports that nothing was found, with the pin and the places it looked in', () => {
        const root = fixture();
        const generator = resolveGenerator({ root, env: {} });
        assert.equal(generator.module, null);
        assert.equal(generator.version, PIN);
        assert.deepEqual(generator.tried.map((place) => place.split(' ')[0]), ['node_modules/@athenode/cli', 'the']);
        assert.equal(resolveGenerator({ root, env: { ATHENODE_CLI_DIR: '' } }).module, null);
    });
});

describe('the command', () => {
    function run(args, root, env) {
        const out = [];
        const err = [];
        const code = main(args, { root, env, log: (line) => out.push(line), error: (line) => err.push(line) });
        return { code, out: out.join('\n'), err: err.join('\n') };
    }

    test('--check without a generator fails when CI is not set', () => {
        for (const env of [{}, { CI: '' }, { CI: 'false' }]) {
            const result = run(['--check'], fixture(), env);
            assert.equal(result.code, 1);
            assert.match(result.err, new RegExp(`@athenode/cli ${PIN.replaceAll('.', '\\.')} is not installed`));
            assert.match(result.err, /ATHENODE_CLI_DIR/);
        }
    });

    test('--check without a generator is skipped with a warning annotation when CI is set', () => {
        const result = run(['--check'], fixture(), { CI: 'true' });
        assert.equal(result.code, 0);
        assert.match(result.out, new RegExp(`^::warning::plugin drift check SKIPPED: @athenode/cli ${PIN.replaceAll('.', '\\.')} is not installed`));
    });

    test('a build without a generator fails, CI or not', () => {
        for (const env of [{}, { CI: 'true' }]) {
            const root = fixture();
            const result = run([], root, env);
            assert.equal(result.code, 1);
            assert.match(result.err, /is not installed/);
            assert.deepEqual(checkShowcase(root, new Map()), []);
        }
    });

    test('a generator of another version fails the check even when CI is set', () => {
        const root = fixture();
        fakeCli(join(root, '../cli'), '0.0.1', 'sibling');
        const result = run(['--check'], root, { CI: 'true' });
        assert.equal(result.code, 1);
        assert.match(result.err, /is version 0\.0\.1/);
    });

    test('an unknown argument is refused', () => {
        const result = run(['--chekc'], fixture(), {});
        assert.equal(result.code, 1);
        assert.match(result.err, /--chekc/);
    });
});

describe('the drift check', () => {
    const expected = () => new Map([
        [`${PLUGIN_DIR}/.claude-plugin/plugin.json`, Buffer.from('{"name":"atn"}\n')],
        [`${PLUGIN_DIR}/skills/one/SKILL.md`, Buffer.from('One.\n')],
        [MARKETPLACE_FILE, Buffer.from('{"name":"athenode"}\n')],
    ]);

    function written() {
        const root = fixture();
        for (const [path, content] of expected()) {
            write(root, path, content);
        }
        return root;
    }

    test('finds nothing in a tree that holds exactly the built files', () => {
        assert.deepEqual(checkShowcase(written(), expected()), []);
    });

    test('reports a changed byte', () => {
        const root = written();
        write(root, `${PLUGIN_DIR}/skills/one/SKILL.md`, 'One!\n');
        assert.deepEqual(checkShowcase(root, expected()), [`changed: ${PLUGIN_DIR}/skills/one/SKILL.md`]);
    });

    test('reports a difference in line endings, since bytes are compared', () => {
        const root = written();
        write(root, `${PLUGIN_DIR}/skills/one/SKILL.md`, 'One.\r\n');
        assert.deepEqual(checkShowcase(root, expected()), [`changed: ${PLUGIN_DIR}/skills/one/SKILL.md`]);
    });

    test('reports a missing file, the marketplace file included', () => {
        const root = written();
        rmSync(join(root, `${PLUGIN_DIR}/.claude-plugin/plugin.json`));
        rmSync(join(root, MARKETPLACE_FILE));
        assert.deepEqual(checkShowcase(root, expected()), [`missing: ${MARKETPLACE_FILE}`, `missing: ${PLUGIN_DIR}/.claude-plugin/plugin.json`]);
    });

    test('reports a file under the plugin directory that the build does not write', () => {
        const root = written();
        write(root, `${PLUGIN_DIR}/hooks/hooks.json`, '{}\n');
        write(root, `${PLUGIN_DIR}/skills/atn-one/SKILL.md`, 'Old.\n');
        assert.deepEqual(checkShowcase(root, expected()), [`not generated: ${PLUGIN_DIR}/hooks/hooks.json`, `not generated: ${PLUGIN_DIR}/skills/atn-one/SKILL.md`]);
    });
});

describe('the build', () => {
    const generator = resolveGenerator();
    const skip = generator.module ? false : `@athenode/cli ${generator.version} is not installed (see README.md, "Claude Code plugin")`;

    test('writes the marketplace file and files under the plugin directory, nothing else', { skip }, () => {
        const files = buildShowcase(fixture(), generator);
        assert.deepEqual([...files.keys()].sort(), [
            MARKETPLACE_FILE,
            `${PLUGIN_DIR}/.claude-plugin/plugin.json`,
            `${PLUGIN_DIR}/.mcp.json`,
            `${PLUGIN_DIR}/agents/helper.md`,
            `${PLUGIN_DIR}/skills/one/SKILL.md`,
        ]);
        assert.ok([...files.values()].every((content) => Buffer.isBuffer(content)));
    });

    test('names the plugin atn, with the descriptive fields and no version', { skip }, () => {
        const manifest = JSON.parse(text(buildShowcase(fixture(), generator), `${PLUGIN_DIR}/.claude-plugin/plugin.json`));
        assert.equal(manifest.name, 'atn');
        assert.match(manifest.description, /^Athenode's spec-driven development workflow/);
        assert.deepEqual(manifest.author, { name: 'Athenode', url: 'https://athenode.com' });
        assert.equal(manifest.homepage, 'https://athenode.com');
        assert.equal(manifest.repository, 'https://github.com/Athenode-SDD/athenode-setup');
        assert.equal(manifest.license, 'Apache-2.0');
        assert.deepEqual(manifest.keywords, ['spec-driven-development', 'specifications', 'workflow', 'athenode']);
        assert.ok(!('version' in manifest));
    });

    test('lists exactly one plugin, atn, in the marketplace athenode', { skip }, () => {
        const marketplace = JSON.parse(text(buildShowcase(fixture(), generator), MARKETPLACE_FILE));
        assert.equal(marketplace.name, 'athenode');
        assert.deepEqual(marketplace.owner, { name: 'Athenode', url: 'https://athenode.com' });
        assert.equal(marketplace.plugins.length, 1);
        assert.equal(marketplace.plugins[0].name, 'atn');
        assert.equal(marketplace.plugins[0].source, './plugins/claude-code');
        assert.match(marketplace.plugins[0].description, /^Athenode's spec-driven development workflow/);
    });

    test('rewrites a name in backticks or after a slash, and nowhere else', { skip }, () => {
        const root = fixture({
            skills: {
                'atn-one': 'Invoke `atn-two`, or type /atn-two. In prose atn-two stays. Spawn `helper`.\n',
                'atn-two': 'Two.\n',
            },
        });
        const files = buildShowcase(root, generator);
        const skill = text(files, `${PLUGIN_DIR}/skills/one/SKILL.md`);
        assert.match(skill, /^---\nname: one\n/);
        assert.match(skill, /Invoke `atn:two`, or type \/atn:two\. In prose atn-two stays\. Spawn `atn:helper`\./);
        assert.ok(files.has(`${PLUGIN_DIR}/skills/two/SKILL.md`));
    });

    test('takes the frontmatter Claude Code reads from the claudecode block', { skip }, () => {
        const root = fixture({
            skills: {
                'atn-one': { raw: '---\nname: atn-one\ndescription: Use when one.\nclaudecode:\n  argument-hint: "[id]"\ncopilot:\n  argument-hint: "[other]"\n---\n\nBody of one.\n' },
            },
        });
        const skill = text(buildShowcase(root, generator), `${PLUGIN_DIR}/skills/one/SKILL.md`);
        const frontmatter = skill.slice(0, skill.indexOf('\n---\n'));
        assert.match(frontmatter, /argument-hint: .*\[id\]/);
        assert.doesNotMatch(frontmatter, /copilot|other/);
        assert.ok(skill.endsWith('\n---\n\nBody of one.\n') || skill.endsWith('\n---\nBody of one.\n'));
    });

    test('fails on a skill without the atn- prefix', { skip }, () => {
        const root = fixture({ skills: { 'atn-one': 'One.\n', one: 'Plain one.\n' } });
        assert.throws(() => buildShowcase(root, generator), /the generator did not package the setup as it is/);
    });

    test('fails on a server the package cannot hold, such as a ${VAR} in the command', { skip }, () => {
        const root = fixture({ servers: { local: { type: 'stdio', command: '${TOOLS_DIR}/server', args: [] } } });
        assert.throws(() => buildShowcase(root, generator), /the generator did not package the setup as it is[\s\S]*local/);
    });

    test('builds this repository: prefix-free skills, renamed references, no rules and no hook', { skip }, () => {
        const files = buildShowcase(ROOT, generator);
        const paths = [...files.keys()];
        assert.equal(paths.length, 20);
        assert.ok(paths.every((path) => path === MARKETPLACE_FILE || path.startsWith(`${PLUGIN_DIR}/`)));
        const skills = paths.filter((path) => path.startsWith(`${PLUGIN_DIR}/skills/`)).map((path) => path.split('/')[3]).sort();
        assert.deepEqual(skills, ['apply', 'decompose', 'manage', 'mindmap', 'settings', 'todo-dequeue', 'todo-enqueue']);
        assert.equal(paths.filter((path) => path.startsWith(`${PLUGIN_DIR}/agents/`)).length, 10);

        assert.match(readFileSync(join(ROOT, 'skills/atn-mindmap/SKILL.md'), 'utf8'), /`atn-apply`/);
        const mindmap = text(files, `${PLUGIN_DIR}/skills/mindmap/SKILL.md`);
        assert.match(mindmap, /`atn:apply`/);
        assert.doesNotMatch(mindmap, /`atn-apply`/);

        assert.ok(!paths.some((path) => /hook|rules|CLAUDE\.md|AGENTS\.md/i.test(path)));
        const rules = readFileSync(join(ROOT, 'rules/athenode.md'), 'utf8').split('\n').find((line) => line.trim().length > 40);
        assert.ok([...files.values()].every((content) => !content.toString('utf8').includes(rules)));

        assert.deepEqual(JSON.parse(text(files, `${PLUGIN_DIR}/.mcp.json`)), JSON.parse(readFileSync(join(ROOT, 'mcp.json'), 'utf8')));
    });

    test('is deterministic', { skip }, () => {
        const first = buildShowcase(ROOT, generator);
        const second = buildShowcase(ROOT, generator);
        assert.deepEqual([...first.keys()], [...second.keys()]);
        assert.ok([...first].every(([path, content]) => content.equals(second.get(path))));
    });

    test('the committed package equals what the generator builds', { skip }, () => {
        assert.deepEqual(checkShowcase(ROOT, buildShowcase(ROOT, generator)), []);
    });
});
