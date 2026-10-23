import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCAL_API_URL, LOCAL_KEYCLOAK_URL, PUBLISHER_CLIENT_ID, localEnv } from './publish-library-local.mjs';

/** A plugin root `<dir>/athenode-plugin` with `<dir>/keycloak/realm-export.json` holding `realm`. */
function withRealm(realm, run) {
    const dir = mkdtempSync(join(tmpdir(), 'publish-local-'));
    try {
        const root = join(dir, 'athenode-plugin');
        mkdirSync(root);
        if (realm !== undefined) {
            mkdirSync(join(dir, 'keycloak'));
            writeFileSync(join(dir, 'keycloak', 'realm-export.json'),
                typeof realm === 'string' ? realm : JSON.stringify(realm));
        }
        return run(root, dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const REALM = {
    realm: 'athenode',
    clients: [
        { clientId: 'athenode-frontend', publicClient: true },
        { clientId: PUBLISHER_CLIENT_ID, secret: 'dev-secret' },
    ],
};

test('the local defaults point at the compose stack and read the secret from the realm export', () => {
    withRealm(REALM, (root) => {
        const env = localEnv({ root, env: { GITHUB_SHA: 'abc' } });
        assert.equal(env.ATHENODE_API_URL, LOCAL_API_URL);
        assert.equal(env.ATHENODE_KEYCLOAK_URL, LOCAL_KEYCLOAK_URL);
        assert.equal(env.ATHENODE_LIBRARY_CLIENT_ID, PUBLISHER_CLIENT_ID);
        assert.equal(env.ATHENODE_LIBRARY_CLIENT_SECRET, 'dev-secret');
        assert.equal(env.GITHUB_SHA, 'abc');
    });
});

test('variables already set win over the local defaults', () => {
    withRealm(undefined, (root) => {
        const env = localEnv({
            root,
            env: {
                ATHENODE_API_URL: 'http://localhost:4200/api',
                ATHENODE_KEYCLOAK_URL: 'http://keycloak.test',
                ATHENODE_LIBRARY_CLIENT_SECRET: 'given',
            },
        });
        assert.equal(env.ATHENODE_API_URL, 'http://localhost:4200/api');
        assert.equal(env.ATHENODE_KEYCLOAK_URL, 'http://keycloak.test');
        assert.equal(env.ATHENODE_LIBRARY_CLIENT_SECRET, 'given');
    });
});

test('ATHENODE_REALM_EXPORT names another realm export', () => {
    withRealm(undefined, (root, dir) => {
        const path = join(dir, 'other-realm.json');
        writeFileSync(path, JSON.stringify(REALM));
        assert.equal(localEnv({ root, env: { ATHENODE_REALM_EXPORT: path } }).ATHENODE_LIBRARY_CLIENT_SECRET, 'dev-secret');
    });
});

test('a missing realm export, client or secret fails with a clear message', () => {
    withRealm(undefined, (root) => {
        assert.throws(() => localEnv({ root, env: {} }), /realm export .*realm-export\.json is missing/);
    });
    withRealm('{not json', (root) => {
        assert.throws(() => localEnv({ root, env: {} }), /is not valid JSON/);
    });
    withRealm({ clients: [] }, (root) => {
        assert.throws(() => localEnv({ root, env: {} }), /has no client "athenode-library-publisher"/);
    });
    withRealm({ clients: [{ clientId: PUBLISHER_CLIENT_ID }] }, (root) => {
        assert.throws(() => localEnv({ root, env: {} }), /has no secret/);
    });
});
