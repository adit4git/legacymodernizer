import * as fs from 'fs';
import * as path from 'path';

export interface TemplateVars {
  groupId: string;
  artifactId: string;
  version: string;
  javaVersion: string;
  springBootVersion: string;
  basePackage: string;
  appTitle: string;
  maintainer: string;
  [k: string]: string;
}

/**
 * Recursively copy `srcDir` into `destDir`, performing {{var}} substitution
 * on files whose name ends with `.template`. The `.template` suffix is
 * stripped from the output filename. Files without that suffix are copied
 * verbatim (no substitution).
 *
 * Returns the list of absolute paths written.
 */
export function copyTemplates(
  srcDir: string,
  destDir: string,
  vars: TemplateVars
): string[] {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Template source not found: ${srcDir}`);
  }
  const written: string[] = [];
  walk(srcDir, destDir, vars, written);
  return written;
}

function walk(srcDir: string, destDir: string, vars: TemplateVars, written: string[]) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    // Guardrail: brace-expanded literals like "{src/main/java,src/main/resources}"
    // are invalid template paths and should never be copied to output projects.
    if (entry.name.includes('{') || entry.name.includes('}')) continue;

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
    } else {
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
function relocateJavaIfNeeded(dest: string, vars: TemplateVars): string {
  const marker = path.sep + 'src' + path.sep + 'main' + path.sep + 'java' + path.sep;
  const idx = dest.indexOf(marker);
  if (idx < 0) return dest;

  const afterJava = dest.slice(idx + marker.length);
  // Only relocate Java files (not, e.g., resources or non-java text)
  if (!afterJava.endsWith('.java')) return dest;

  const pkgPath = vars.basePackage.replace(/\./g, path.sep);
  return dest.slice(0, idx + marker.length) + pkgPath + path.sep + afterJava;
}

/** Replace every `{{key}}` in `text` with `vars[key]`. Unknown keys are left as-is. */
export function substitute(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m
  );
}

/**
 * Best-effort extractor: pulls simple `key: value` lines from the user's
 * target architecture markdown. Falls back to defaults for any field absent.
 */
export function deriveVarsFromArchitectureMd(archMdContent: string, fallbacks: Partial<TemplateVars> = {}): TemplateVars {
  const get = (key: string): string | undefined => {
    const re = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'mi');
    const m = archMdContent.match(re);
    return m?.[1]?.replace(/^["']|["']$/g, '').trim();
  };

  const groupId    = get('groupId')    || fallbacks.groupId    || 'com.example';
  const artifactId = (get('artifactId') || fallbacks.artifactId || 'modernized-app').toLowerCase();
  const version    = get('version')    || fallbacks.version    || '1.0.0-SNAPSHOT';
  const javaVer    = get('javaVersion') || fallbacks.javaVersion || '17';
  const sbVer      = get('springBootVersion') || fallbacks.springBootVersion || '3.3.5';
  const appTitle   = get('appTitle')   || fallbacks.appTitle   || artifactId;
  const maintainer = get('maintainer') || fallbacks.maintainer || 'Modernization Team';
  const basePackage =
    get('basePackage') ||
    fallbacks.basePackage ||
    (groupId + '.' + artifactId.replace(/[^a-z0-9]/g, ''));

  return {
    groupId, artifactId, version,
    javaVersion: javaVer, springBootVersion: sbVer,
    basePackage, appTitle, maintainer
  };
}
