import * as vscode from 'vscode';
import { Orchestrator } from '../orchestrator/orchestrator';

/**
 * Click-only menu rendered in the Activity Bar.
 * Goal: zero typing for the user beyond picking folders.
 */
export class ModernizerMenuProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly orchestrator: Orchestrator
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.html();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        switch (msg.command) {
          case 'pickLegacy': {
            const uri = await vscode.window.showOpenDialog({
              canSelectFolders: true,
              canSelectFiles: false,
              openLabel: 'Select Legacy .NET Codebase'
            });
            if (uri?.[0]) {
              await vscode.workspace
                .getConfiguration('modernizer')
                .update('legacyRoot', uri[0].fsPath, vscode.ConfigurationTarget.Global);
              webviewView.webview.postMessage({ type: 'set', key: 'legacyRoot', value: uri[0].fsPath });
            }
            break;
          }
          case 'pickTarget': {
            const uri = await vscode.window.showOpenDialog({
              canSelectFolders: true,
              canSelectFiles: false,
              openLabel: 'Select Target Output Folder'
            });
            if (uri?.[0]) {
              await vscode.workspace
                .getConfiguration('modernizer')
                .update('targetRoot', uri[0].fsPath, vscode.ConfigurationTarget.Global);
              webviewView.webview.postMessage({ type: 'set', key: 'targetRoot', value: uri[0].fsPath });
            }
            break;
          }
          case 'pickArchFile': {
            const uri = await vscode.window.showOpenDialog({
              canSelectFiles: true,
              canSelectFolders: false,
              filters: { Markdown: ['md'] },
              openLabel: 'Select Target Architecture / Best Practices Markdown'
            });
            if (uri?.[0]) {
              await vscode.workspace
                .getConfiguration('modernizer')
                .update('targetArchitectureFile', uri[0].fsPath, vscode.ConfigurationTarget.Global);
              webviewView.webview.postMessage({ type: 'set', key: 'archFile', value: uri[0].fsPath });
            }
            break;
          }
          case 'setUi':
            await vscode.workspace
              .getConfiguration('modernizer')
              .update('targetUiFramework', msg.value, vscode.ConfigurationTarget.Global);
            break;
          case 'setModel':
            await vscode.workspace
              .getConfiguration('modernizer')
              .update('modelProvider', msg.value, vscode.ConfigurationTarget.Global);
            break;
          case 'runCommand':
            await vscode.commands.executeCommand(msg.id);
            break;
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Modernizer: ${err.message}`);
      }
    });
  }

  private html(): string {
    const cfg = vscode.workspace.getConfiguration('modernizer');
    const legacy = cfg.get<string>('legacyRoot') || '(not set)';
    const target = cfg.get<string>('targetRoot') || '(not set)';
    const arch = cfg.get<string>('targetArchitectureFile') || '(not set)';
    const ui = cfg.get<string>('targetUiFramework') || 'react';
    const model = cfg.get<string>('modelProvider') || 'vscode-copilot';

    return /* html */ `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); padding: 12px; color: var(--vscode-foreground); }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-top: 18px; opacity: .8; }
  .row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; padding: 6px 10px; border-radius: 3px; cursor: pointer;
    width: 100%; text-align: left;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.gate { background: #b5651d; color: white; }
  button.run  { background: #2d7a2d; color: white; }
  .kv { font-size: 11px; opacity: .75; word-break: break-all; padding-left: 4px; }
  select { width: 100%; padding: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
  hr { border-color: var(--vscode-panel-border); }
</style>
</head>
<body>
  <h2>1. Setup</h2>
  <div class="row"><button onclick="m('pickLegacy')">📂 Pick Legacy .NET Codebase</button></div>
  <div class="kv" id="legacyRoot">${legacy}</div>

  <div class="row"><button onclick="m('pickTarget')">📂 Pick Target Output Folder</button></div>
  <div class="kv" id="targetRoot">${target}</div>

  <div class="row"><button onclick="m('pickArchFile')">📐 Pick Target Architecture .md</button></div>
  <div class="kv" id="archFile">${arch}</div>

  <div class="row">
    <select onchange="m('setUi', this.value)">
      <option value="react" ${ui === 'react' ? 'selected' : ''}>UI Target: React (TypeScript)</option>
      <option value="angular" ${ui === 'angular' ? 'selected' : ''}>UI Target: Angular (TypeScript)</option>
    </select>
  </div>
  <div class="row">
  <select onchange="m('setModel', this.value)">
    <option value="vscode-copilot" ${model === 'vscode-copilot' ? 'selected' : ''}>Model: VS Code Copilot (cheapest)</option>
    <option value="claude-sonnet"  ${model === 'claude-sonnet'  ? 'selected' : ''}>Model: Claude Sonnet (Anthropic API)</option>
    <option value="openai-codex"   ${model === 'openai-codex'   ? 'selected' : ''}>Model: OpenAI / Codex</option>
  </select>
</div>

  <hr>
  <h2>2. Pipeline (click in order)</h2>
  <div class="row"><button class="run" onclick="run('modernizer.runFullPipeline')">🚀 Run Full Pipeline</button></div>
  <div class="row"><button onclick="run('modernizer.step1.analyze')">① Analyze Legacy Codebase</button></div>
  <div class="row"><button onclick="run('modernizer.step2.generateDocs')">② Generate Legacy Documentation (requires ①)</button></div>
  <div class="row"><button class="gate" onclick="run('modernizer.step3.reviewDocs')">⛔ HUMAN GATE: Review Docs (requires ②)</button></div>
  <div class="row"><button onclick="run('modernizer.step4.convertApi')">④ Convert .NET API → Spring Boot (requires ③)</button></div>
  <div class="row"><button onclick="run('modernizer.step5.convertUi')">⑤ Convert ASP.NET Web → SPA (requires ③)</button></div>
  <div class="row"><button class="gate" onclick="run('modernizer.step6.reviewCode')">⛔ HUMAN GATE: Review Generated Code (requires ④ + ⑤)</button></div>
  <div class="row"><button onclick="run('modernizer.step7.generateTests')">⑦ Generate Unit & Integration Tests (requires ⑥)</button></div>
  <div class="row"><button onclick="run('modernizer.step8.generateCicd')">⑧ Generate OpenShift CI/CD Manifests (requires ⑦)</button></div>
  <div class="row"><button class="gate" onclick="run('modernizer.step9.reviewCicd')">⛔ HUMAN GATE: Review CI/CD (requires ⑧)</button></div>

  <hr>
  <h2>3. Defect Loop (Jira + Bitbucket via MCP)</h2>
  <div class="row"><button onclick="run('modernizer.defects.fetchJira')">🐛 Fetch Jira Defects</button></div>
  <div class="row"><button onclick="run('modernizer.defects.resolve')">🔧 Resolve Defect → Bitbucket PR</button></div>

  <hr>
  <h2>4. Utilities</h2>
  <div class="row"><button onclick="run('modernizer.loadSampleLegacy')">📦 Load Bundled Sample Legacy Code</button></div>

<script>
  const vscode = acquireVsCodeApi();
  function m(command, value) { vscode.postMessage({ command, value }); }
  function run(id) { vscode.postMessage({ command: 'runCommand', id }); }
  window.addEventListener('message', (e) => {
    const { type, key, value } = e.data || {};
    if (type === 'set' && key && document.getElementById(key)) {
      document.getElementById(key).textContent = value;
    }
  });
</script>
</body>
</html>`;
  }
}
