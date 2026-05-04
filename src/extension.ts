import * as vscode from 'vscode';
import { registerAllCommands } from './commands';
import { ModernizerMenuProvider } from './ui/menuProvider';
import { PipelineStatusProvider } from './ui/statusProvider';
import { Orchestrator } from './orchestrator/orchestrator';

export function activate(context: vscode.ExtensionContext) {
  console.log('[Legacy Modernizer] activated');

  const orchestrator = new Orchestrator(context);

  // Register the click-driven menu webview (Activity Bar -> Legacy Modernizer)
  const menuProvider = new ModernizerMenuProvider(context, orchestrator);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('modernizerMenu', menuProvider)
  );

  // Status / pipeline tree
  const statusProvider = new PipelineStatusProvider(orchestrator);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('modernizerStatus', statusProvider)
  );
  orchestrator.onStateChange(() => statusProvider.refresh());

  // Register all commands
  registerAllCommands(context, orchestrator);

  // Friendly greeting
  vscode.window.showInformationMessage(
    'Legacy Modernizer ready. Click the rocket icon in the Activity Bar to begin.'
  );
}

export function deactivate() {}
