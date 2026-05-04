import * as fs from 'fs';
import * as path from 'path';

export function resolvePlannedPath(plannedPath: string, writeRoot: string): string | undefined {
  const normalized = plannedPath.replace(/\\/g, '/').trim();
  if (!normalized) return undefined;

  const writeBase = path.basename(writeRoot).replace(/\\/g, '/');
  const targetRoot = path.dirname(writeRoot);
  const candidates = new Set<string>();

  if (path.isAbsolute(normalized)) {
    candidates.add(path.resolve(normalized));
  } else {
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
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function plannedFileLooksWritten(absPath: string): boolean {
  try {
    if (!fs.existsSync(absPath)) return false;
    const stats = fs.statSync(absPath);
    if (!stats.isFile()) return false;
    if (stats.size <= 0) return false;

    const ext = path.extname(absPath).toLowerCase();
    if (ext === '.java') {
      if (stats.size < 30) return false;
      const head = fs.readFileSync(absPath, 'utf8').slice(0, 2000);
      return /^\s*package\s+[A-Za-z0-9_.]+;/m.test(head);
    }
    if (ext === '.sql') return stats.size >= 20;
    return stats.size >= 20;
  } catch {
    return false;
  }
}
