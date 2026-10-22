import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, SNAPSHOT_ENTRY, buildSnapshot, contentOf, loadLibraryPlugin, readZip, sha256 } from './library-snapshot.mjs';
import { publishLibrary } from './publish-library.mjs';

/** A copy of the repository's plugin layout in a temporary directory, removed after `run`. */
function withCopy(run) {
    const dir = mkdtempSync(join(tmpdir(), 'library-snapshot-'));
    try {
        for (const part of ['skills', 'subagents', 'settings', 'rules', 'mcp.json', 'description.md', 'package.json']) {
            cpSync(join(ROOT, part), join(dir, part), { recursive: true });
        }
        return run(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('the converter reads every skill, subagent, settings file, the rules and the MCP servers', () => {
    const { envelope } = buildSnapshot();
    const skills = readdirSync(join(ROOT, 'skills')).sort();
    const agents = readdirSync(join(ROOT, 'subagents')).map((file) => file.replace(/\.md$/, '')).sort();
    const settings = readdirSync(join(ROOT, 'settings')).map((file) => `settings/${file}`).sort();
    const servers = Object.keys(JSON.parse(readFileSync(join(ROOT, 'mcp.json'), 'utf8')).mcpServers).sort();

    assert.equal(envelope.format, 'athenode-library-snapshot');
    assert.equal(envelope.snapshotFormatVersion, 1);
    assert.deepEqual(envelope.entry.name, 'Athenode');
    assert.equal(envelope.entry.category, 'programming');
    assert.equal(envelope.entry.pluginName, 'atn');
    assert.ok(envelope.entry.description.length > 0);
    assert.deepEqual(envelope.attributions, []);
    assert.equal(envelope.plugin.formatVersion, 1);
    assert.equal(envelope.plugin.slug, 'atn');
    assert.ok(envelope.plugin.rules.includes('### MCP'));
    assert.deepEqual(envelope.plugin.skills.map((s) => s.name), skills);
    assert.deepEqual(envelope.plugin.agents.map((a) => a.name), agents);
    assert.deepEqual(envelope.plugin.mcpServers.map((s) => s.name), servers);
    assert.deepEqual(envelope.plugin.files.map((f) => f.path), ['settings', ...settings]);
    for (const file of envelope.plugin.files.filter((f) => f.kind === 'file')) {
        assert.ok(file.summary, `${file.path} has a summary`);
        assert.ok(!file.content.startsWith('---'), `${file.path} has no frontmatter left`);
    }
    for (const item of [...envelope.plugin.skills, ...envelope.plugin.agents]) {
        assert.equal(item.metadata.name, undefined, `${item.name}'s metadata has no name`);
        assert.ok(item.metadata.description);
    }
});

test('a skill carries its bundle files, and every blob matches its sha256', () => {
    withCopy((dir) => {
        const skill = readdirSync(join(dir, 'skills'))[0];
        mkdirSync(join(dir, 'skills', skill, 'scripts'));
        writeFileSync(join(dir, 'skills', skill, 'scripts', 'run.sh'), '#!/bin/sh\necho hi\n');
        chmodSync(join(dir, 'skills', skill, 'scripts', 'run.sh'), 0o755);
        writeFileSync(join(dir, 'skills', skill, 'logo.bin'), Buffer.from([0, 1, 2, 255]));

        const { envelope, archive } = buildSnapshot(dir);

        const files = envelope.plugin.skills.find((s) => s.name === skill).files;
        assert.deepEqual(files.map((f) => [f.path, f.mode, f.isText]),
            [['logo.bin', '0644', false], ['scripts/run.sh', '0755', true]]);
        const entries = readZip(archive);
        assert.deepEqual([...entries.keys()].filter((name) => name.startsWith('blobs/')).sort(),
            files.map((f) => `blobs/${f.sha256}`).sort());
        for (const [name, bytes] of entries) {
            if (name.startsWith('blobs/')) {
                assert.equal(sha256(bytes), name.slice('blobs/'.length));
            }
        }
        for (const file of files) {
            assert.equal(entries.get(`blobs/${file.sha256}`).length, file.size);
        }
    });
});

test('the archive is deterministic and holds the envelope first', () => {
    const first = buildSnapshot();
    const second = buildSnapshot();

    assert.ok(first.archive.equals(second.archive));
    const entries = readZip(first.archive);
    assert.equal([...entries.keys()][0], SNAPSHOT_ENTRY);
    assert.deepEqual(JSON.parse(entries.get(SNAPSHOT_ENTRY).toString('utf8')), first.envelope);
});

test('the converter fails on a malformed mcp.json', () => {
    withCopy((dir) => {
        writeFileSync(join(dir, 'mcp.json'), '{"mcpServers": ');
        assert.throws(() => loadLibraryPlugin(dir), /mcp\.json is not valid JSON/);
        writeFileSync(join(dir, 'mcp.json'), '{"mcpServers": {"x": {"type": "ftp"}}}');
        assert.throws(() => loadLibraryPlugin(dir), /type must be stdio, http or sse/);
        writeFileSync(join(dir, 'mcp.json'), '{"mcpServers": {"x": {"type": "stdio", "command": "npx", "env": {"A": 1}}}}');
        assert.throws(() => loadLibraryPlugin(dir), /env must map names to strings/);
    });
});

test('the content comparison ignores what the server adds', () => {
    const { envelope } = buildSnapshot();
    const served = structuredClone(envelope);
    served.plugin.id = '00000000-0000-4000-8000-000000000001';
    served.plugin.digest = 'sha256:abc';
    served.plugin.agents.forEach((agent) => {
        agent.slug = agent.name;
    });
    served.plugin.skills.forEach((skill) => {
        skill.slug = skill.name;
    });

    assert.equal(contentOf(served), contentOf(envelope));
    served.plugin.agents[0].content += '\nChanged';
    assert.notEqual(contentOf(served), contentOf(envelope));
});

// ---- publish-library.mjs against a mocked fetch ----

const ENV = {
    ATHENODE_API_URL: 'https://api.example/api/',
    ATHENODE_KEYCLOAK_URL: 'https://auth.example',
    ATHENODE_LIBRARY_CLIENT_ID: 'athenode-library-publisher',
    ATHENODE_LIBRARY_CLIENT_SECRET: 's3cret',
    ATHENODE_STANDARD_ENTRY_SLUG: 'athenode',
    GITHUB_SHA: 'abc123',
};

function mockFetch(current) {
    const calls = [];
    const fetch = async (url, options = {}) => {
        calls.push({ url, options });
        if (url.endsWith('/public/library/entries/athenode/snapshot')) {
            if (!current) {
                return new Response('not found', { status: 404 });
            }
            return new Response(current, { status: 200, headers: { ETag: '"sha256:current"' } });
        }
        if (url.endsWith('/protocol/openid-connect/token')) {
            return Response.json({ access_token: 'ci-token' });
        }
        if (url.includes('/library/entries/athenode/snapshots')) {
            return Response.json({ version: 7, digest: 'sha256:new' });
        }
        return new Response('unexpected', { status: 500 });
    };
    return { fetch, calls };
}

test('an unchanged digest is skipped without a token or an upload', async () => {
    const { archive } = buildSnapshot();
    const { fetch, calls } = mockFetch(archive);

    const result = await publishLibrary({ env: ENV, fetch, log: () => {} });

    assert.deepEqual(result, { action: 'skipped' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers['X-Athenode-Cli-Version'],
        JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).devDependencies['@athenode/cli']);
});

test('changed content is uploaded with a client-credentials token and the commit as the note', async () => {
    const { envelope } = buildSnapshot();
    const changed = structuredClone(envelope);
    changed.plugin.agents[0].content = 'An older body';
    const { writeZip } = await import('./library-snapshot.mjs');
    const { fetch, calls } = mockFetch(writeZip([[SNAPSHOT_ENTRY, Buffer.from(JSON.stringify(changed))]]));

    const result = await publishLibrary({ env: ENV, fetch, log: () => {} });

    assert.deepEqual(result, { action: 'uploaded', version: 7, digest: 'sha256:new' });
    const token = calls.find((call) => call.url.endsWith('/token'));
    assert.equal(token.url, 'https://auth.example/realms/athenode/protocol/openid-connect/token');
    const form = new URLSearchParams(token.options.body);
    assert.equal(form.get('grant_type'), 'client_credentials');
    assert.equal(form.get('client_id'), 'athenode-library-publisher');
    assert.equal(form.get('client_secret'), 's3cret');
    const upload = calls.find((call) => call.url.includes('/snapshots'));
    assert.equal(upload.url, 'https://api.example/api/library/entries/athenode/snapshots?note=athenode-plugin+abc123');
    assert.equal(upload.options.method, 'POST');
    assert.equal(upload.options.headers.Authorization, 'Bearer ci-token');
    assert.equal(upload.options.headers['Content-Type'], 'application/zip');
    assert.ok(Buffer.from(upload.options.body).equals(buildSnapshot().archive));
});

test('without a current snapshot the archive is uploaded', async () => {
    const { fetch, calls } = mockFetch(null);

    const result = await publishLibrary({ env: ENV, fetch, log: () => {} });

    assert.equal(result.action, 'uploaded');
    assert.equal(calls.length, 3);
});

test('a missing setting or a refused upload fails', async () => {
    await assert.rejects(publishLibrary({ env: { ...ENV, ATHENODE_API_URL: '' }, fetch: async () => null, log: () => {} }),
        /ATHENODE_API_URL is not set/);
    const failing = async (url) => (url.includes('/snapshots')
        ? new Response('forbidden', { status: 403 })
        : url.endsWith('/token') ? Response.json({ access_token: 't' }) : new Response('', { status: 404 }));
    await assert.rejects(publishLibrary({ env: ENV, fetch: failing, log: () => {} }), /the upload answered 403/);
});
