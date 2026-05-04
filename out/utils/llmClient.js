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
exports.makeLlmClient = makeLlmClient;
const vscode = __importStar(require("vscode"));
function makeLlmClient(cfg, selection) {
    const provider = selection?.provider || cfg.get('modelProvider') || 'vscode-copilot';
    if (provider === 'vscode-copilot')
        return new VsCodeCopilotClient(cfg, selection?.model);
    if (provider === 'claude-sonnet')
        return new ClaudeSonnetClient(cfg, selection?.model);
    return new OpenAiCodexClient(cfg, selection?.model);
}
// ---------- VS Code Language Model API (uses the user's Copilot subscription) ----------
class VsCodeCopilotClient {
    family;
    constructor(cfg, familyOverride) {
        this.family = familyOverride || cfg.get('copilotModelFamily') || 'gpt-4o';
    }
    name() { return `vscode-copilot:${this.family}`; }
    async complete(args) {
        // Pick a model. First try the requested family; fall back to any Copilot model.
        let models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: this.family });
        if (models.length === 0) {
            models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        }
        if (models.length === 0) {
            throw new Error('No Copilot language models available. Install GitHub Copilot + Copilot Chat, sign in, ' +
                'and run a Copilot Chat message once to grant consent.');
        }
        const model = models[0];
        // Build the message list. VS Code's LanguageModelChatMessage has only User/Assistant roles,
        // so we fold the system prompt into the first user message.
        const messages = [];
        messages.push(vscode.LanguageModelChatMessage.User(`SYSTEM:\n${args.system}`));
        for (const m of args.messages) {
            const content = stringifyMessageContent(m.content);
            if (m.role === 'user')
                messages.push(vscode.LanguageModelChatMessage.User(content));
            else
                messages.push(vscode.LanguageModelChatMessage.Assistant(content));
        }
        // Translate tool schemas into VS Code's tool definitions.
        const tools = (args.tools || []).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.input_schema
        }));
        const cancel = new vscode.CancellationTokenSource();
        let response;
        try {
            response = await model.sendRequest(messages, { tools, justification: 'Legacy Modernizer is converting your code.' }, cancel.token);
        }
        catch (err) {
            if (err instanceof vscode.LanguageModelError) {
                throw new Error(`VS Code LM error (${err.code}): ${err.message}`);
            }
            throw err;
        }
        // Drain the stream, collecting both text and tool calls.
        let text = '';
        const toolCalls = [];
        for await (const part of response.stream) {
            if (part instanceof vscode.LanguageModelTextPart) {
                text += part.value;
            }
            else if (part instanceof vscode.LanguageModelToolCallPart) {
                toolCalls.push({
                    id: part.callId,
                    name: part.name,
                    input: part.input
                });
            }
            // Some VS Code versions emit other part types; ignore unknowns gracefully.
        }
        return { text, toolCalls };
    }
}
// ---------- Claude Sonnet (direct Anthropic API) ----------
class ClaudeSonnetClient {
    apiKey;
    model;
    maxTokens;
    retryAttempts;
    retryBaseMs;
    constructor(cfg, modelOverride) {
        this.apiKey = cfg.get('anthropicApiKey') || process.env.ANTHROPIC_API_KEY || '';
        this.model = modelOverride || cfg.get('anthropicModel') || 'claude-sonnet-4-6';
        this.maxTokens = Math.max(256, cfg.get('anthropicMaxTokens', 8192));
        this.retryAttempts = Math.max(1, cfg.get('anthropicRetryAttempts', 4));
        this.retryBaseMs = Math.max(250, cfg.get('anthropicRetryBaseMs', 1500));
        if (!this.apiKey)
            throw new Error('Anthropic API key not configured (modernizer.anthropicApiKey).');
    }
    name() { return `anthropic:${this.model}`; }
    async complete(args) {
        const body = {
            model: this.model,
            max_tokens: this.maxTokens,
            system: args.system,
            tools: (args.tools || []).map(t => ({
                name: t.name, description: t.description, input_schema: t.input_schema
            })),
            messages: args.messages.map(m => ({ role: m.role, content: m.content }))
        };
        let res;
        let lastErrText = '';
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            if (res.ok)
                break;
            lastErrText = await res.text();
            const retryable = res.status === 429 || res.status === 529;
            if (!retryable || attempt >= this.retryAttempts) {
                const retryAfter = res.headers.get('retry-after');
                const retryHint = retryAfter ? ` retry-after=${retryAfter}` : '';
                throw new Error(`Anthropic ${res.status}:${retryHint} ${lastErrText}`);
            }
            const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
            const backoffMs = retryAfterMs ?? Math.round(this.retryBaseMs * Math.pow(2, attempt - 1));
            const jitterMs = Math.floor(Math.random() * 400);
            await sleep(backoffMs + jitterMs);
        }
        if (!res || !res.ok)
            throw new Error(`Anthropic request failed after retries: ${lastErrText}`);
        const data = await res.json();
        const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        const toolCalls = (data.content || [])
            .filter((c) => c.type === 'tool_use')
            .map((c) => ({ id: c.id, name: c.name, input: c.input }));
        return { text, toolCalls, rawContent: data.content || [] };
    }
}
// ---------- OpenAI (Codex / GPT) ----------
class OpenAiCodexClient {
    apiKey;
    model;
    constructor(cfg, modelOverride) {
        this.apiKey = cfg.get('openaiApiKey') || process.env.OPENAI_API_KEY || '';
        this.model = modelOverride || cfg.get('openaiModel') || 'gpt-4.1';
        if (!this.apiKey)
            throw new Error('OpenAI API key not configured (modernizer.openaiApiKey).');
    }
    name() { return `openai:${this.model}`; }
    async complete(args) {
        const tools = (args.tools || []).map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.input_schema }
        }));
        const body = {
            model: this.model,
            messages: [
                { role: 'system', content: args.system },
                ...args.messages.map(m => ({ role: m.role, content: stringifyMessageContent(m.content) }))
            ],
            tools,
            tool_choice: 'auto'
        };
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok)
            throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const choice = data.choices?.[0]?.message;
        const text = choice?.content || '';
        const toolCalls = (choice?.tool_calls || []).map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            input: safeJson(tc.function.arguments)
        }));
        return { text, toolCalls };
    }
}
function safeJson(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return {};
    }
}
function stringifyMessageContent(content) {
    if (typeof content === 'string')
        return content;
    try {
        return JSON.stringify(content);
    }
    catch {
        return '[unserializable content]';
    }
}
function parseRetryAfterMs(retryAfter) {
    if (!retryAfter)
        return undefined;
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0)
        return Math.round(seconds * 1000);
    const when = Date.parse(retryAfter);
    if (Number.isFinite(when))
        return Math.max(0, when - Date.now());
    return undefined;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=llmClient.js.map