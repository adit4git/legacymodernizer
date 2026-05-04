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
exports.copyTemplates = copyTemplates;
exports.substitute = substitute;
exports.deriveVarsFromArchitectureMd = deriveVarsFromArchitectureMd;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Recursively copy `srcDir` into `destDir`, performing {{var}} substitution
 * on files whose name ends with `.template`. The `.template` suffix is
 * stripped from the output filename. Files without that suffix are copied
 * verbatim (no substitution).
 *
 * Returns the list of absolute paths written.
 */
function copyTemplates(srcDir, destDir, vars) {
    if (!fs.existsSync(srcDir)) {
        throw new Error(`Template source not found: ${srcDir}`);
    }
    const written = [];
    walk(srcDir, destDir, vars, written);
    return written;
}
function walk(srcDir, destDir, vars, written) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        // Guardrail: brace-expanded literals like "{src/main/java,src/main/resources}"
        // are invalid template paths and should never be copied to output projects.
        if (entry.name.includes('{') || entry.name.includes('}'))
            continue;
        const src = path.join(srcDir, entry.name);
        if (entry.isDirectory()) {
            walk(src, path.join(destDir, entry.name), vars, written);
            continue;
        }
        const isTemplate = entry.name.endsWith('.template');
        const outName = isTemplate ? entry.name.slice(0, -'.template'.length) : entry.name;
        const dest = path.join(destDir, outName);
        if (isTemplate) {
            let content = fs.readFileSync(src, 'utf8');
            content = substitute(content, vars);
            // For Java templates living in /java/<filename>, place under the basePackage path.
            const finalDest = relocateJavaIfNeeded(dest, vars);
            fs.mkdirSync(path.dirname(finalDest), { recursive: true });
            fs.writeFileSync(finalDest, content);
            written.push(finalDest);
        }
        else {
            fs.copyFileSync(src, dest);
            written.push(dest);
        }
    }
}
/**
 * If the destination ends in `.../src/main/java/<File>.java` (with no package
 * directory in between), relocate it under the basePackage path so the file's
 * `package x.y.z;` line matches its directory.
 *
 *   .../src/main/java/Application.java
 *     -> .../src/main/java/com/contoso/store/Application.java
 *
 *   .../src/main/java/config/CorrelationIdFilter.java
 *     -> .../src/main/java/com/contoso/store/config/CorrelationIdFilter.java
 */
function relocateJavaIfNeeded(dest, vars) {
    const marker = path.sep + 'src' + path.sep + 'main' + path.sep + 'java' + path.sep;
    const idx = dest.indexOf(marker);
    if (idx < 0)
        return dest;
    const afterJava = dest.slice(idx + marker.length);
    // Only relocate Java files (not, e.g., resources or non-java text)
    if (!afterJava.endsWith('.java'))
        return dest;
    const pkgPath = vars.basePackage.replace(/\./g, path.sep);
    return dest.slice(0, idx + marker.length) + pkgPath + path.sep + afterJava;
}
/** Replace every `{{key}}` in `text` with `vars[key]`. Unknown keys are left as-is. */
function substitute(text, vars) {
    return text.replace(/\{\{(\w+)\}\}/g, (m, k) => Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m);
}
/**
 * Best-effort extractor: pulls simple `key: value` lines from the user's
 * target architecture markdown. Falls back to defaults for any field absent.
 */
function deriveVarsFromArchitectureMd(archMdContent, fallbacks = {}) {
    const get = (key) => {
        const re = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'mi');
        const m = archMdContent.match(re);
        return m?.[1]?.replace(/^["']|["']$/g, '').trim();
    };
    const groupId = get('groupId') || fallbacks.groupId || 'com.example';
    const artifactId = (get('artifactId') || fallbacks.artifactId || 'modernized-app').toLowerCase();
    const version = get('version') || fallbacks.version || '1.0.0-SNAPSHOT';
    const javaVer = get('javaVersion') || fallbacks.javaVersion || '17';
    const sbVer = get('springBootVersion') || fallbacks.springBootVersion || '3.3.5';
    const appTitle = get('appTitle') || fallbacks.appTitle || artifactId;
    const maintainer = get('maintainer') || fallbacks.maintainer || 'Modernization Team';
    const basePackage = get('basePackage') ||
        fallbacks.basePackage ||
        (groupId + '.' + artifactId.replace(/[^a-z0-9]/g, ''));
    return {
        groupId, artifactId, version,
        javaVersion: javaVer, springBootVersion: sbVer,
        basePackage, appTitle, maintainer
    };
}
//# sourceMappingURL=templateCopier.js.map