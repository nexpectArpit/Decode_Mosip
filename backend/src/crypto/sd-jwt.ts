import * as crypto from 'crypto';
import { Ed25519Crypto, Ed25519KeyPair } from './ed25519';

export interface DisclosureObject {
  salt: string;
  claimName: string;
  claimValue: any;
  disclosureString: string; // base64url([salt, claimName, claimValue])
  digest: string;           // base64url(sha256(disclosureString))
}

export interface SDJWTIssuanceResult {
  combinedSDJWT: string;
  issuerSignedJwt: string;
  disclosures: DisclosureObject[];
  payload: Record<string, any>;
  issuerDid: string;
}

export interface SDJWTVerificationResult {
  valid: boolean;
  signatureValid: boolean;
  disclosuresValid: boolean;
  notExpired: boolean;
  issuerDid: string;
  disclosedClaims: Record<string, any>;
  undisclosedDigests: string[];
  errorMessage?: string;
}

export interface SDJWTSigningKey {
  issuer: string;
  algorithm: 'EdDSA' | 'RS256';
  privateKeyObject: crypto.KeyObject;
  publicKeyObject: crypto.KeyObject;
  keyId?: string;
  x5c?: string[];
}

export class SDJWTCrypto {
  /**
   * Helper to base64url encode a buffer or UTF-8 string.
   */
  public static base64UrlEncode(input: Buffer | string): string {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8');
    return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  /**
   * Helper to base64url decode into a UTF-8 string.
   */
  public static base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf-8');
  }

  /**
   * Computes SHA-256 digest of a string and returns base64url.
   */
  public static sha256Digest(str: string): string {
    const hash = crypto.createHash('sha256').update(str, 'utf-8').digest();
    return this.base64UrlEncode(hash);
  }

  /**
   * Creates an SD-JWT disclosure for a given claim name and value.
   * Format: base64url(JSON.stringify([salt, claim_name, claim_value]))
   */
  public static createDisclosure(claimName: string, claimValue: any): DisclosureObject {
    const salt = crypto.randomBytes(16).toString('base64url');
    const arrayRepresentation = [salt, claimName, claimValue];
    const jsonString = JSON.stringify(arrayRepresentation);
    const disclosureString = this.base64UrlEncode(jsonString);
    const digest = this.sha256Digest(disclosureString);

    return {
      salt,
      claimName,
      claimValue,
      disclosureString,
      digest
    };
  }

  /**
   * Issues a fully compliant RFC IETF SD-JWT credential signed with an Ed25519 key.
   */
  public static issueSDJWT(params: {
    issuerKeyPair: Ed25519KeyPair;
    signingKey?: SDJWTSigningKey;
    holderDid: string;
    holderPublicJwk?: Record<string, string>;
    claims: Record<string, any>;
    disclosableClaimKeys: string[];
    validitySeconds?: number;
    credentialType?: string;
  }): SDJWTIssuanceResult {
    const signingKey: SDJWTSigningKey = params.signingKey || {
      issuer: params.issuerKeyPair.did,
      algorithm: 'EdDSA',
      privateKeyObject: params.issuerKeyPair.privateKeyObject,
      publicKeyObject: params.issuerKeyPair.publicKeyObject,
      keyId: `${params.issuerKeyPair.did}#key-1`
    };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (params.validitySeconds || 365 * 24 * 3600);

    const disclosures: DisclosureObject[] = [];
    const sdDigests: string[] = [];
    const payload: Record<string, any> = {
      iss: signingKey.issuer,
      sub: params.holderDid,
      vct: params.credentialType || 'urn:inji:local:ReferenceCredential',
      iat: now,
      nbf: now,
      exp: exp,
      _sd_alg: 'sha-256'
    };
    if (params.holderPublicJwk) payload.cnf = { jwk: params.holderPublicJwk };

    // Separate claims into disclosable vs always visible
    for (const [key, value] of Object.entries(params.claims)) {
      if (params.disclosableClaimKeys.includes(key)) {
        const disc = this.createDisclosure(key, value);
        disclosures.push(disc);
        sdDigests.push(disc.digest);
      } else {
        payload[key] = value;
      }
    }

    // Sort digests deterministically
    sdDigests.sort();
    payload._sd = sdDigests;

    const header: Record<string, unknown> = {
      typ: 'vc+sd-jwt',
      alg: signingKey.algorithm,
      kid: signingKey.keyId
    };
    if (signingKey.x5c) header.x5c = signingKey.x5c;

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Cryptographic signature
    const signature = signingKey.algorithm === 'EdDSA'
      ? Ed25519Crypto.sign(signingInput, signingKey.privateKeyObject)
      : crypto.sign('RSA-SHA256', Buffer.from(signingInput), signingKey.privateKeyObject);
    const encodedSignature = this.base64UrlEncode(signature);

    const issuerSignedJwt = `${signingInput}.${encodedSignature}`;
    const disclosureStrings = disclosures.map(d => d.disclosureString).join('~');
    const combinedSDJWT = `${issuerSignedJwt}~${disclosureStrings}~`;

    return {
      combinedSDJWT,
      issuerSignedJwt,
      disclosures,
      payload,
      issuerDid: signingKey.issuer
    };
  }

