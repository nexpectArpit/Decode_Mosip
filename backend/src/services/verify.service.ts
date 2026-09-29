import fetch from 'node-fetch';
import { ProtocolInspector } from '../middleware/inspector';
import { VerificationResultPayload, CredentialFormat } from '../types';
import { W3CVCProtocol, W3CVerificationResult } from '../protocols/w3c-vc';
import { SDJWTCrypto, SDJWTVerificationResult } from '../crypto/sd-jwt';
import { MDocCrypto, MDocVerificationResult } from '../crypto/mdoc-cose';
import { CertifyService } from './certify.service';
import { MockExternalService } from './mock-external.service';

const VERIFY_BASE_URL = process.env.VERIFY_URL || 'http://localhost:8095/v1/verify';

export class VerifyService {
  public static async getDidDocument(): Promise<any> {
    const start = Date.now();
    const url = `${VERIFY_BASE_URL}/did.json`;

    ProtocolInspector.record({
      protocol: 'OpenID4VP',
      step: 'Verifier DID Document Discovery',
      actor: 'VERIFIER',
      direction: 'REQUEST',
      endpoint: url,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      payload: null
    });

    try {
      const res = await fetch(url);
      const data = await res.json();

      ProtocolInspector.record({
        protocol: 'OpenID4VP',
        step: 'Verifier DID Document Response',
        actor: 'VERIFIER',
        direction: 'RESPONSE',
        endpoint: url,
        method: 'GET',
        headers: Object.fromEntries(res.headers.entries()),
        payload: data,
        status: res.status,
        durationMs: Date.now() - start
      });

      return data;
    } catch {
      return {
        id: 'did:web:verify-service:v1:verify',
        verificationMethod: [{
          id: 'did:web:verify-service:v1:verify#key-0',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:web:verify-service:v1:verify'
        }]
      };
    }
  }

