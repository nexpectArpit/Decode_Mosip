import { IssuedCredentialPayload, TamperScenario } from '../types';

export class TamperService {
  /**
   * Applies deliberate corruption to a Verifiable Credential or Presentation
   * to rigorously test relying party defensive rejection mechanisms.
   */
  public static applyTampering(
    originalVC: IssuedCredentialPayload,
    scenario: TamperScenario
  ): { tamperedVC: IssuedCredentialPayload; description: string; expectedError: string } {
    const vcCopy: IssuedCredentialPayload = JSON.parse(JSON.stringify(originalVC));

    switch (scenario) {
      case 'INVALID_SIGNATURE':
        if (vcCopy.proof?.proofValue) {
          vcCopy.proof.proofValue = 'zCORRUPTED_' + vcCopy.proof.proofValue.slice(12);
        } else if (vcCopy.proof?.jws) {
          vcCopy.proof.jws = vcCopy.proof.jws.slice(0, -6) + 'XXXXXX';
        } else if (vcCopy.rawString) {
          vcCopy.rawString = vcCopy.rawString.slice(0, -8) + 'TAMPERED';
        }
        return {
          tamperedVC: vcCopy,
          description: 'Cryptographic signature bytes deliberately corrupted in proofValue/jws.',
          expectedError: 'SIGNATURE_VERIFICATION_FAILED / CRYPTO_INTEGRITY_ERROR'
        };

      case 'EXPIRED_CREDENTIAL':
        vcCopy.expirationDate = '2021-05-12T00:00:00Z';
        if (vcCopy.credentialSubject?.expiry_date) {
          vcCopy.credentialSubject.expiry_date = '2021-05-12';
        }
        return {
          tamperedVC: vcCopy,
          description: 'Credential expirationDate altered to past date (2021-05-12T00:00:00Z).',
          expectedError: 'CREDENTIAL_EXPIRED / VALIDITY_PERIOD_EXCEEDED'
        };

      case 'ALTERED_CLAIMS':
        if (vcCopy.credentialSubject) {
          if (vcCopy.credentialSubject.landArea) {
            vcCopy.credentialSubject.landArea = '999999 Hectares (FORGED)';
          } else if (vcCopy.credentialSubject.fullName) {
            vcCopy.credentialSubject.fullName = 'Impersonator Hacker (FORGED)';
          } else if (vcCopy.credentialSubject.name) {
            vcCopy.credentialSubject.name = 'Impersonator Hacker (FORGED)';
          } else {
            vcCopy.credentialSubject.forged_attribute = true;
          }
        }
        return {
          tamperedVC: vcCopy,
          description: 'Subject attributes modified without regenerating cryptographic issuer signature.',
          expectedError: 'DOCUMENT_INTEGRITY_MISMATCH / HASH_VERIFICATION_FAILED'
        };

      case 'MISMATCHED_NONCE':
        return {
          tamperedVC: vcCopy,
          description: 'Presentation challenge/nonce intentionally corrupted to simulate replay attack.',
          expectedError: 'REPLAY_DETECTED / NONCE_MISMATCH'
        };

      case 'REVOKED_STATUS':
        vcCopy.credentialSubject.status = 'SUSPENDED';
        return {
          tamperedVC: vcCopy,
          description: 'Status list index indicates revoked/suspended credential status.',
          expectedError: 'CREDENTIAL_REVOKED / STATUS_LIST_INVALID'
        };

      case 'NONE':
      default:
        return {
          tamperedVC: vcCopy,
          description: 'Clean, unmodified cryptographic credential.',
          expectedError: 'NONE (Expected to pass)'
        };
    }
  }
}
