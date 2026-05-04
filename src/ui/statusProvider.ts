import * as vscode from 'vscode';
import { Orchestrator, PipelineStep } from '../orchestrator/orchestrator';

export class PipelineStatusProvider implements vscode.TreeDataProvider<PipelineStep> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly orchestrator: Orchestrator) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(step: PipelineStep): vscode.TreeItem {
    const icon = step.status === 'done' ? '✅'
               : step.status === 'running' ? '⏳'
               : step.status === 'awaiting-review' ? '👁️'
               : step.status === 'failed' ? '❌'
               : '⚪';
    const item = new vscode.TreeItem(`${icon} ${step.label}`);
    item.description = step.status;
    item.tooltip = step.detail || step.label;
    return item;
  }

  getChildren(): PipelineStep[] {
    return this.orchestrator.getSteps();
  }
}
