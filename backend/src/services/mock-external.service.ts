import * as crypto from 'crypto';
import { Ed25519Crypto, Ed25519KeyPair } from '../crypto/ed25519';
import { SDJWTCrypto, SDJWTIssuanceResult, SDJWTVerificationResult } from '../crypto/sd-jwt';
import { MDocCrypto, MDocIssuanceResult, MDocVerificationResult } from '../crypto/mdoc-cose';
import { W3CVCProtocol, W3CCredential, W3CVerificationResult } from '../protocols/w3c-vc';
import { ProtocolInspector } from '../middleware/inspector';
import { CredentialFormat } from '../types';
import { CertifyService } from './certify.service';
import { VerifyService } from './verify.service';

export class MockExternalService {
  // Deterministic seed for External Mock Issuer so DID and key remain consistent
  private static readonly ISSUER_SEED = Buffer.from('4a9b2c1d8e7f605a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a', 'hex');
  public static readonly issuerKeyPair: Ed25519KeyPair = Ed25519Crypto.fromSeed(MockExternalService.ISSUER_SEED);

  // Deterministic seed for External Mock Verifier
  private static readonly VERIFIER_SEED = Buffer.from('9f8e7d6c5b4a3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b', 'hex');
  public static readonly verifierKeyPair: Ed25519KeyPair = Ed25519Crypto.fromSeed(MockExternalService.VERIFIER_SEED);

  public static getWellKnownMetadata() {
    const endpoint = 'https://external-issuer.org/.well-known/openid-credential-issuer';
    const metadata = {
      credential_issuer: 'https://external-issuer.org',
      authorization_servers: ['https://auth.external-issuer.org'],
      credential_endpoint: 'https://external-issuer.org/v1/credential',
      credential_configurations_supported: {
        'SD_JWT_NationalID': {
          format: 'vc+sd-jwt',
          scope: 'national_id_sd_jwt',
          cryptographic_binding_methods_supported: ['did:key', 'did:jwk'],
          credential_signing_alg_values_supported: ['EdDSA'],
          display: [{
            name: 'External Digital Identity (IETF SD-JWT)',
            locale: 'en',
            background_color: '#0f172a',
            text_color: '#38bdf8'
          }],
          claims: {
            fullName: { display: [{ name: 'Full Name' }] },
            nationalId: { display: [{ name: 'National ID Number' }] },
            birthdate: { display: [{ name: 'Date of Birth' }] },
            residentCountry: { display: [{ name: 'Country of Residence' }] }
          }
        },
        'ISO_mDL': {
          format: 'mso_mdoc',
          doctype: 'org.iso.18013.5.1.mDL',
          cryptographic_binding_methods_supported: ['mso'],
          credential_signing_alg_values_supported: ['EdDSA'],
          display: [{
            name: 'Mobile Driving License (ISO/IEC 18013-5)',
            locale: 'en',
            background_color: '#1e1b4b',
            text_color: '#a5b4fc'
          }]
        },
        'W3C_StudentDegree': {
          format: 'ldp_vc',
          scope: 'student_degree',
          cryptographic_binding_methods_supported: ['did:key'],
          credential_signing_alg_values_supported: ['EdDSA'],
          display: [{
            name: 'University Degree Credential (W3C VC)',
            locale: 'en',
            background_color: '#064e3b',
            text_color: '#6ee7b7'
          }]
        }
      }
    };

    ProtocolInspector.record({
      protocol: 'OpenID4VCI',
      step: 'External Mock Issuer Metadata Discovery',
      actor: 'ISSUER',
      direction: 'RESPONSE',
      endpoint,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      payload: metadata,
      status: 200,
      durationMs: 4
    });

    return metadata;
  }

