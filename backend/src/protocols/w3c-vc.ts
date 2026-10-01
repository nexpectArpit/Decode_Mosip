import * as crypto from 'crypto';
import { Ed25519Crypto, Ed25519KeyPair } from '../crypto/ed25519';
import { canonicalizeJson } from '../crypto/canonicalize';

export interface W3CCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: Record<string, any>;
  proof?: {
    type: 'Ed25519Signature2020';
    created: string;
    verificationMethod: string;
    proofPurpose: 'assertionMethod';
    proofValue: string; // Multibase base58btc signature (starts with 'z')
  };
}

export interface W3CVerificationResult {
  valid: boolean;
  signatureValid: boolean;
  notExpired: boolean;
  issuerDid: string;
  claims: Record<string, any>;
  errorMessage?: string;
}

export class W3CVCProtocol {
  /**
   * Deterministically canonicalizes and hashes the credential + proof options
   * to produce the exact byte sequence that must be signed.
   */
  public static createSigningInput(credentialWithoutProof: Record<string, any>, proofOptions: Record<string, any>): Buffer {
    const docCanonical = canonicalizeJson(credentialWithoutProof);
    const docHash = crypto.createHash('sha256').update(docCanonical, 'utf-8').digest();

    const proofOptionsCanonical = canonicalizeJson(proofOptions);
    const proofHash = crypto.createHash('sha256').update(proofOptionsCanonical, 'utf-8').digest();

    // Combined digest to sign
    return Buffer.concat([proofHash, docHash]);
  }

  /**
   * Issues a cryptographically signed W3C Verifiable Credential using Ed25519Signature2020 suite.
   */
  public static issueCredential(params: {
    issuerKeyPair: Ed25519KeyPair;
    holderDid: string;
    type: string[];
    claims: Record<string, any>;
    validityDays?: number;
    issuerDid?: string;
  }): W3CCredential {
    const now = new Date();
    const expiry = new Date(now.getTime() + (params.validityDays || 365) * 24 * 3600 * 1000);
    const id = `urn:uuid:${crypto.randomUUID()}`;
    const issuer = params.issuerDid || params.issuerKeyPair.did;

    const credentialDoc: Record<string, any> = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id,
      type: ['VerifiableCredential', ...params.type],
      issuer,
      issuanceDate: now.toISOString(),
      expirationDate: expiry.toISOString(),
      credentialSubject: {
        id: params.holderDid,
        ...params.claims
      }
    };

    const proofOptions = {
      type: 'Ed25519Signature2020',
      created: now.toISOString(),
      verificationMethod: `${issuer}#key-1`,
      proofPurpose: 'assertionMethod'
    };

    const signingInput = this.createSigningInput(credentialDoc, proofOptions);
    const signature = Ed25519Crypto.sign(signingInput, params.issuerKeyPair.privateKeyObject);
    const proofValue = Ed25519Crypto.encodeSignatureMultibase(signature);

    const credential: W3CCredential = {
      ...credentialDoc,
      proof: {
        ...proofOptions,
        type: 'Ed25519Signature2020',
        proofPurpose: 'assertionMethod',
        proofValue
      }
    } as W3CCredential;

    return credential;
  }

  /**
   * Cryptographically verifies a W3C Verifiable Credential.
   * Does NOT rely on any simulated parameters!
   */
  public static verifyCredential(
    credential: any,
    issuerPublicKey: crypto.KeyObject
  ): W3CVerificationResult {
    if (!credential || typeof credential !== 'object') {
      return {
        valid: false,
        signatureValid: false,
        notExpired: false,
        issuerDid: '',
        claims: {},
        errorMessage: 'Invalid credential payload: expected object.'
      };
    }

    if (!credential.proof || !credential.proof.proofValue) {
      return {
        valid: false,
        signatureValid: false,
        notExpired: false,
        issuerDid: credential.issuer || '',
        claims: {},
        errorMessage: 'Missing cryptographic proof in credential.'
      };
    }

    // 1. Check temporal validity
    const now = Date.now();
    let notExpired = true;
    if (credential.expirationDate) {
      const exp = new Date(credential.expirationDate).getTime();
      notExpired = now <= exp;
    }

    if (!notExpired) {
      return {
        valid: false,
        signatureValid: false,
        notExpired: false,
        issuerDid: credential.issuer,
        claims: credential.credentialSubject || {},
        errorMessage: `Credential expired on ${credential.expirationDate}.`
      };
    }

    // 2. Extract proof and reconstruct signing input
    const {
      proof,
      format,
      issuerImplementation,
      rawCborHex,
      combinedSDJWT,
      issuerSignedJwt,
      disclosures,
      mso,
      payload,
      ...credentialDoc
    } = credential;
    const { proofValue, ...proofOptions } = proof;

    const signingInput = this.createSigningInput(credentialDoc, proofOptions);

    let signatureBuffer: Buffer;
    try {
      signatureBuffer = Ed25519Crypto.decodeSignatureMultibase(proofValue);
    } catch (e: any) {
      return {
        valid: false,
        signatureValid: false,
        notExpired: true,
        issuerDid: credential.issuer,
        claims: credential.credentialSubject || {},
        errorMessage: `Invalid proofValue multibase encoding: ${e.message}`
      };
    }

    // 3. Cryptographically verify signature with public key
    const signatureValid = Ed25519Crypto.verify(signingInput, signatureBuffer, issuerPublicKey);

    if (!signatureValid) {
      return {
        valid: false,
        signatureValid: false,
        notExpired: true,
        issuerDid: credential.issuer,
        claims: credential.credentialSubject || {},
        errorMessage: 'Cryptographic Ed25519 signature verification failed. Key or claim hash mismatch.'
      };
    }

    return {
      valid: true,
      signatureValid: true,
      notExpired: true,
      issuerDid: credential.issuer,
      claims: credential.credentialSubject || {}
    };
  }
}
