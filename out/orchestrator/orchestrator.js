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
exports.Orchestrator = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
const llmClient_1 = require("../utils/llmClient");
const agentLoop_1 = require("./agentLoop");
const templateCopier_1 = require("../utils/templateCopier");
const plannedPaths_1 = require("../utils/plannedPaths");
const DEFAULT_STEPS = [
    { id: 'analyze', label: '1. Analyze Legacy', status: 'pending' },
    { id: 'docs', label: '2. Generate Legacy Docs', status: 'pending' },
    { id: 'reviewDocs', label: '3. Human Gate: Docs', status: 'pending' },
    { id: 'convertApi', label: '4. Convert API → Spring', status: 'pending' },
    { id: 'convertUi', label: '5. Convert UI → SPA', status: 'pending' },
    { id: 'reviewCode', label: '6. Human Gate: Code', status: 'pending' },
    { id: 'tests', label: '7. Generate Tests', status: 'pending' },
    { id: 'cicd', label: '8. Generate CI/CD', status: 'pending' },
    { id: 'reviewCicd', label: '9. Human Gate: CI/CD', status: 'pending' }
];
class Orchestrator {
    context;
    steps = JSON.parse(JSON.stringify(DEFAULT_STEPS));
    listeners = [];
    out;
    constructor(context) {
        this.context = context;
        this.out = vscode.window.createOutputChannel('Legacy Modernizer');
    }
    // ---- state ----
    getSteps() { return this.steps; }
    onStateChange(cb) { this.listeners.push(cb); }
    notify() { this.listeners.forEach(l => l()); }
    setStatus(id, status, detail, artifactPath) {
        const s = this.steps.find(x => x.id === id);
        if (s) {
            s.status = status;
            s.detail = detail;
            s.artifactPath = artifactPath;
            this.notify();
        }
    }
    getStep(id) {
        return this.steps.find(s => s.id === id);
    }
    stepLabel(id) {
        return this.getStep(id)?.label || id;
    }
    ensureStepsDone(targetId, prerequisiteIds, detail) {
        const missing = prerequisiteIds.filter(id => this.getStep(id)?.status !== 'done');
        if (missing.length === 0)
            return true;
        const missingLabels = missing.map(id => this.stepLabel(id));
        this.setStatus(targetId, 'pending', detail || `Blocked: complete ${missingLabels.join(', ')}`);
        vscode.window.showWarningMessage(`${this.stepLabel(targetId)} is blocked. Complete ${missingLabels.join(' and ')} first.`);
        return false;
    }
    ensureStepReadyForReview(reviewStepId, upstreamId) {
        const upstreamStatus = this.getStep(upstreamId)?.status;
        if (upstreamStatus === 'awaiting-review' || upstreamStatus === 'done')
            return true;
        this.setStatus(reviewStepId, 'pending', `Blocked: ${this.stepLabel(upstreamId)} must run first`);
        vscode.window.showWarningMessage(`${this.stepLabel(reviewStepId)} is blocked. Run ${this.stepLabel(upstreamId)} first.`);
        return false;
    }
    log(msg) {
        const ts = new Date().toISOString();
        this.out.appendLine(`[${ts}] ${msg}`);
        this.out.show(true);
    }
    // ---- config helpers ----
    cfg() { return vscode.workspace.getConfiguration('modernizer'); }
    legacyRoot() { return this.cfg().get('legacyRoot') || ''; }
    targetRoot() { return this.cfg().get('targetRoot') || ''; }
    archFile() { return this.cfg().get('targetArchitectureFile') || ''; }
    uiFw() { return this.cfg().get('targetUiFramework') || 'react'; }
    maxIter() { return this.cfg().get('maxIterations') || 40; }
    llm() {
        return (0, llmClient_1.makeLlmClient)(this.cfg());
    }
    llmForStep(stepId) {
        const modelFor = this.cfg().get('modelFor') || {};
        const raw = modelFor[stepId];
        if (!raw)
            return this.llm();
        const selection = this.parseStepModelOverride(raw);
        if (!selection) {
            this.log(`[config] Invalid modernizer.modelFor.${stepId}="${raw}". ` +
                'Use "<provider>:<model>", e.g. "copilot:gpt-4o-mini" or "anthropic:claude-sonnet-4-6".');
            return this.llm();
        }
        this.log(`[${stepId}] model override → ${selection.provider}${selection.model ? `:${selection.model}` : ''}`);
        return (0, llmClient_1.makeLlmClient)(this.cfg(), selection);
    }
    critiquePassEnabled() {
        return this.cfg().get('enableCritiquePass', true);
    }
    modernizerWorkDir() {
        return path.join(this.targetRoot(), '_modernizer');
    }
    timestampToken(d = new Date()) {
        const yyyy = d.getFullYear().toString();
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        const hh = d.getHours().toString().padStart(2, '0');
        const mi = d.getMinutes().toString().padStart(2, '0');
        const ss = d.getSeconds().toString().padStart(2, '0');
        return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
    }
    listArtifactsByPattern(root, pattern) {
        if (!fs.existsSync(root))
            return [];
        const matches = fs.readdirSync(root)
            .filter((name) => pattern.test(name))
            .map((name) => {
            const fullPath = path.join(root, name);
            let mtimeMs = 0;
            try {
                mtimeMs = fs.statSync(fullPath).mtimeMs;
            }
            catch { /* ignore */ }
            return { fullPath, mtimeMs };
        })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);
        return matches.map((m) => m.fullPath);
    }
    latestInventoryFile(root) {
        return this.listArtifactsByPattern(root, /^inventory(?:-\d{8}-\d{6})?\.json$/i)[0];
    }
    latestDocsFile(root) {
        return this.listArtifactsByPattern(root, /^LEGACY_DOCUMENTATION(?:-\d{8}-\d{6})?\.md$/i)[0];
    }
    apiPlanPath(apiRoot) {
        return path.join(apiRoot, '_modernizer', 'api-conversion-plan.json');
    }
    loadApiPlan(planPath) {
        if (!fs.existsSync(planPath))
            return undefined;
        try {
            const raw = JSON.parse(fs.readFileSync(planPath, 'utf8'));
            const rows = Array.isArray(raw)
                ? raw
                : Array.isArray(raw?.files)
                    ? raw.files
                    : [];
            const files = rows
                .map((row) => {
                if (typeof row === 'string')
                    return { path: row };
                if (row && typeof row === 'object' && typeof row.path === 'string') {
                    return {
                        path: row.path.trim(),
                        type: typeof row.type === 'string' ? row.type : undefined,
                        name: typeof row.name === 'string' ? row.name : undefined
                    };
                }
                return undefined;
            })
                .filter((row) => Boolean(row && row.path));
            return {
                generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : undefined,
                archHash: typeof raw?.archHash === 'string' ? raw.archHash : undefined,
                files
            };
        }
        catch {
            return undefined;
        }
    }
    planCoverage(writeRoot, entries) {
        const missing = entries.filter((entry) => {
            const resolved = (0, plannedPaths_1.resolvePlannedPath)(entry.path, writeRoot);
            return !(resolved && (0, plannedPaths_1.plannedFileLooksWritten)(resolved));
        });
        return {
            existingCount: entries.length - missing.length,
            missing
        };
    }
    computePlanContextHash(archMd, skillMd) {
        return crypto.createHash('sha256')
            .update(archMd || '')
            .update('\n--skill--\n')
            .update(skillMd || '')
            .digest('hex')
            .slice(0, 12);
    }
    planAgeDays(generatedAt) {
        if (!generatedAt)
            return undefined;
        const when = Date.parse(generatedAt);
        if (!Number.isFinite(when))
            return undefined;
        return (Date.now() - when) / (1000 * 60 * 60 * 24);
    }
    cleanupPlannedArtifacts(writeRoot, planPath, entries) {
        const writeRootAbs = path.resolve(writeRoot);
        let deleted = 0;
        for (const entry of entries) {
            const resolved = (0, plannedPaths_1.resolvePlannedPath)(entry.path, writeRoot);
            if (!resolved)
                continue;
            if (!resolved.startsWith(`${writeRootAbs}${path.sep}`))
                continue;
            try {
                fs.unlinkSync(resolved);
                deleted += 1;
            }
            catch {
                // ignore single-file cleanup failures; regeneration can overwrite.
            }
        }
        const resolvedPlanPath = path.resolve(planPath);
        if (fs.existsSync(resolvedPlanPath) && resolvedPlanPath.startsWith(`${writeRootAbs}${path.sep}`)) {
            try {
                fs.unlinkSync(resolvedPlanPath);
            }
            catch { /* ignore */ }
        }
        return deleted;
    }
    parseStepModelOverride(raw) {
        const value = raw.trim();
        if (!value)
            return undefined;
        const idx = value.indexOf(':');
        const providerToken = (idx === -1 ? value : value.slice(0, idx)).trim().toLowerCase();
        const model = (idx === -1 ? '' : value.slice(idx + 1)).trim();
        const providerAlias = {
            copilot: 'vscode-copilot',
            'vscode-copilot': 'vscode-copilot',
            anthropic: 'claude-sonnet',
            claude: 'claude-sonnet',
            'claude-sonnet': 'claude-sonnet',
            openai: 'openai-codex',
            codex: 'openai-codex',
            'openai-codex': 'openai-codex'
        };
        const provider = providerAlias[providerToken];
        if (!provider)
            return undefined;
        return { provider, model: model || undefined };
    }
    ensureSetup() {
        if (!this.legacyRoot() || !fs.existsSync(this.legacyRoot())) {
            vscode.window.showErrorMessage('Pick a legacy .NET codebase folder first.');
            return false;
        }
        if (!this.targetRoot()) {
            vscode.window.showErrorMessage('Pick a target output folder first.');
            return false;
        }
        fs.mkdirSync(this.targetRoot(), { recursive: true });
        return true;
    }
    // ---- pipeline steps ----
    async stepAnalyze() {
        if (!this.ensureSetup())
            return;
        const writeRoot = this.modernizerWorkDir();
        fs.mkdirSync(writeRoot, { recursive: true });
        const reusableFile = this.latestInventoryFile(writeRoot);
        if (reusableFile) {
            const choice = await vscode.window.showInformationMessage(`${path.basename(reusableFile)} already exists. Reuse it for this run?`, 'Reuse', 'Regenerate');
            if (choice === 'Reuse') {
                this.setStatus('analyze', 'done', 'Reused existing inventory', reusableFile);
                return;
            }
            if (choice !== 'Regenerate') {
                this.setStatus('analyze', 'pending', 'Cancelled');
                return;
            }
        }
        this.setStatus('analyze', 'running');
        try {
            const outName = `inventory-${this.timestampToken()}.json`;
            const outFile = path.join(writeRoot, outName);
            await (0, agentLoop_1.runAgentLoop)({
                orchestrator: this,
                agent: 'analyzer',
                skillPath: path.join(this.context.extensionPath, 'skills', 'documentation-generator', 'SKILL.md'),
                userGoal: `Walk the legacy .NET codebase and write ${outName} to the writeRoot. ` +
                    'It must contain a structured inventory of projects, controllers, services, repositories, ' +
                    `models, web forms, configs, and external dependencies. Use write_file with path "${outName}" ` +
                    'and the full JSON as content. Then call finish.',
                maxIterations: this.maxIter(),
                writeFiles: true,
                writeRoot,
                llm: this.llmForStep('analyze'),
                critiquePass: this.critiquePassEnabled()
            });
            if (!fs.existsSync(outFile)) {
                throw new Error(`Analyzer agent finished but did not write ${outName}.`);
            }
            this.setStatus('analyze', 'done', 'Inventory created', outFile);
        }
        catch (e) {
            this.setStatus('analyze', 'failed', e.message);
            throw e;
        }
    }
    async stepGenerateDocs() {
        if (!this.ensureSetup())
            return;
        const writeRoot = this.modernizerWorkDir();
        fs.mkdirSync(writeRoot, { recursive: true });
        let inventoryFile = this.latestInventoryFile(writeRoot);
        if (!inventoryFile) {
            const choice = await vscode.window.showInformationMessage('Generate Docs requires an inventory artifact from Analyze. Run Analyze now?', 'Run Analyze', 'Cancel');
            if (choice !== 'Run Analyze') {
                this.setStatus('docs', 'pending', 'Blocked: Analyze is required');
                return;
            }
            await this.stepAnalyze();
            inventoryFile = this.latestInventoryFile(writeRoot);
            if (!inventoryFile) {
                this.setStatus('docs', 'failed', 'Analyze did not produce an inventory artifact');
                throw new Error('Cannot generate docs without an inventory artifact.');
            }
        }
        if (this.getStep('analyze')?.status !== 'done') {
            this.setStatus('analyze', 'done', 'Inventory available for docs generation', inventoryFile);
        }
        const reusableDoc = this.latestDocsFile(writeRoot);
        if (reusableDoc) {
            const choice = await vscode.window.showInformationMessage(`${path.basename(reusableDoc)} already exists. Reuse it for this run?`, 'Reuse', 'Regenerate');
            if (choice === 'Reuse') {
                this.setStatus('docs', 'awaiting-review', 'Reused existing docs, pending review', reusableDoc);
                const existingDoc = await vscode.workspace.openTextDocument(reusableDoc);
                await vscode.window.showTextDocument(existingDoc);
                return;
            }
            if (choice !== 'Regenerate') {
                this.setStatus('docs', 'pending', 'Cancelled');
                return;
            }
        }
        this.setStatus('docs', 'running');
        try {
            const inventoryName = path.basename(inventoryFile);
            const outName = `LEGACY_DOCUMENTATION-${this.timestampToken()}.md`;
            const outFile = path.join(writeRoot, outName);
            await (0, agentLoop_1.runAgentLoop)({
                orchestrator: this,
                agent: 'documenter',
                skillPath: path.join(this.context.extensionPath, 'skills', 'documentation-generator', 'SKILL.md'),
                userGoal: `Using ${inventoryName} plus source reading, write ${outName} to the writeRoot. ` +
                    'Cover: system overview, module map, API surface, data model, business rules, UI flows, integrations, ' +
                    `and known smells. Use Mermaid diagrams where useful. Call write_file with path "${outName}" ` +
                    'and the full markdown as content. Then call finish.',
                maxIterations: this.maxIter(),
                writeFiles: true,
                writeRoot,
                llm: this.llmForStep('docs'),
                critiquePass: this.critiquePassEnabled()
            });
            if (!fs.existsSync(outFile)) {
                throw new Error(`Documenter agent finished but did not write ${outName}. ` +
                    'Check the Output panel for the agent log.');
            }
            this.setStatus('docs', 'awaiting-review', 'Open file in editor for review', outFile);
            const doc = await vscode.workspace.openTextDocument(outFile);
            await vscode.window.showTextDocument(doc);
        }
        catch (e) {
            this.setStatus('docs', 'failed', e.message);
            throw e;
        }
    }
    async stepReviewDocs() {
        if (!this.ensureStepReadyForReview('reviewDocs', 'docs'))
            return;
        const latestDocFile = this.getStep('docs')?.artifactPath || this.latestDocsFile(this.modernizerWorkDir());
        const docName = latestDocFile ? path.basename(latestDocFile) : 'the generated legacy documentation';
        const choice = await vscode.window.showInformationMessage(`Human Gate #1: Have you reviewed ${docName}?`, { modal: true }, 'Approve & Continue', 'Re-generate', 'Cancel');
        if (choice === 'Approve & Continue') {
            this.setStatus('docs', 'done', 'Approved by reviewer'); // ← flip the upstream step
            this.setStatus('reviewDocs', 'done', 'Approved');
        }
        else if (choice === 'Re-generate') {
            this.setStatus('docs', 'pending');
            this.setStatus('reviewDocs', 'pending');
            await this.stepGenerateDocs();
        }
        else {
            this.setStatus('reviewDocs', 'pending', 'Cancelled');
        }
    }
    async stepConvertApi() {
        if (!this.ensureStepsDone('convertApi', ['reviewDocs'], 'Blocked: approve Human Gate #1 (Docs) first'))
            return;
        if (!this.ensureSetup())
            return;
        this.setStatus('convertApi', 'running');
        try {
            const apiRoot = path.join(this.targetRoot(), 'api');
            fs.mkdirSync(apiRoot, { recursive: true });
            // ---- Phase 1: copy Spring Boot templates ----
            const archFilePath = this.archFile();
            const archMd = archFilePath && fs.existsSync(archFilePath)
                ? fs.readFileSync(archFilePath, 'utf8')
                : '';
            const vars = (0, templateCopier_1.deriveVarsFromArchitectureMd)(archMd, {
                artifactId: path.basename(this.targetRoot()).toLowerCase().replace(/[^a-z0-9-]/g, '-')
            });
            const tmpl = path.join(this.context.extensionPath, 'templates', 'springboot');
            const written = (0, templateCopier_1.copyTemplates)(tmpl, apiRoot, vars);
            this.log(`[apiConverter] copied ${written.length} template files (basePackage=${vars.basePackage})`);
            const pkgPath = vars.basePackage.replace(/\./g, '/');
            const planPath = this.apiPlanPath(apiRoot);
            const skillPath = path.join(this.context.extensionPath, 'skills', 'api-converter', 'SKILL.md');
            const skillMd = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : '';
            const currentPlanHash = this.computePlanContextHash(archMd, skillMd);
            const existingPlan = this.loadApiPlan(planPath);
            let conversionMode = 'full';
            let resumeMissing = [];
            let resumeTotal = 0;
            if (existingPlan && existingPlan.files.length > 0) {
                const coverage = this.planCoverage(apiRoot, existingPlan.files);
                const ageDays = this.planAgeDays(existingPlan.generatedAt);
                const stalePlan = ageDays !== undefined && ageDays > 7;
                const hashMismatch = Boolean(existingPlan.archHash && existingPlan.archHash !== currentPlanHash);
                const cautionParts = [];
                if (hashMismatch)
                    cautionParts.push('Architecture/skill hash changed');
                if (stalePlan)
                    cautionParts.push(`Plan is ${Math.round(ageDays)} days old`);
                const cautionSuffix = cautionParts.length > 0 ? ` (${cautionParts.join('; ')})` : '';
                this.log(`[apiConverter] found existing plan ${path.basename(planPath)} ` +
                    `(${coverage.existingCount}/${existingPlan.files.length} files already present)` +
                    cautionSuffix);
                if (coverage.missing.length === 0) {
                    const choice = await vscode.window.showInformationMessage(`API conversion plan already appears complete.${cautionSuffix ? ` ${cautionParts.join('. ')}.` : ''} Reuse existing generated API?`, 'Reuse', 'Regenerate');
                    if (choice === 'Reuse') {
                        this.setStatus('convertApi', 'done', `Reused existing API output (${existingPlan.files.length} planned files)`, apiRoot);
                        return;
                    }
                    if (choice !== 'Regenerate') {
                        this.setStatus('convertApi', 'pending', 'Cancelled');
                        return;
                    }
                    const deleted = this.cleanupPlannedArtifacts(apiRoot, planPath, existingPlan.files);
                    this.log(`[apiConverter] regenerate cleanup removed ${deleted} planned files`);
                }
                else {
                    const extraWarning = cautionParts.length > 0 ? ` ${cautionParts.join('. ')}.` : '';
                    const choice = await vscode.window.showInformationMessage(`Found existing API plan with ${coverage.missing.length} missing of ${existingPlan.files.length}.${extraWarning} Resume from missing files?`, 'Resume', 'Regenerate', 'Cancel');
                    if (choice === 'Resume') {
                        conversionMode = 'resume';
                        resumeMissing = coverage.missing;
                        resumeTotal = existingPlan.files.length;
                    }
                    else if (choice === 'Cancel' || !choice) {
                        this.setStatus('convertApi', 'pending', 'Cancelled');
                        return;
                    }
                    else if (choice === 'Regenerate') {
                        const deleted = this.cleanupPlannedArtifacts(apiRoot, planPath, existingPlan.files);
                        this.log(`[apiConverter] regenerate cleanup removed ${deleted} planned files`);
                    }
                }
            }
            const fullGoal = `Generate a complete Spring Boot API in ${apiRoot} from the legacy .NET source.\n\n` +
                `=== Scaffolding already present (read-only for you) ===\n` +
                `Application.java, application.yml, pom.xml, app/pom.xml,\n` +
                `${pkgPath}/config/CorrelationIdFilter.java,\n` +
                `${pkgPath}/exception/GlobalExceptionHandler.java,\n` +
                `.gitignore, .editorconfig.\n` +
                `Read these to understand structure. Do not rewrite them.\n\n` +
                `=== Files YOU MUST PRODUCE — one of each per controller in inventory.json ===\n` +
                `For EVERY controller listed in inventory.json (currently: ProductsController, OrdersController):\n` +
                `  1. Controller class:    ${vars.basePackage}.controller.<Name>Controller\n` +
                `  2. Service interface:   ${vars.basePackage}.service.<Name>Service\n` +
                `  3. Service impl:        ${vars.basePackage}.service.impl.<Name>ServiceImpl\n` +
                `  4. JPA repository:      ${vars.basePackage}.repository.<Name>Repository\n` +
                `  5. JPA entity:          ${vars.basePackage}.domain.<Name>\n` +
                `  6. Request DTO record:  ${vars.basePackage}.dto.<Name>Request\n` +
                `  7. Response DTO record: ${vars.basePackage}.dto.<Name>Response\n` +
                `  8. MapStruct mapper:    ${vars.basePackage}.mapper.<Name>Mapper\n\n` +
                `Plus, ONCE for the whole project:\n` +
                `  • SecurityConfig at ${vars.basePackage}.config.SecurityConfig (Spring Security + JWT resource server)\n` +
                `  • Flyway migration at app/src/main/resources/db/migration/V1__init.sql\n` +
                `    with CREATE TABLE for every entity\n\n` +
                `=== Path rule (CRITICAL) ===\n` +
                `basePackage is "${vars.basePackage}". Every Java file lives at:\n` +
                `app/src/main/java/${pkgPath}/<subpackage>/<File>.java\n` +
                `Each file's first non-comment line is "package ${vars.basePackage}.<subpackage>;"\n\n` +
                `=== Procedure (mandatory) ===\n` +
                `1. read_file latest inventory artifact under ${this.modernizerWorkDir()} ` +
                `(prefer inventory-*.json; fallback inventory.json).\n` +
                `2. read_file each legacy controller in the inventory.\n` +
                `3. write_file a plan to writeRoot/_modernizer/api-conversion-plan.json listing\n` +
                `   every Java file you will create with full path. Plan top-level must include:\n` +
                `   generatedAt (ISO-8601), archHash="${currentPlanHash}", totalFiles, and files[].\n` +
                `   Plan must contain at LEAST 18 files\n` +
                `   for a 2-controller inventory (8 per controller + SecurityConfig + V1__init.sql).\n` +
                `4. Generate every planned file via write_file.\n` +
                `5. Before finish: list_dir and reconcile against the plan. Missing files = write them now.\n` +
                `6. Call finish ONLY when zero files are missing AND the plan threshold is met.\n\n` +
                `Calling finish with fewer than 18 generated files for this inventory is a FAILURE.`;
            const resumeGoal = `Resume an interrupted Spring Boot API conversion in ${apiRoot}.\n\n` +
                `Existing plan file: writeRoot/_modernizer/api-conversion-plan.json\n` +
                `Current context hash: ${currentPlanHash}.\n` +
                `Planned files: ${resumeTotal}. Missing files right now: ${resumeMissing.length}.\n\n` +
                `Generate ONLY the missing files listed below via write_file using EXACT paths. ` +
                `Do not rewrite files that already exist.\n\n` +
                `MISSING FILES:\n` +
                `${resumeMissing.map((entry) => `- ${entry.path}${entry.type ? ` (${entry.type})` : ''}`).join('\n')}\n\n` +
                `Procedure:\n` +
                `1. read_file "_modernizer/api-conversion-plan.json".\n` +
                `2. Write each missing file path listed above.\n` +
                `3. If needed, read latest inventory artifact under ${this.modernizerWorkDir()} for legacy context.\n` +
                `4. Call finish only when every listed missing file has been written.`;
            const userGoal = conversionMode === 'resume' ? resumeGoal : fullGoal;
            const maxIterations = conversionMode === 'resume'
                ? Math.min(this.maxIter(), Math.max(12, resumeMissing.length * 2 + 6))
                : this.maxIter();
            // ---- Phase 2: agent generates project-specific code ----
            await (0, agentLoop_1.runAgentLoop)({
                orchestrator: this,
                agent: 'apiConverter',
                skillPath,
                userGoal,
                maxIterations,
                writeFiles: true,
                writeRoot: apiRoot,
                llm: this.llmForStep('convertApi'),
                critiquePass: this.critiquePassEnabled()
            });
            const detail = conversionMode === 'resume'
                ? `Resumed delta generation (${resumeMissing.length} missing from prior plan)`
                : `${written.length} templates + agent code`;
            this.setStatus('convertApi', 'done', detail, apiRoot);
        }
        catch (e) {
            this.setStatus('convertApi', 'failed', e.message);
            throw e;
        }
    }
    async stepConvertUi() {
        if (!this.ensureStepsDone('convertUi', ['reviewDocs'], 'Blocked: approve Human Gate #1 (Docs) first'))
            return;
        if (!this.ensureSetup())
            return;
        this.setStatus('convertUi', 'running');
        try {
            const uiRoot = path.join(this.targetRoot(), 'ui');
            fs.mkdirSync(uiRoot, { recursive: true });
            // ---- Phase 1: copy UI templates ----
            const archFilePath = this.archFile();
            const archMd = archFilePath && fs.existsSync(archFilePath)
                ? fs.readFileSync(archFilePath, 'utf8')
                : '';
            const vars = (0, templateCopier_1.deriveVarsFromArchitectureMd)(archMd, {
                artifactId: path.basename(this.targetRoot()).toLowerCase().replace(/[^a-z0-9-]/g, '-')
            });
            const tmplDir = this.uiFw() === 'angular' ? 'angular' : 'react';
            const tmpl = path.join(this.context.extensionPath, 'templates', tmplDir);
            const written = (0, templateCopier_1.copyTemplates)(tmpl, uiRoot, vars);
            this.log(`[uiConverter] copied ${written.length} template files`);
            // ---- Phase 2: agent generates project-specific code ----
            const skill = this.uiFw() === 'angular'
                ? 'ui-converter/SKILL-angular.md'
                : 'ui-converter/SKILL-react.md';
            await (0, agentLoop_1.runAgentLoop)({
                orchestrator: this,
                agent: 'uiConverter',
                skillPath: path.join(this.context.extensionPath, 'skills', skill),
                userGoal: `Project scaffolding already exists under ${uiRoot}: package.json, tsconfig.json, vite.config.ts (or angular.json), ` +
                    `tailwind/postcss configs, .gitignore, an api-client.ts, and index.html. DO NOT regenerate these. ` +
                    `Generate ONLY the project-specific code: pages, feature components, typed API service modules, routing, ` +
                    `auth store, and feature tests. Use the existing api-client.ts as the HTTP base.`,
                maxIterations: this.maxIter(),
                writeFiles: true,
                writeRoot: uiRoot,
                llm: this.llmForStep('convertUi'),
                critiquePass: this.critiquePassEnabled()
            });
            this.setStatus('convertUi', 'done', `${written.length} templates + agent code`, uiRoot);
        }
        catch (e) {
            this.setStatus('convertUi', 'failed', e.message);
            throw e;
        }
    }
    async stepReviewCode() {
        if (!this.ensureStepsDone('reviewCode', ['convertApi', 'convertUi'], 'Blocked: complete API + UI conversion first'))
            return;
        const choice = await vscode.window.showInformationMessage('Human Gate #2: Review generated Spring Boot + SPA code in target folder.', { modal: true }, 'Approve & Continue', 'Re-generate API', 'Re-generate UI', 'Cancel');
        if (choice === 'Approve & Continue')
            this.setStatus('reviewCode', 'done', 'Approved');
        else if (choice === 'Re-generate API') {
            this.setStatus('convertApi', 'pending');
            await this.stepConvertApi();
        }
        else if (choice === 'Re-generate UI') {
            this.setStatus('convertUi', 'pending');
            await this.stepConvertUi();
        }
        else
            this.setStatus('reviewCode', 'pending', 'Cancelled');
    }
    async stepGenerateTests() {
        if (!this.ensureStepsDone('tests', ['reviewCode'], 'Blocked: approve Human Gate #2 (Code) first'))
            return;
        if (!this.ensureSetup())
            return;
        this.setStatus('tests', 'running');
        try {
            await (0, agentLoop_1.runAgentLoop)({
                orchestrator: this,
                agent: 'testGenerator',
                skillPath: path.join(this.context.extensionPath, 'skills', 'test-generator', 'SKILL.md'),
                userGoal: 'Generate JUnit 5 + Mockito unit tests AND Spring Boot @SpringBootTest integration tests for the API ' +
                    'and Vitest/Jest + Testing-Library tests for the SPA. Aim for ≥80% line coverage on touched code.',
                maxIterations: this.maxIter(),
                writeFiles: true,
                writeRoot: this.targetRoot(),
                llm: this.llmForStep('tests'),
                critiquePass: this.critiquePassEnabled()
            });
            this.setStatus('tests', 'done', 'Tests generated');
        }
        catch (e) {
            this.setStatus('tests', 'failed', e.message);
            throw e;
        }
    }
    async stepGenerateCicd() {
        if (!this.ensureStepsDone('cicd', ['tests'], 'Blocked: complete test generation first'))
            return;
        if (!this.ensureSetup())
            return;
        this.setStatus('cicd', 'running');
        try {
            const deployRoot = path.join(this.targetRoot(), 'deploy');
            fs.mkdirSync(deployRoot, { recursive: true });
            // ---- Phase 1: copy OpenShift templates ----
            const archFilePath = this.archFile();
            const archMd = archFilePath && fs.existsSync(archFilePath)
                ? fs.readFileSync(archFilePath, 'utf8')
                : '';
            const vars = (0, templateCopier_1.deriveVarsFromArchitectureMd)(archMd, {
                artifactId: path.basename(this.targetRoot()).toLowerCase().replace(/[^a-z0-9-]/g, '-')
            });
            const tmpl = path.join(this.context.extensionPath, 'templates', 'openshift');
            const written = (0, templateCopier_1.copyTemplates)(tmpl, deployRoot, vars);
            this.log(`[cicdGenerator] copied ${written.length} template files`);
            // ---- Phase 2: agent verifies/customizes manifests ----
            await (0, agentLoop_1.runAgentLoop)({
                orchestrator: this,
                agent: 'cicdGenerator',
                skillPath: path.join(this.context.extensionPath, 'skills', 'cicd-generator', 'SKILL.md'),
                userGoal: `Most CI/CD manifests already exist as templates under ${deployRoot}. ` +
                    `Read them, verify they're consistent with the generated api/ and ui/, and add any missing pieces: ` +
                    `Secret placeholder yaml referencing the env vars used in application.yml, ConfigMap with non-secret env, ` +
                    `ServiceMonitor for Prometheus, and a README documenting oc/helm commands. Do NOT regenerate the ` +
                    `Dockerfiles, Helm chart skeleton, Tekton tasks, Jenkinsfile, or bitbucket-pipelines.yml.`,
                maxIterations: Math.min(this.maxIter(), 8),
                writeFiles: true,
                writeRoot: deployRoot,
                llm: this.llmForStep('cicd'),
                critiquePass: this.critiquePassEnabled()
            });
            this.setStatus('cicd', 'awaiting-review', `${written.length} templates + review updates`, deployRoot);
        }
        catch (e) {
            this.setStatus('cicd', 'failed', e.message);
            throw e;
        }
    }
    async stepReviewCicd() {
        if (!this.ensureStepReadyForReview('reviewCicd', 'cicd'))
            return;
        const choice = await vscode.window.showInformationMessage('Human Gate #3: Review OpenShift CI/CD manifests in deploy/.', { modal: true }, 'Approve & Continue', 'Re-generate', 'Cancel');
        if (choice === 'Approve & Continue') {
            this.setStatus('cicd', 'done', 'Approved by reviewer');
            this.setStatus('reviewCicd', 'done', 'Approved');
        }
        else if (choice === 'Re-generate') {
            this.setStatus('cicd', 'pending');
            this.setStatus('reviewCicd', 'pending');
            await this.stepGenerateCicd();
        }
        else {
            this.setStatus('reviewCicd', 'pending', 'Cancelled');
        }
    }
    async runFullPipeline() {
        await this.stepAnalyze();
        await this.stepGenerateDocs();
        await this.stepReviewDocs();
        if (this.steps.find(s => s.id === 'reviewDocs').status !== 'done')
            return;
        await this.stepConvertApi();
        await this.stepConvertUi();
        await this.stepReviewCode();
        if (this.steps.find(s => s.id === 'reviewCode').status !== 'done')
            return;
        await this.stepGenerateTests();
        await this.stepGenerateCicd();
        await this.stepReviewCicd();
        vscode.window.showInformationMessage('🎉 Modernization pipeline complete.');
    }
}
exports.Orchestrator = Orchestrator;
//# sourceMappingURL=orchestrator.js.map