  /**
   * Issues an authentic credential using real cryptographic signatures.
   */
  public static issueCredential(params: {
    format: CredentialFormat;
    holderDid: string;
    subjectData: Record<string, any>;
  }): any {
    const start = Date.now();
    let credentialResult: any;

    if (params.format === 'vc+sd-jwt') {
      const claims = {
        fullName: params.subjectData.fullName || 'Alice Johnson',
        nationalId: params.subjectData.uin || 'ID-88392109',
        birthdate: params.subjectData.dob || '1993-07-22',
        residentCountry: 'Kenya',
        issuedBy: 'National Identity Authority'
      };

      // Disclose everything except nationalId and birthdate by default (selective disclosure)
      const issuance: SDJWTIssuanceResult = SDJWTCrypto.issueSDJWT({
        issuerKeyPair: this.issuerKeyPair,
        holderDid: params.holderDid,
        claims,
        disclosableClaimKeys: ['nationalId', 'birthdate', 'residentCountry']
      });

      credentialResult = {
        id: `urn:uuid:${crypto.randomUUID()}`,
        format: 'vc+sd-jwt',
        type: ['VerifiableCredential', 'SDJWTCredential'],
        issuer: this.issuerKeyPair.did,
        issuanceDate: new Date().toISOString(),
        combinedSDJWT: issuance.combinedSDJWT,
        issuerSignedJwt: issuance.issuerSignedJwt,
        disclosures: issuance.disclosures,
        payload: issuance.payload,
        credentialSubject: {
          id: params.holderDid,
          ...claims
        },
        proof: {
          type: 'Ed25519Signature2020',
          alg: 'EdDSA',
          verificationMethod: `${this.issuerKeyPair.did}#key-1`
        },
        issuerImplementation: 'MOCK_EXTERNAL_OID4VCI'
      };
    } else if (params.format === 'mso_mdoc') {
      const claims = {
        family_name: 'Johnson',
        given_name: params.subjectData.fullName ? params.subjectData.fullName.split(' ')[0] : 'Alice',
        birth_date: params.subjectData.dob || '1993-07-22',
        issue_date: new Date().toISOString().split('T')[0],
        expiry_date: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
        issuing_country: 'KE',
        driving_privileges: [{ vehicle_category_code: 'B' }, { vehicle_category_code: 'A1' }]
      };

      const mdocResult: MDocIssuanceResult = MDocCrypto.issueMDoc({
        issuerKeyPair: this.issuerKeyPair,
        docType: 'org.iso.18013.5.1.mDL',
        claims
      });

      credentialResult = {
        id: `urn:uuid:${crypto.randomUUID()}`,
        format: 'mso_mdoc',
        type: ['org.iso.18013.5.1.mDL'],
        issuer: this.issuerKeyPair.did,
        issuanceDate: new Date().toISOString(),
        rawCborHex: mdocResult.rawCborHex,
        mso: mdocResult.mso,
        credentialSubject: {
          doctype: mdocResult.docType,
          ...claims
        },
        proof: {
          type: 'COSE_Sign1',
          alg: 'EdDSA',
          verificationMethod: `${this.issuerKeyPair.did}#key-1`
        },
        issuerImplementation: 'MOCK_EXTERNAL_OID4VCI'
      };
    } else {
      // W3C JSON-LD (Ed25519Signature2020)
      const claims = {
        name: params.subjectData.fullName || 'Alice Johnson',
        degree: 'Master of Science in Information Systems',
        gpa: '3.96',
        graduationDate: '2024-05-15',
        institution: 'Global Open Technology Institute'
      };

      const vc: W3CCredential = W3CVCProtocol.issueCredential({
        issuerKeyPair: this.issuerKeyPair,
        holderDid: params.holderDid,
        type: ['UniversityDegreeCredential'],
        claims
      });

      credentialResult = {
        ...vc,
        format: 'ldp_vc',
        issuerImplementation: 'MOCK_EXTERNAL_OID4VCI'
      };
    }

    ProtocolInspector.record({
      protocol: 'OpenID4VCI',
      step: `External Mock Issuer: Real Cryptographic Issuance [Format: ${params.format}]`,
      actor: 'ISSUER',
      direction: 'RESPONSE',
      endpoint: 'https://external-issuer.org/v1/credential',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: { credentialId: credentialResult.id, format: params.format },
      status: 200,
      durationMs: Date.now() - start
    });

    return credentialResult;
  }

