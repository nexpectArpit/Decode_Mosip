import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IndependentVPResult } from '../services/independent-vp.service';

export interface VPRunRecord {
  transactionId: string;
  completedAt: string;
  executionMode: 'EXTERNAL_WALLET_OPENID4VP';
  selectedWallet: 'INJI_MOBILE' | 'INJI_WEB' | 'UNSPECIFIED';
  walletIdentityVerified: false;
  verifier: 'INJI_VERIFY';
  vpResultStatus: string;
  valid: boolean;
  interopDiagnostic?: string;
  submittedCredentialCount?: number;
  submittedCredentialFormats?: string[];
  submittedCredentialProofTypes?: string[];
  submittedIssuerIds?: string[];
  credentialCount: number;
  credentialResults: Array<{ verificationStatus: string; issuer?: string; format?: string; proofType?: string; error?: string }>;
  independentResult?: IndependentVPResult | { status: 'UNAVAILABLE'; reason: string };
}

const storePath = process.env.VP_HISTORY_PATH || path.resolve(__dirname, '../../data/vp-runs.json');

export class VPRunStore {
  static read(): VPRunRecord[] {
    if (!fs.existsSync(storePath)) return [];
    const records = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    if (!Array.isArray(records)) throw new Error('VP run history file is invalid');
    return records;
  }

  static appendIfNew(record: VPRunRecord): void {
    const previous = this.read();
    if (previous.some(item => item.transactionId === record.transactionId)) return;
    const records = [record, ...previous].slice(0, 1000);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(records, null, 2));
    fs.renameSync(tempPath, storePath);
  }

  static updateIndependentResult(transactionId: string, independentResult: VPRunRecord['independentResult']): void {
    const records = this.read();
    const record = records.find(item => item.transactionId === transactionId);
    if (!record) return;
    record.independentResult = independentResult;
    const tempPath = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(records, null, 2));
    fs.renameSync(tempPath, storePath);
  }
}
