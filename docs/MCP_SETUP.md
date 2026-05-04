# MCP Setup — Jira & Bitbucket

This extension talks to Jira and Bitbucket through **MCP servers** (Model Context Protocol, https://modelcontextprotocol.io). You bring your own MCP servers; the extension only needs their HTTP endpoints.

## Why MCP and not a direct REST integration?
- One auth/credentials surface (the MCP server) instead of leaking PATs into the IDE.
- Your security team controls which Jira projects and Bitbucket repos are reachable.
- The same MCP servers are reusable by other agents in your org.

## Required tools (each MCP server must expose)

### Jira MCP server
| Tool name        | Args                                  | Returns                       |
|------------------|---------------------------------------|-------------------------------|
| `jira.search`    | `{ jql: string }`                     | `{ issues: [...] }` (Jira REST shape) |
| `jira.transition`| `{ key: string, transitionId: string }` | `{ ok: true }`               |
| `jira.comment`   | `{ key: string, body: string }`       | `{ id: string }`              |

### Bitbucket MCP server
| Tool name                     | Args                                                                 | Returns               |
|-------------------------------|----------------------------------------------------------------------|-----------------------|
| `bitbucket.createBranch`      | `{ repo: string, branch: string, fromRef: string }`                  | `{ ok: true }`        |
| `bitbucket.openPullRequest`   | `{ source, target, title, description }`                             | `{ url: string, id }` |
| `bitbucket.commentOnPr`       | `{ prId: number, body: string }`                                     | `{ id: string }`      |

The extension uses standard MCP `tools/call` JSON-RPC:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "jira.search", "arguments": { "jql": "..." } }
}
```

## Configure
Settings → Modernizer:
- `modernizer.jira.mcpEndpoint` = `https://mcp.your-org.com/jira`
- `modernizer.bitbucket.mcpEndpoint` = `https://mcp.your-org.com/bitbucket`

## Local dev MCP servers
For testing, you can stand up minimal servers with `@modelcontextprotocol/sdk`:
```ts
// jira-mcp.ts (sketch)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
const srv = new Server({ name: "jira", version: "0.1" }, { capabilities: { tools: {} } });
srv.setRequestHandler("tools/call", async (req) => {
  if (req.params.name === "jira.search") {
    const issues = await myJiraClient.searchByJql(req.params.arguments.jql);
    return { content: [{ type: "json", json: { issues } }] };
  }
});
```

## Auth flow
1. Your MCP server authenticates to Jira/Bitbucket using a service account or OAuth app.
2. The extension authenticates **to your MCP server** (e.g., bearer token in front-door proxy). Add that to your settings as part of the endpoint URL or via your corporate proxy — the current scaffold sends no auth header by default; extend `src/mcp/jira.ts` and `src/mcp/bitbucket.ts` to include whatever your gateway requires.
