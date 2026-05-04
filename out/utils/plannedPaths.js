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
exports.resolvePlannedPath = resolvePlannedPath;
exports.plannedFileLooksWritten = plannedFileLooksWritten;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function resolvePlannedPath(plannedPath, writeRoot) {
    const normalized = plannedPath.replace(/\\/g, '/').trim();
    if (!normalized)
        return undefined;
    const writeBase = path.basename(writeRoot).replace(/\\/g, '/');
    const targetRoot = path.dirname(writeRoot);
    const candidates = new Set();
    if (path.isAbsolute(normalized)) {
        candidates.add(path.resolve(normalized));
    }
    else {
        // Primary convention: paths in plan are relative to writeRoot (e.g., app/src/...).
        candidates.add(path.resolve(writeRoot, normalized));
        // Compatibility: some older plans may include the component prefix (e.g., api/app/...).
        const prefixed = `${writeBase}/`;
        if (normalized.startsWith(prefixed)) {
            candidates.add(path.resolve(targetRoot, normalized));
            candidates.add(path.resolve(writeRoot, normalized.slice(prefixed.length)));
        }
    }
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    return undefined;
}
function plannedFileLooksWritten(absPath) {
    try {
        if (!fs.existsSync(absPath))
            return false;
        const stats = fs.statSync(absPath);
        if (!stats.isFile())
            return false;
        if (stats.size <= 0)
            return false;
        const ext = path.extname(absPath).toLowerCase();
        if (ext === '.java') {
            if (stats.size < 30)
                return false;
            const head = fs.readFileSync(absPath, 'utf8').slice(0, 2000);
            return /^\s*package\s+[A-Za-z0-9_.]+;/m.test(head);
        }
        if (ext === '.sql')
            return stats.size >= 20;
        return stats.size >= 20;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=plannedPaths.js.map