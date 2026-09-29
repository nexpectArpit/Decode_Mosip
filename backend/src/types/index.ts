export interface SystemHealth {
  certify: { status: 'UP' | 'DOWN' | 'UNKNOWN'; url: string; details?: any };
  mimoto: { status: 'UP' | 'DOWN' | 'UNKNOWN'; url: string; details?: any };
  verify: { status: 'UP' | 'DOWN' | 'UNKNOWN'; url: string; details?: any };
  database: { status: 'UP' | 'DOWN' | 'UNKNOWN'; url: string };
  externalMock?: { status: 'UP' | 'DOWN'; url: string };
}

export type CredentialFormat = 'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc';

export type IssuerImplementation = 'INJI_CERTIFY' | 'MOCK_EXTERNAL_OID4VCI';
export type WalletImplementation = 'INJI_WEB' | 'INJI_MOBILE' | 'MOCK_EXTERNAL_WALLET';
export type VerifierImplementation = 'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP';

export type TamperScenario = 
  | 'NONE'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED_CREDENTIAL'
  | 'ALTERED_CLAIMS'
  | 'CORRUPTED_DISCLOSURE'
  | 'MISMATCHED_NONCE'
  | 'REVOKED_STATUS';

export interface ProtocolLogEntry {
  id: string;
  timestamp: string;
  protocol: 'OpenID4VCI' | 'OpenID4VP' | 'W3C_VC' | 'SD_JWT' | 'MDOC' | 'SYSTEM';
  step: string;
  actor: 'ISSUER' | 'WALLET' | 'VERIFIER' | 'BFF';
  direction: 'REQUEST' | 'RESPONSE' | 'INTERNAL';
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  payload: any;
  status?: number;
  durationMs?: number;
}

export interface InteropCheck {
  name: string;
  category: 'VCI' | 'VP' | 'CREDENTIAL_FORMAT' | 'CRYPTO_SUITE' | 'TAMPER_DEFENSE';
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
  evidence: any;
}

export interface InteropReport {
  timestamp: string;
  overallScore: number;
  checks: InteropCheck[];
  summary: string;
}

export interface MatrixRunResult {
  id: string;
  issuer: IssuerImplementation;
  wallet: WalletImplementation;
  verifier: VerifierImplementation;
  format: CredentialFormat;
  proofType: string;
  tamperScenario: TamperScenario;
  issuanceSuccess: boolean;
  verificationSuccess: boolean;
  expectedOutcome: 'SUCCESS' | 'REJECT';
  actualOutcome: 'SUCCESS' | 'REJECT';
  passed: boolean;
  latencyMs: number;
  errorDetail?: string;
  timestamp: string;
}

export interface IssuedCredentialPayload {
  id: string;
  format: CredentialFormat;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: Record<string, any>;
  proof?: any;
  rawString?: string;
  rawCborHex?: string;
  combinedSDJWT?: string;
  issuerSignedJwt?: string;
  mso?: any;
  payload?: any;
  disclosures?: any[];
  issuerImplementation: IssuerImplementation;
}

export interface VerificationResultPayload {
  valid: boolean;
  status: 'VALID' | 'INVALID' | 'EXPIRED' | 'TAMPERED';
  format: CredentialFormat;
  verifier: VerifierImplementation;
  cryptographicCheck: {
    signatureValid: boolean;
    signatureSuite: string;
    issuerDid: string;
    tamperDetected: boolean;
    message?: string;
  };
  claimsCheck: {
    issuerTrusted: boolean;
    subjectMatched: boolean;
    notExpired: boolean;
    claims: Record<string, any>;
  };
  rawVpToken?: any;
  durationMs: number;
  timestamp: string;
}
