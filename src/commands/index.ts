import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Orchestrator } from '../orchestrator/orchestrator';
import { JiraMcp } from '../mcp/jira';
import { BitbucketMcp } from '../mcp/bitbucket';
import { runAgentLoop } from '../orchestrator/agentLoop';

export function registerAllCommands(ctx: vscode.ExtensionContext, orch: Orchestrator) {
  const reg = (id: string, fn: (...args: any[]) => any) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('modernizer.openMenu', () =>
    vscode.commands.executeCommand('workbench.view.extension.legacyModernizer'));

  reg('modernizer.runFullPipeline',  () => orch.runFullPipeline());
  reg('modernizer.step1.analyze',     () => orch.stepAnalyze());
  reg('modernizer.step2.generateDocs',() => orch.stepGenerateDocs());
  reg('modernizer.step3.reviewDocs',  () => orch.stepReviewDocs());
  reg('modernizer.step4.convertApi',  () => orch.stepConvertApi());
  reg('modernizer.step5.convertUi',   () => orch.stepConvertUi());
  reg('modernizer.step6.reviewCode',  () => orch.stepReviewCode());
  reg('modernizer.step7.generateTests',() => orch.stepGenerateTests());
  reg('modernizer.step8.generateCicd',() => orch.stepGenerateCicd());
  reg('modernizer.step9.reviewCicd',  () => orch.stepReviewCicd());

  // ----- defect loop -----
  reg('modernizer.defects.fetchJira', async () => {
    const jira = new JiraMcp(orch);
    const issues = await jira.fetchOpenDefects();
    if (!issues.length) {
      vscode.window.showInformationMessage('No open defects found.');
      return;
    }
    const pick = await vscode.window.showQuickPick(
      issues.map(i => ({ label: `${i.key}  ${i.summary}`, description: i.priority, detail: i.description, issue: i } as any)),
      { placeHolder: 'Select a Jira defect to resolve' }
    );
    if (pick) ctx.workspaceState.update('modernizer.selectedDefect', (pick as any).issue);
  });

  reg('modernizer.defects.resolve', async () => {
    const issue = ctx.workspaceState.get<any>('modernizer.selectedDefect');
    if (!issue) {
      vscode.window.showWarningMessage('Pick a Jira defect first.');
      return;
    }
    if (!orch.ensureSetup()) return;

    // Run a focused agent that fixes the bug
    await runAgentLoop({
      orchestrator: orch,
      agent: 'defectResolver',
      skillPath: path.join(orch.context.extensionPath, 'skills', 'defect-resolver', 'SKILL.md'),
      userGoal:
        `Resolve Jira defect ${issue.key}: ${issue.summary}\n\nDESCRIPTION:\n${issue.description}\n\n` +
        'Locate the offending code in the modernized target, fix it minimally, ' +
        'add/adjust unit tests, and call finish with the list of changed files.',
      maxIterations: orch.maxIter(),
      writeFiles: true,
      writeRoot: orch.targetRoot(),
      llm: orch.llmForStep('defectResolution'),
      critiquePass: orch.critiquePassEnabled()
    });

    const bb = new BitbucketMcp(orch);
    const branch = `fix/${issue.key.toLowerCase()}`;
    const prUrl = await bb.openPullRequest({
      branch,
      title: `${issue.key}: ${issue.summary}`,
      description: `Auto-resolved by Legacy Modernizer.\n\nJira: ${issue.key}\n${issue.description}`
    });
    vscode.window.showInformationMessage(`PR opened: ${prUrl}`);
  });

  // ----- config helpers -----
  reg('modernizer.config.targetArchitecture', async () => {
    const uri = await vscode.window.showOpenDialog({
      canSelectFiles: true, filters: { Markdown: ['md'] },
      openLabel: 'Select Target Architecture .md'
    });
    if (uri?.[0]) {
      await vscode.workspace.getConfiguration('modernizer')
        .update('targetArchitectureFile', uri[0].fsPath, vscode.ConfigurationTarget.Global);
    }
  });

  reg('modernizer.config.modelProvider', async () => {
    const pick = await vscode.window.showQuickPick(['vscode-copilot', 'claude-sonnet', 'openai-codex'],
      { placeHolder: 'Choose model provider' });
    if (pick) await vscode.workspace.getConfiguration('modernizer')
      .update('modelProvider', pick, vscode.ConfigurationTarget.Global);
  });

  // ----- sample loader -----
  reg('modernizer.loadSampleLegacy', async () => {
    const src = path.join(ctx.extensionPath, 'sample-legacy-code');
    const dest = await vscode.window.showOpenDialog({
      canSelectFolders: true, openLabel: 'Where should I copy the sample?'
    });
    if (!dest?.[0]) return;
    const out = path.join(dest[0].fsPath, 'sample-legacy-dotnet');
    copyDir(src, out);
    await vscode.workspace.getConfiguration('modernizer')
      .update('legacyRoot', out, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Sample copied to ${out} and set as legacy root.`);
  });

  reg('modernizer.listCopilotModels', async () => {
  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  if (models.length === 0) {
    vscode.window.showWarningMessage(
      'No Copilot models. Install GitHub Copilot + Copilot Chat, sign in, send one Copilot Chat message to grant consent, then re-run.'
    );
    return;
  }
  const lines = models.map(m =>
    `• ${m.vendor}/${m.family}  id=${m.id}  maxInput=${m.maxInputTokens}`
  ).join('\n');
  vscode.window.showInformationMessage('Available Copilot models:\n' + lines, { modal: true });
});
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