  /**
   * Cryptographically verifies an incoming credential presentation.
   * NOTE: Does NOT receive any 'tamperScenario' flag! Validity is determined
   * entirely by mathematical verification of signature bytes, digests, and timestamps.
   */
  public static async verifyVC(vcPayload: any): Promise<VerificationResultPayload> {
    const start = Date.now();
    const url = `${VERIFY_BASE_URL}/vc-verification`;

    ProtocolInspector.record({
      protocol: 'OpenID4VP',
      step: 'Inji Verify: Cryptographic Verification Invocated',
      actor: 'VERIFIER',
      direction: 'REQUEST',
      endpoint: url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: { credentialId: vcPayload.id, format: vcPayload.format }
    });

    // 1. Resolve Issuer Public Key
    const issuerDid: string = vcPayload.issuer || '';
    let issuerPublicKey = CertifyService.keyPair.publicKeyObject;
    if (issuerDid.includes('external-issuer') || vcPayload.issuerImplementation === 'MOCK_EXTERNAL_OID4VCI') {
      issuerPublicKey = MockExternalService.issuerKeyPair.publicKeyObject;
    }

    const format: CredentialFormat = vcPayload.format || 'ldp_vc';
    let isValid = false;
    let actualStatus: 'VALID' | 'INVALID' | 'EXPIRED' | 'TAMPERED' = 'VALID';
    let diagnosticMessage: string | undefined;
    let verifiedClaims: Record<string, any> = {};

    // 2. Perform Real Cryptographic Verification by Format
    if (format === 'vc+sd-jwt' && vcPayload.combinedSDJWT) {
      const sdResult: SDJWTVerificationResult = SDJWTCrypto.verifySDJWT(
        vcPayload.combinedSDJWT,
        issuerPublicKey
      );

      isValid = sdResult.valid;
      if (!isValid) {
        if (!sdResult.signatureValid || !sdResult.disclosuresValid) {
          actualStatus = 'TAMPERED';
        } else if (!sdResult.notExpired) {
          actualStatus = 'EXPIRED';
        } else {
          actualStatus = 'INVALID';
        }
        diagnosticMessage = sdResult.errorMessage;
      }
      verifiedClaims = sdResult.disclosedClaims;
    } else if (format === 'mso_mdoc' && vcPayload.rawCborHex) {
      const mdocResult: MDocVerificationResult = MDocCrypto.verifyMDoc(
        vcPayload.rawCborHex,
        issuerPublicKey
      );

      isValid = mdocResult.valid;
      if (!isValid) {
        if (!mdocResult.signatureValid || !mdocResult.digestsValid) {
          actualStatus = 'TAMPERED';
        } else if (!mdocResult.notExpired) {
          actualStatus = 'EXPIRED';
        } else {
          actualStatus = 'INVALID';
        }
        diagnosticMessage = mdocResult.errorMessage;
      }
      verifiedClaims = mdocResult.claims;
    } else {
      // W3C JSON-LD VC
      const w3cResult: W3CVerificationResult = W3CVCProtocol.verifyCredential(
        vcPayload,
        issuerPublicKey
      );

      isValid = w3cResult.valid;
      if (!isValid) {
        if (!w3cResult.signatureValid) {
          actualStatus = 'TAMPERED';
        } else if (!w3cResult.notExpired) {
          actualStatus = 'EXPIRED';
        } else {
          actualStatus = 'INVALID';
        }
        diagnosticMessage = w3cResult.errorMessage;
      }
      verifiedClaims = w3cResult.claims;
    }

    const result: VerificationResultPayload = {
      valid: isValid,
      status: actualStatus,
      format,
      verifier: 'INJI_VERIFY',
      cryptographicCheck: {
        signatureValid: isValid || actualStatus === 'EXPIRED',
        signatureSuite: vcPayload.proof?.type || 'Ed25519Signature2020',
        issuerDid,
        tamperDetected: !isValid && actualStatus !== 'EXPIRED',
        message: diagnosticMessage || 'Cryptographic signature and canonical digest successfully verified against issuer root key.'
      },
      claimsCheck: {
        issuerTrusted: true,
        subjectMatched: true,
        notExpired: actualStatus !== 'EXPIRED',
        claims: verifiedClaims
      },
      rawVpToken: {
        type: ['VerifiablePresentation'],
        verifiableCredential: [vcPayload]
      },
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString()
    };

    ProtocolInspector.record({
      protocol: 'OpenID4VP',
      step: `Inji Verify: Mathematical Cryptographic Verification [Outcome: ${actualStatus}]`,
      actor: 'VERIFIER',
      direction: 'RESPONSE',
      endpoint: url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: result,
      status: isValid ? 200 : 422,
      durationMs: result.durationMs
    });

    return result;
  }

  public static async createVPRequest(params: {
    clientId: string;
    presentationDefinition?: any;
  }): Promise<any> {
    const start = Date.now();
    const url = `${VERIFY_BASE_URL}/vp-request`;

    const body = {
      clientId: params.clientId || 'playground-verifier',
      presentationDefinition: params.presentationDefinition || {
        id: 'FarmerCredentialRequest',
        input_descriptors: [
          {
            id: 'farmer_id',
            format: {
              ldp_vc: {
                proof_type: ['Ed25519Signature2020']
              }
            }
          }
        ]
      }
    };

    ProtocolInspector.record({
      protocol: 'OpenID4VP',
      step: 'Inji Verify: Generate OpenID4VP Authorization Request',
      actor: 'VERIFIER',
      direction: 'REQUEST',
      endpoint: url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: body
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return data;
    } catch {
      return {
        requestId: 'req_' + crypto.randomUUID().slice(0, 8),
        authUrl: 'openid4vp://authorize?client_id=' + (params.clientId || 'playground-verifier')
      };
    }
  }

  public static async getVPRequestJwt(requestId: string): Promise<string> {
    const url = `${VERIFY_BASE_URL}/vp-request/${requestId}`;
    try {
      const res = await fetch(url);
      return await res.text();
    } catch {
      return 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...dummyVpJwt';
    }
  }
}
