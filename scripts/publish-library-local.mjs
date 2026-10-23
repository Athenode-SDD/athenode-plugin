#!/usr/bin/env node
// Publishes the standard plugin into the local development stack of the Athenode monorepo-of-repos
// (`docker compose up` in its root): scripts/publish-library.mjs with the local defaults. See
// README.md, "Plugin library".
//
// Defaults (each one is kept when the variable is already set): ATHENODE_API_URL
// http://localhost:3001/api, ATHENODE_KEYCLOAK_URL http://localhost:8080, ATHENODE_LIBRARY_CLIENT_ID
// athenode-library-publisher and ATHENODE_LIBRARY_CLIENT_SECRET the development secret of that client,
// read at run time from the realm export next to this repository (../keycloak/realm-export.json, or
// ATHENODE_REALM_EXPORT), never stored here.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './library-snapshot.mjs';
import { publishLibrary } from './publish-library.mjs';

export const LOCAL_API_URL = 'http://localhost:3001/api';
export const LOCAL_KEYCLOAK_URL = 'http://localhost:8080';
export const PUBLISHER_CLIENT_ID = 'athenode-library-publisher';

/** The realm export of the sibling `keycloak` repository, unless ATHENODE_REALM_EXPORT names another. */
export function realmExportPath(root, env) {
    return env.ATHENODE_REALM_EXPORT?.trim() || resolve(root, '..', 'keycloak', 'realm-export.json');
}

/** The secret of `clientId` in the realm export at `path`. */
export function clientSecret(path, clientId) {
    if (!existsSync(path)) {
        throw new Error(
            `the Keycloak realm export ${path} is missing: check out the keycloak repository next to this one, `
            + 'or set ATHENODE_REALM_EXPORT or ATHENODE_LIBRARY_CLIENT_SECRET');
    }
    let realm;
    try {
        realm = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        throw new Error(`the Keycloak realm export ${path} is not valid JSON: ${e.message}`);
    }
    const client = (realm.clients ?? []).find((c) => c.clientId === clientId);
    if (!client) {
        throw new Error(`the Keycloak realm export ${path} has no client "${clientId}"`);
    }
    if (typeof client.secret !== 'string' || !client.secret) {
        throw new Error(`the client "${clientId}" in the Keycloak realm export ${path} has no secret`);
    }
    return client.secret;
}

/** `env` with the local stack's defaults for every publish variable it leaves unset. */
export function localEnv({ root = ROOT, env = process.env } = {}) {
    const set = (name) => Boolean(env[name]?.trim());
    const clientId = set('ATHENODE_LIBRARY_CLIENT_ID') ? env.ATHENODE_LIBRARY_CLIENT_ID.trim() : PUBLISHER_CLIENT_ID;
    return {
        ...env,
        ATHENODE_API_URL: set('ATHENODE_API_URL') ? env.ATHENODE_API_URL : LOCAL_API_URL,
        ATHENODE_KEYCLOAK_URL: set('ATHENODE_KEYCLOAK_URL') ? env.ATHENODE_KEYCLOAK_URL : LOCAL_KEYCLOAK_URL,
        ATHENODE_LIBRARY_CLIENT_ID: clientId,
        ATHENODE_LIBRARY_CLIENT_SECRET: set('ATHENODE_LIBRARY_CLIENT_SECRET')
            ? env.ATHENODE_LIBRARY_CLIENT_SECRET
            : clientSecret(realmExportPath(root, env), clientId),
    };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    Promise.resolve()
        .then(() => publishLibrary({ env: localEnv() }))
        .catch((e) => {
            console.error(`Publishing to the local plugin library failed: ${e.message}`);
            process.exitCode = 1;
        });
}