  /**
   * Verifies an SD-JWT presentation by:
   * 1. Cryptographically verifying the issuer JWT signature with the issuer public key.
   * 2. Checking temporal validity (iat, nbf, exp).
   * 3. Re-computing SHA-256 digests for each presented disclosure and ensuring they match the signed _sd array.
   */
  public static verifySDJWT(
    combinedSDJWT: string,
    issuerPublicKey: crypto.KeyObject
  ): SDJWTVerificationResult {
    const parts = combinedSDJWT.split('~');
    const issuerSignedJwt = parts[0];
    const presentedDisclosures = parts.slice(1).filter(d => d.length > 0);

    const jwtSegments = issuerSignedJwt.split('.');
    if (jwtSegments.length !== 3) {
      return {
        valid: false,
        signatureValid: false,
        disclosuresValid: false,
        notExpired: false,
        issuerDid: '',
        disclosedClaims: {},
        undisclosedDigests: [],
        errorMessage: 'Invalid JWT structure: expected 3 dot-separated segments.'
      };
    }

    const [headerB64, payloadB64, signatureB64] = jwtSegments;
    const signingInput = `${headerB64}.${payloadB64}`;

    // 1. Verify cryptographic signature using the declared and supported JWS algorithm.
    let signatureValid = false;
    try {
      const header = JSON.parse(this.base64UrlDecode(headerB64));
      let sigBase64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
      while (sigBase64.length % 4) sigBase64 += '=';
      const sigBuffer = Buffer.from(sigBase64, 'base64');
      signatureValid = header.alg === 'EdDSA'
        ? Ed25519Crypto.verify(signingInput, sigBuffer, issuerPublicKey)
        : header.alg === 'RS256'
          ? crypto.verify('RSA-SHA256', Buffer.from(signingInput), issuerPublicKey, sigBuffer)
          : false;
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      return {
        valid: false,
        signatureValid: false,
        disclosuresValid: false,
        notExpired: false,
        issuerDid: '',
        disclosedClaims: {},
        undisclosedDigests: [],
        errorMessage: 'Cryptographic signature verification failed on Issuer-signed JWT.'
      };
    }

    // 2. Parse payload and check temporal validity
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(this.base64UrlDecode(payloadB64));
    } catch (e: any) {
      return {
        valid: false,
        signatureValid: true,
        disclosuresValid: false,
        notExpired: false,
        issuerDid: '',
        disclosedClaims: {},
        undisclosedDigests: [],
        errorMessage: `Failed to parse JWT payload: ${e.message}`
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const notExpired = typeof payload.exp === 'number' && now <= payload.exp;
    const notBefore = typeof payload.nbf !== 'number' || now >= payload.nbf;
    if (!notExpired || !notBefore) {
      return {
        valid: false,
        signatureValid: true,
        disclosuresValid: false,
        notExpired: false,
        issuerDid: payload.iss || '',
        disclosedClaims: {},
        undisclosedDigests: payload._sd || [],
        errorMessage: !notExpired
          ? `SD-JWT expired at timestamp ${payload.exp} (current time: ${now}).`
          : `SD-JWT is not valid before timestamp ${payload.nbf} (current time: ${now}).`
      };
    }

    // 3. Verify disclosures and match against _sd array
    const validSDDigests: string[] = Array.isArray(payload._sd) ? payload._sd : [];
    const disclosedClaims: Record<string, any> = {};
    const matchedDigests: string[] = [];

    // Include non-disclosable claims from payload
    for (const [key, value] of Object.entries(payload)) {
      if (!['_sd', '_sd_alg', 'iss', 'sub', 'iat', 'nbf', 'exp', 'cnf'].includes(key)) {
        disclosedClaims[key] = value;
      }
    }

    for (const rawDisclosure of presentedDisclosures) {
      const computedDigest = this.sha256Digest(rawDisclosure);
      if (!validSDDigests.includes(computedDigest) || matchedDigests.includes(computedDigest)) {
        return {
          valid: false,
          signatureValid: true,
          disclosuresValid: false,
          notExpired: true,
          issuerDid: payload.iss || '',
          disclosedClaims: {},
          undisclosedDigests: validSDDigests,
          errorMessage: `Disclosure tamper detected: digest ${computedDigest} is not in the signed _sd list.`
        };
      }

      try {
        const decodedJson = JSON.parse(this.base64UrlDecode(rawDisclosure));
        if (!Array.isArray(decodedJson) || decodedJson.length !== 3 ||
            typeof decodedJson[0] !== 'string' ||
            Buffer.from(decodedJson[0], 'base64url').length < 16 ||
            typeof decodedJson[1] !== 'string' || !decodedJson[1]) {
          throw new Error('Disclosure must contain a 128-bit salt, claim name, and value');
        }
        const [, claimName, claimValue] = decodedJson;
        if (Object.prototype.hasOwnProperty.call(disclosedClaims, claimName)) {
          throw new Error(`Duplicate disclosed claim: ${claimName}`);
        }
        disclosedClaims[claimName] = claimValue;
        matchedDigests.push(computedDigest);
      } catch (err: any) {
        return {
          valid: false,
          signatureValid: true,
          disclosuresValid: false,
          notExpired: true,
          issuerDid: payload.iss || '',
          disclosedClaims: {},
          undisclosedDigests: validSDDigests,
          errorMessage: `Malformed disclosure array: ${err.message}`
        };
      }
    }

    const undisclosedDigests = validSDDigests.filter(d => !matchedDigests.includes(d));

    return {
      valid: true,
      signatureValid: true,
      disclosuresValid: true,
      notExpired: true,
      issuerDid: payload.iss || '',
      disclosedClaims,
      undisclosedDigests
    };
  }
}
