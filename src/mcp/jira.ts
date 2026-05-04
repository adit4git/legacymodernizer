import { Orchestrator } from '../orchestrator/orchestrator';

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
}

/**
 * Thin wrapper that talks to a Jira MCP server.
 * Spec: https://modelcontextprotocol.io
 *
 * The MCP server is expected to expose tools:
 *   - jira.search(jql) -> issues[]
 *   - jira.transition(key, transitionId)
 *   - jira.comment(key, body)
 */
export class JiraMcp {
  constructor(private orch: Orchestrator) {}

  private endpoint() {
    const ep = this.orch.cfg().get<string>('jira.mcpEndpoint');
    if (!ep) throw new Error('Configure modernizer.jira.mcpEndpoint to point at a Jira MCP server.');
    return ep;
  }

  async fetchOpenDefects(): Promise<JiraIssue[]> {
    const res = await this.callTool('jira.search', {
      jql: 'project = MOD AND issuetype = Bug AND statusCategory != Done ORDER BY priority DESC'
    });
    return (res?.issues || []).map((i: any) => ({
      key: i.key,
      summary: i.fields?.summary || '',
      description: i.fields?.description || '',
      priority: i.fields?.priority?.name || 'Medium',
      status: i.fields?.status?.name || 'Open'
    }));
  }

  async addComment(key: string, body: string): Promise<void> {
    await this.callTool('jira.comment', { key, body });
  }

  private async callTool(tool: string, args: any): Promise<any> {
    const res = await fetch(this.endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
        params: { name: tool, arguments: args } })
    });
    if (!res.ok) throw new Error(`Jira MCP ${res.status}: ${await res.text()}`);
    const json: any = await res.json();
    if (json.error) throw new Error(`Jira MCP error: ${json.error.message}`);
    return json.result?.content?.[0]?.json ?? json.result;
  }
}
