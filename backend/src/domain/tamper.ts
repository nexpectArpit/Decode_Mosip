import { Ed25519Crypto } from '../crypto/ed25519';

export type TamperAttackVector =
  | 'NONE'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED_CREDENTIAL'
  | 'ALTERED_CLAIMS'
  | 'CORRUPTED_DISCLOSURE'
  | 'MISMATCHED_NONCE';

export interface TamperedPayloadResult {
  tamperedCredential: any;
  attackVector: TamperAttackVector;
  mutationDescription: string;
  expectedFailureReason: string;
}

export class CredentialTamperEngine {
  /**
   * Applies concrete byte-level or field-level mutations to a signed credential
   * BEFORE it is submitted to the verifier.
   * Note: The verifier does NOT receive any flag indicating tampering!
   */
  public static mutate(credential: any, attackVector: TamperAttackVector): TamperedPayloadResult {
    const mutated = JSON.parse(JSON.stringify(credential));

    switch (attackVector) {
      case 'INVALID_SIGNATURE':
        if (mutated.proof?.proofValue) {
          const signature = Ed25519Crypto.decodeSignatureMultibase(mutated.proof.proofValue);
          if (signature.length === 0) throw new Error('Credential proof signature is empty');
          signature[0] ^= 0x01;
          mutated.proof.proofValue = Ed25519Crypto.encodeSignatureMultibase(signature);
        } else if (mutated.combinedSDJWT) {
          // Flip a byte in the JWT signature segment
          const parts = mutated.combinedSDJWT.split('.');
          const sig = parts[2];
          parts[2] = 'Z' + sig.slice(1);
          mutated.combinedSDJWT = parts.join('.');
        } else if (mutated.rawCborHex) {
          // Corrupt bytes in the CBOR hex
          const hex = mutated.rawCborHex;
          mutated.rawCborHex = hex.slice(0, 50) + 'ff00ff' + hex.slice(56);
        } else throw new Error('Credential has no supported signature bytes to mutate');
        return {
          tamperedCredential: mutated,
          attackVector,
          mutationDescription: 'Flipped cryptographic signature bytes to break mathematical Ed25519 verification.',
          expectedFailureReason: 'Cryptographic signature verification failed.'
        };

      case 'EXPIRED_CREDENTIAL':
        if (!mutated.expirationDate && !mutated.payload?.exp) throw new Error('Credential has no expiry field to mutate');
        if (mutated.expirationDate) {
          mutated.expirationDate = '2021-01-01T00:00:00Z';
        }
        if (mutated.payload?.exp) {
          mutated.payload.exp = 1609459200; // 2021-01-01
        }
        return {
          tamperedCredential: mutated,
          attackVector,
          mutationDescription: 'Set credential validity expiration timestamp into the past.',
          expectedFailureReason: 'Credential expired.'
        };

      case 'ALTERED_CLAIMS':
        if (!mutated.credentialSubject) throw new Error('Credential has no claims to mutate');
        if (mutated.credentialSubject) {
          if (mutated.credentialSubject.fullName) {
            mutated.credentialSubject.fullName = 'Impersonator Forged Name';
          } else if (mutated.credentialSubject.name) {
            mutated.credentialSubject.name = 'Impersonator Forged Name';
          } else {
            mutated.credentialSubject.forged_field = true;
          }
        }
        return {
          tamperedCredential: mutated,
          attackVector,
          mutationDescription: 'Altered credentialSubject claims without access to the issuer private key.',
          expectedFailureReason: 'Cryptographic signature verification failed. Key or claim hash mismatch.'
        };

      case 'CORRUPTED_DISCLOSURE':
        if (!mutated.disclosures?.length || !mutated.combinedSDJWT) throw new Error('Corrupted disclosure requires an SD-JWT credential');
        if (mutated.disclosures && mutated.disclosures.length > 0) {
          // Tamper with the first disclosure string
          const first = mutated.disclosures[0];
          first.disclosureString = first.disclosureString.slice(0, -3) + 'XYZ';
          // Reassemble combined SD-JWT with corrupted disclosure
          const parts = mutated.combinedSDJWT.split('~');
          parts[1] = first.disclosureString;
          mutated.combinedSDJWT = parts.join('~');
        }
        return {
          tamperedCredential: mutated,
          attackVector,
          mutationDescription: 'Altered selective disclosure string; digest does not match signed _sd array.',
          expectedFailureReason: 'Disclosure tamper detected: digest is not in the signed _sd list.'
        };

      case 'MISMATCHED_NONCE':
        throw new Error('Nonce replay testing requires a live OpenID4VP challenge and is not implemented');

      case 'NONE':
      default:
        return {
          tamperedCredential: mutated,
          attackVector: 'NONE',
          mutationDescription: 'Legitimate credential, unmodified.',
          expectedFailureReason: 'None (Expected to verify cleanly)'
        };
    }
  }
}
