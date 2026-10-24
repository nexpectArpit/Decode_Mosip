import * as fs from 'fs';
import * as path from 'path';
import { MatrixRunResult } from '../types';

const storePath = process.env.MATRIX_HISTORY_PATH || path.resolve(__dirname, '../../data/matrix-runs.json');

export function safeMatrixDiagnostic(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const message = value.replace(/\s+/g, ' ').trim();
  if (message.length > 500 || /credentialSubject|proofValue|vp_token|access_token|combinedSDJWT|"vc"\s*:/i.test(message)) {
    return 'Detailed upstream payload redacted from report; inspect verifier status and service logs';
  }
  return message;
}

export class RunStore {
  static read(): MatrixRunResult[] {
    if (!fs.existsSync(storePath)) return [];
    const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    if (!Array.isArray(data)) throw new Error('Matrix history file is invalid');
    return data.map((run: MatrixRunResult) => ({
      ...run,
      errorDetail: safeMatrixDiagnostic(run.errorDetail)
    }));
  }

  static append(results: MatrixRunResult[]): void {
    const runs = [...results.slice().reverse(), ...this.read()].slice(0, 1000).map(run => ({
      ...run,
      errorDetail: safeMatrixDiagnostic(run.errorDetail)
    }));
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(runs, null, 2));
    fs.renameSync(tempPath, storePath);
  }
}
