// Finds the names that @athenode/cli 0.10.7 and the backend renamed from "setup" to "plugin" in the
// texts of this repository: the old MCP tools and parameters, the old CLI flags, the old error codes
// and the repository's old name.
// validate.mjs runs it over the skills, the agents, the rules, the settings and the docs.

/** The old names, each with what to write instead. */
const LEGACY = [
    { pattern: /\bsetups_[a-z_]+/g, instead: 'the plugins_ tool' },
    { pattern: /\bsetupById\b/g, instead: 'pluginById' },
    { pattern: /\bsetupId\b/g, instead: 'pluginId' },
    { pattern: /"setup"/g, instead: '"plugin"' },
    { pattern: /--setup(?:-by-id|-id)?(?![\w-])/g, instead: 'the --plugin flags' },
    { pattern: /\bathenode-setup\b/g, instead: 'athenode-plugin' },
    { pattern: /\bsetup_slug_[a-z_*]+/g, instead: 'the plugin_slug_ code' },
    { pattern: /\bsetup_name_conflict\b/g, instead: 'plugin_name_conflict' },
    { pattern: /\bsetup_mcp_server\b/g, instead: 'plugin_mcp_server' },
];

/**
 * What stays: GitHub's `actions/setup-node` and the local clone's directory, which keeps its old
 * name until it is moved (always written as a path in backticks).
 */
const ALLOWED = [/actions\/setup-node/g, /`athenode-setup\/`/g];

/** The old names in `text`, as `{line, term, instead}`, in order. Empty when the text has none. */
export function findLegacyTerms(text) {
    const found = [];
    text.split('\n').forEach((raw, index) => {
        const line = ALLOWED.reduce((rest, allowed) => rest.replace(allowed, (match) => ' '.repeat(match.length)), raw);
        const hits = [];
        for (const { pattern, instead } of LEGACY) {
            for (const match of line.matchAll(pattern)) {
                hits.push({ column: match.index, line: index + 1, term: match[0], instead });
            }
        }
        hits.sort((a, b) => a.column - b.column);
        found.push(...hits.map(({ line: number, term, instead }) => ({ line: number, term, instead })));
    });
    return found;
}

/** The files validate.mjs checks: everything under these directories, and these files. */
export const CHECKED_DIRS = ['skills', 'subagents', 'rules', 'settings', 'docs'];
export const CHECKED_FILES = ['description.md', 'README.md'];
