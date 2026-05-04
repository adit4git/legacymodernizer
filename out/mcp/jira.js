"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JiraMcp = void 0;
/**
 * Thin wrapper that talks to a Jira MCP server.
 * Spec: https://modelcontextprotocol.io
 *
 * The MCP server is expected to expose tools:
 *   - jira.search(jql) -> issues[]
 *   - jira.transition(key, transitionId)
 *   - jira.comment(key, body)
 */
class JiraMcp {
    orch;
    constructor(orch) {
        this.orch = orch;
    }
    endpoint() {
        const ep = this.orch.cfg().get('jira.mcpEndpoint');
        if (!ep)
            throw new Error('Configure modernizer.jira.mcpEndpoint to point at a Jira MCP server.');
        return ep;
    }
    async fetchOpenDefects() {
        const res = await this.callTool('jira.search', {
            jql: 'project = MOD AND issuetype = Bug AND statusCategory != Done ORDER BY priority DESC'
        });
        return (res?.issues || []).map((i) => ({
            key: i.key,
            summary: i.fields?.summary || '',
            description: i.fields?.description || '',
            priority: i.fields?.priority?.name || 'Medium',
            status: i.fields?.status?.name || 'Open'
        }));
    }
    async addComment(key, body) {
        await this.callTool('jira.comment', { key, body });
    }
    async callTool(tool, args) {
        const res = await fetch(this.endpoint(), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
                params: { name: tool, arguments: args } })
        });
        if (!res.ok)
            throw new Error(`Jira MCP ${res.status}: ${await res.text()}`);
        const json = await res.json();
        if (json.error)
            throw new Error(`Jira MCP error: ${json.error.message}`);
        return json.result?.content?.[0]?.json ?? json.result;
    }
}
exports.JiraMcp = JiraMcp;
//# sourceMappingURL=jira.js.map