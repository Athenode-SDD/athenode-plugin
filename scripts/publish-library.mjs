#!/usr/bin/env node
// Publishes the standard plugin in this repository as the next version of its entry in Athenode's
// plugin library (scripts/library-snapshot.mjs builds the archive). Run by the "Publish to the plugin
// library" workflow on every push to main; see README.md, "Plugin library".
//
// 1. Builds the snapshot archive.
// 2. Downloads the entry's current snapshot from the public library API and compares the content
//    (the server's digest is opaque, so the content itself is compared, without what the server adds:
//    ids, digests, item slugs, text flags). Unchanged content uploads nothing.
// 3. Otherwise gets a client-credentials token of the repository publisher client from Keycloak and
//    uploads the archive as the entry's next version, with the commit as the version note.
//
// Environment: ATHENODE_API_URL (the backend's API base, e.g. https://platform.athenode.com/api),
// ATHENODE_KEYCLOAK_URL (e.g. https://auth.athenode.com), ATHENODE_LIBRARY_CLIENT_ID,
// ATHENODE_LIBRARY_CLIENT_SECRET, ATHENODE_STANDARD_ENTRY_SLUG (default "athenode"), and optionally
// ATHENODE_KEYCLOAK_REALM (default "athenode"), ATHENODE_CLI_VERSION (the CLI version the public API
// is asked as; default the pinned @athenode/cli) and GITHUB_SHA (the version note).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, SNAPSHOT_ENTRY, buildSnapshot, contentOf, readZip } from './library-snapshot.mjs';

const CLI_VERSION_HEADER = 'X-Athenode-Cli-Version';

function required(env, name) {
    const value = env[name];
    if (!value || !value.trim()) {
        throw new Error(`${name} is not set`);
    }
    return value.trim().replace(/\/+$/, '');
}

function pinnedCliVersion(root) {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return pkg.devDependencies?.['@athenode/cli'] ?? '0.0.0';
}

/** The content of the entry's current snapshot, or null when the library has none to compare with. */
async function currentContent({ fetch, api, slug, cliVersion, log }) {
    const response = await fetch(`${api}/public/library/entries/${encodeURIComponent(slug)}/snapshot`, {
        headers: { [CLI_VERSION_HEADER]: cliVersion },
    });
    if (response.status === 404) {
        log(`The library shows no snapshot of "${slug}" yet.`);
        return null;
    }
    if (!response.ok) {
        throw new Error(`GET the current snapshot of "${slug}" answered ${response.status}`);
    }
    const entries = readZip(Buffer.from(await response.arrayBuffer()));
    const json = entries.get(SNAPSHOT_ENTRY);
    if (!json) {
        throw new Error(`the current snapshot of "${slug}" holds no ${SNAPSHOT_ENTRY}`);
    }
    return { content: contentOf(JSON.parse(json.toString('utf8'))), etag: response.headers.get('etag') };
}

async function clientCredentialsToken({ fetch, env }) {
    const keycloak = required(env, 'ATHENODE_KEYCLOAK_URL');
    const realm = env.ATHENODE_KEYCLOAK_REALM?.trim() || 'athenode';
    const response = await fetch(`${keycloak}/realms/${realm}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: required(env, 'ATHENODE_LIBRARY_CLIENT_ID'),
            client_secret: required(env, 'ATHENODE_LIBRARY_CLIENT_SECRET'),
        }).toString(),
    });
    if (!response.ok) {
        throw new Error(`the token request answered ${response.status}`);
    }
    const token = (await response.json()).access_token;
    if (!token) {
        throw new Error('the token response holds no access_token');
    }
    return token;
}

/**
 * Publishes the standard plugin under `root` unless the library already has its content.
 *
 * @returns {{action: 'skipped'|'uploaded', version?: number, digest?: string}}
 */
export async function publishLibrary({ root = ROOT, env = process.env, fetch = globalThis.fetch, log = console.log } = {}) {
    const api = required(env, 'ATHENODE_API_URL');
    const slug = env.ATHENODE_STANDARD_ENTRY_SLUG?.trim() || 'athenode';
    const cliVersion = env.ATHENODE_CLI_VERSION?.trim() || pinnedCliVersion(root);
    const snapshot = buildSnapshot(root);

    const current = await currentContent({ fetch, api, slug, cliVersion, log });
    if (current && current.content === contentOf(snapshot.envelope)) {
        log(`The library's current snapshot of "${slug}" (${current.etag ?? 'no ETag'}) has this content: nothing to publish.`);
        return { action: 'skipped' };
    }

    const token = await clientCredentialsToken({ fetch, env });
    const note = env.GITHUB_SHA?.trim() ? `athenode-plugin ${env.GITHUB_SHA.trim()}` : null;
    const url = new URL(`${api}/library/entries/${encodeURIComponent(slug)}/snapshots`);
    if (note) {
        url.searchParams.set('note', note);
    }
    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' },
        body: snapshot.archive,
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`the upload answered ${response.status}: ${text}`);
    }
    const published = await response.json();
    log(`Published version ${published.version} of "${slug}" (${published.digest}).`);
    return { action: 'uploaded', version: published.version, digest: published.digest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    publishLibrary().catch((e) => {
        console.error(`::error::Publishing to the plugin library failed: ${e.message}`);
        process.exitCode = 1;
    });
}
