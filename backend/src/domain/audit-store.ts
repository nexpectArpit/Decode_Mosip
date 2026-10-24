import * as fs from 'fs';
import * as path from 'path';
import { NormativeRequirement } from './normative-matrix';

export interface AuditSnapshot {
  id: string;
  timestamp: string;
  overallScore: number;
  passed: number;
  total: number;
  coverage: Record<string, unknown>;
  requirements: NormativeRequirement[];
}

const storePath = process.env.AUDIT_HISTORY_PATH || path.resolve(__dirname, '../../data/audit-runs.json');

export class AuditStore {
  static read(): AuditSnapshot[] {
    if (!fs.existsSync(storePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Audit history file is invalid');
    return parsed;
  }

  static append(snapshot: AuditSnapshot): void {
    const history = [snapshot, ...this.read()].slice(0, 100);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(history, null, 2));
    fs.renameSync(tempPath, storePath);
  }
}
