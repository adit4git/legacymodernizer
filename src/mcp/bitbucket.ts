import * as cp from 'child_process';
import { Orchestrator } from '../orchestrator/orchestrator';

/**
 * Bitbucket MCP server exposes tools:
 *   - bitbucket.createBranch(repo, branch, fromRef)
 *   - bitbucket.openPullRequest(repo, source, target, title, description)
 *   - bitbucket.commentOnPr(prId, body)
 *
 * The class also runs local git commit + push using the workspace's git.
 */
export class BitbucketMcp {
  constructor(private orch: Orchestrator) {}

  private endpoint() {
    const ep = this.orch.cfg().get<string>('bitbucket.mcpEndpoint');
    if (!ep) throw new Error('Configure modernizer.bitbucket.mcpEndpoint.');
    return ep;
  }

  async openPullRequest(opts: { branch: string; title: string; description: string }): Promise<string> {
    const target = this.orch.targetRoot();

    // 1. Create branch + commit + push locally
    sh(target, 'git', ['checkout', '-B', opts.branch]);
    sh(target, 'git', ['add', '.']);
    try { sh(target, 'git', ['commit', '-m', opts.title]); } catch { /* nothing to commit */ }
    sh(target, 'git', ['push', '-u', 'origin', opts.branch]);

    // 2. Ask MCP server to open the PR
    const result = await this.callTool('bitbucket.openPullRequest', {
      source: opts.branch,
      target: 'main',
      title: opts.title,
      description: opts.description
    });
    return result?.url || result?.html_url || '(PR created)';
  }

  private async callTool(tool: string, args: any): Promise<any> {
    const res = await fetch(this.endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
        params: { name: tool, arguments: args } })
    });
    if (!res.ok) throw new Error(`Bitbucket MCP ${res.status}: ${await res.text()}`);
    const json: any = await res.json();
    if (json.error) throw new Error(`Bitbucket MCP error: ${json.error.message}`);
    return json.result?.content?.[0]?.json ?? json.result;
  }
}

function sh(cwd: string, cmd: string, args: string[]): string {
  const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}