  /**
   * Verifies an incoming presentation WITHOUT receiving any simulated tamper parameter.
   * Performs actual cryptographic signature, digest, and temporal checks!
   */
  public static async verifyPresentation(presentedCredential: any): Promise<any> {
    const start = Date.now();
    const format: CredentialFormat = presentedCredential.format || 'ldp_vc';

    ProtocolInspector.record({
      protocol: 'OpenID4VP',
      step: 'External Mock Verifier: Evaluating Incoming VP Presentation',
      actor: 'VERIFIER',
      direction: 'REQUEST',
      endpoint: 'https://external-verifier.org/v1/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: { id: presentedCredential.id, format },
      status: 200
    });

    const issuerDid: string = presentedCredential.issuer || '';
    if (issuerDid.includes('certify-nginx') || presentedCredential.issuerImplementation === 'INJI_CERTIFY') {
      const liveVerifyRes = await VerifyService.verifyVC(presentedCredential);
      return {
        ...liveVerifyRes,
        verifier: 'MOCK_EXTERNAL_OID4VP',
        durationMs: Date.now() - start
      };
    }

    let isValid = false;
    let actualStatus: 'VALID' | 'INVALID' | 'EXPIRED' | 'TAMPERED' = 'VALID';
    let errorMessage: string | undefined;
    let verifiedClaims: Record<string, any> = {};

    let issuerPublicKey = this.issuerKeyPair.publicKeyObject;

    if (format === 'vc+sd-jwt' && presentedCredential.combinedSDJWT) {
      // Real SD-JWT cryptographic verification
      const sdRes: SDJWTVerificationResult = SDJWTCrypto.verifySDJWT(
        presentedCredential.combinedSDJWT,
        issuerPublicKey
      );

      isValid = sdRes.valid;
      if (!isValid) {
        if (!sdRes.signatureValid || !sdRes.disclosuresValid) {
          actualStatus = 'TAMPERED';
        } else if (!sdRes.notExpired) {
          actualStatus = 'EXPIRED';
        } else {
          actualStatus = 'INVALID';
        }
        errorMessage = sdRes.errorMessage;
      }
      verifiedClaims = sdRes.disclosedClaims;
    } else if (format === 'mso_mdoc' && presentedCredential.rawCborHex) {
      // Real mDoc CBOR & COSE_Sign1 verification
      const mdocRes: MDocVerificationResult = MDocCrypto.verifyMDoc(
        presentedCredential.rawCborHex,
        issuerPublicKey
      );

      isValid = mdocRes.valid;
      if (!isValid) {
        if (!mdocRes.signatureValid || !mdocRes.digestsValid) {
          actualStatus = 'TAMPERED';
        } else if (!mdocRes.notExpired) {
          actualStatus = 'EXPIRED';
        } else {
          actualStatus = 'INVALID';
        }
        errorMessage = mdocRes.errorMessage;
      }
      verifiedClaims = mdocRes.claims;
    } else {
      // Real W3C VC Ed25519Signature2020 verification
      const w3cRes: W3CVerificationResult = W3CVCProtocol.verifyCredential(
        presentedCredential,
        issuerPublicKey
      );

      isValid = w3cRes.valid;
      if (!isValid) {
        if (!w3cRes.signatureValid) {
          actualStatus = 'TAMPERED';
        } else if (!w3cRes.notExpired) {
          actualStatus = 'EXPIRED';
        } else {
          actualStatus = 'INVALID';
        }
        errorMessage = w3cRes.errorMessage;
      }
      verifiedClaims = w3cRes.claims;
    }

    const verificationResult = {
      valid: isValid,
      status: actualStatus,
      format,
      verifier: 'MOCK_EXTERNAL_OID4VP',
      cryptographicCheck: {
        signatureValid: isValid || actualStatus === 'EXPIRED',
        signatureSuite: presentedCredential.proof?.type || 'Ed25519Signature2020',
        issuerDid: presentedCredential.issuer,
        tamperDetected: !isValid && actualStatus !== 'EXPIRED',
        message: errorMessage || 'Cryptographic signature and canonical digest successfully verified against issuer public key.'
      },
      claimsCheck: {
        issuerTrusted: true,
        subjectMatched: true,
        notExpired: actualStatus !== 'EXPIRED',
        claims: verifiedClaims
      },
      rawVpToken: {
        type: ['VerifiablePresentation'],
        verifiableCredential: [presentedCredential]
      },
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString()
    };

    ProtocolInspector.record({
      protocol: 'OpenID4VP',
      step: `External Mock Verifier: Cryptographic Check Complete [${actualStatus}]`,
      actor: 'VERIFIER',
      direction: 'RESPONSE',
      endpoint: 'https://external-verifier.org/v1/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: verificationResult,
      status: isValid ? 200 : 422,
      durationMs: verificationResult.durationMs
    });

    return verificationResult;
  }
}
