"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitbucketMcp = void 0;
const cp = __importStar(require("child_process"));
/**
 * Bitbucket MCP server exposes tools:
 *   - bitbucket.createBranch(repo, branch, fromRef)
 *   - bitbucket.openPullRequest(repo, source, target, title, description)
 *   - bitbucket.commentOnPr(prId, body)
 *
 * The class also runs local git commit + push using the workspace's git.
 */
class BitbucketMcp {
    orch;
    constructor(orch) {
        this.orch = orch;
    }
    endpoint() {
        const ep = this.orch.cfg().get('bitbucket.mcpEndpoint');
        if (!ep)
            throw new Error('Configure modernizer.bitbucket.mcpEndpoint.');
        return ep;
    }
    async openPullRequest(opts) {
        const target = this.orch.targetRoot();
        // 1. Create branch + commit + push locally
        sh(target, 'git', ['checkout', '-B', opts.branch]);
        sh(target, 'git', ['add', '.']);
        try {
            sh(target, 'git', ['commit', '-m', opts.title]);
        }
        catch { /* nothing to commit */ }
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
    async callTool(tool, args) {
        const res = await fetch(this.endpoint(), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
                params: { name: tool, arguments: args } })
        });
        if (!res.ok)
            throw new Error(`Bitbucket MCP ${res.status}: ${await res.text()}`);
        const json = await res.json();
        if (json.error)
            throw new Error(`Bitbucket MCP error: ${json.error.message}`);
        return json.result?.content?.[0]?.json ?? json.result;
    }
}
exports.BitbucketMcp = BitbucketMcp;
function sh(cwd, cmd, args) {
    const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8' });
    if (r.status !== 0)
        throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
}
//# sourceMappingURL=bitbucket.js.map