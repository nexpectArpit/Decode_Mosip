/**
 * Independent W3C Verifiable Presentation verifier.
 *
 * This module verifies VP proofs WITHOUT relying on Java's java.net.URI parser,
 * which rejects the malformed `did:jwk:…#0#0` URIs emitted by Inji Mobile
 * 1.0.0-alpha.1. It:
 *
 * 1. Extracts the public key from `did:jwk` (tolerating double-fragment `#0#0`)
 * 2. Verifies the VP's linked-data proof (URDNA2015 canonicalization + JWS/proofValue)
 * 3. Checks holder binding (holder DID ≈ proof verificationMethod controller)
 * 4. Validates the proof challenge against the expected nonce
 *
 * The signed VP data is NEVER modified. Only key resolution is made fragment-tolerant.
 */

import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// did:jwk key resolution — fragment-tolerant
// ---------------------------------------------------------------------------

export interface ResolvedKey {
  /** The raw public key as a Node.js KeyObject. */
  publicKey: crypto.KeyObject;
  /** The DID method used (e.g. 'did:jwk', 'did:key'). */
  method: string;
  /** The base DID (without fragment). */
  baseDid: string;
  /** The JWK algorithm (e.g. 'ES256', 'EdDSA'). */
  algorithm: string;
  /** Number of '#' characters found in the original URI. */
  fragmentCount: number;
}

/**
 * Resolve a `did:jwk:…` or `did:jwk:…#0` or `did:jwk:…#0#0` verification method
 * to an actual public key. This handles the known Inji Mobile double-fragment bug.
 *
 * Per the did:jwk spec, a did:jwk always has exactly one key at fragment `#0`.
 * The base64url-encoded JWK is the method-specific-id. We extract it by splitting
 * on '#' and taking the first segment after 'did:jwk:'.
 */
export function resolveDidJwkKey(didUrl: string): ResolvedKey {
  if (typeof didUrl !== 'string') throw new Error('resolveDidJwkKey: DID URL must be a string');
  const fragmentCount = (didUrl.match(/#/g) || []).length;
  const fragment = didUrl.slice(didUrl.indexOf('#') < 0 ? didUrl.length : didUrl.indexOf('#'));
  if (fragment !== '' && fragment !== '#0' && fragment !== '#0#0') {
    throw new Error('resolveDidJwkKey: unsupported verification method fragment');
  }
  const baseDid = didUrl.slice(0, didUrl.length - fragment.length);

  if (!baseDid.startsWith('did:jwk:')) {
    throw new Error(`resolveDidJwkKey: expected did:jwk method, got: ${baseDid.slice(0, 30)}`);
  }

  // Extract the base64url-encoded JWK from the method-specific-id
  const methodSpecificId = baseDid.slice('did:jwk:'.length);
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(methodSpecificId)) {
    throw new Error('resolveDidJwkKey: invalid method-specific-id');
  }

  let jwk: any;
  try {
    const bytes = Buffer.from(methodSpecificId, 'base64url');
    if (bytes.toString('base64url') !== methodSpecificId) throw new Error('non-canonical base64url');
    const decoded = bytes.toString('utf8');
    jwk = JSON.parse(decoded);
  } catch (err: any) {
    throw new Error(`resolveDidJwkKey: failed to decode JWK from DID: ${err.message}`);
  }

  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk) || !jwk.kty) {
    throw new Error('resolveDidJwkKey: decoded JWK has no kty');
  }
  if ('d' in jwk || 'p' in jwk || 'q' in jwk) {
    throw new Error('resolveDidJwkKey: DID contains private key material');
  }

  let algorithm: string;
  let publicKey: crypto.KeyObject;

  if (jwk.kty === 'EC' && jwk.crv === 'P-256') {
    algorithm = 'ES256';
    // Import the JWK as a public key (strip private key fields)
    const pubJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    publicKey = crypto.createPublicKey({ key: pubJwk, format: 'jwk' });
  } else if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    algorithm = 'EdDSA';
    const pubJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
    publicKey = crypto.createPublicKey({ key: pubJwk, format: 'jwk' });
  } else if (jwk.kty === 'EC' && jwk.crv === 'secp256k1') {
    algorithm = 'ES256K';
    const pubJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    publicKey = crypto.createPublicKey({ key: pubJwk, format: 'jwk' });
  } else {
    throw new Error(`resolveDidJwkKey: unsupported key type ${jwk.kty}/${jwk.crv}`);
  }

  return { publicKey, method: 'did:jwk', baseDid, algorithm, fragmentCount };
}

// ---------------------------------------------------------------------------
// JWS verification for JsonWebSignature2020 (detached payload)
// ---------------------------------------------------------------------------

/**
 * Verify a JsonWebSignature2020 detached JWS proof.
 *
 * In JsonWebSignature2020, the proof has a `jws` field containing a compact JWS
 * with an empty (detached) payload: `header..signature`. The payload that was
 * signed is the concatenation of SHA-256(proofOptions) + SHA-256(document),
 * exactly as in Ed25519Signature2020 but with a JWS wrapper.
 */
export function verifyJsonWebSignature2020(params: {
  jws: string;
  signingInput: Buffer;
  publicKey: crypto.KeyObject;
  expectedAlgorithm: string;
}): { valid: boolean; error?: string } {
  const { jws, signingInput, publicKey, expectedAlgorithm } = params;

  // Parse the compact JWS: header..signature (detached payload)
  const parts = jws.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: `JWS has ${parts.length} parts, expected 3` };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (payloadB64 !== '' || !/^[A-Za-z0-9_-]+$/.test(headerB64) ||
      !/^[A-Za-z0-9_-]+$/.test(signatureB64)) {
    return { valid: false, error: 'JWS must contain a detached payload and canonical base64url parts' };
  }

  // Verify the header
  let header: any;
  try {
    const bytes = Buffer.from(headerB64, 'base64url');
    if (bytes.toString('base64url') !== headerB64 ||
        Buffer.from(signatureB64, 'base64url').toString('base64url') !== signatureB64) {
      return { valid: false, error: 'JWS header or signature is not canonical base64url' };
    }
    header = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { valid: false, error: 'Failed to decode JWS header' };
  }

  if (header.alg !== expectedAlgorithm) {
    return { valid: false, error: `JWS algorithm ${header.alg} does not match expected ${expectedAlgorithm}` };
  }

  // For JsonWebSignature2020, b64 MUST be false and listed in crit
  if (header.b64 !== false || !Array.isArray(header.crit) ||
      header.crit.length !== 1 || header.crit[0] !== 'b64') {
    return { valid: false, error: 'JsonWebSignature2020 requires b64:false in crit' };
  }

  // The detached payload is the raw signing input bytes (not base64url-encoded)
  // The JWS signing input is: ASCII(header) || '.' || payload_bytes
  const headerBytes = Buffer.from(headerB64, 'ascii');
  const dotByte = Buffer.from('.', 'ascii');
  const jwsSigningInput = Buffer.concat([headerBytes, dotByte, signingInput]);

  // Decode the signature
  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signatureB64, 'base64url');
  } catch {
    return { valid: false, error: 'Failed to decode JWS signature' };
  }

  // Verify using the appropriate algorithm
  try {
    let valid: boolean;
    if (expectedAlgorithm === 'ES256') {
      // ES256 uses SHA-256 + ECDSA P-256. The JWS signature is in IEEE P1363 format (r||s, 64 bytes).
      // Node.js crypto.verify with 'SHA256' and EC keys expects DER format.
      const derSignature = ieeeP1363ToDer(signatureBytes);
      valid = crypto.verify('SHA256', jwsSigningInput, publicKey, derSignature);
    } else if (expectedAlgorithm === 'EdDSA') {
      valid = crypto.verify(null, jwsSigningInput, publicKey, signatureBytes);
    } else {
      return { valid: false, error: `Unsupported JWS algorithm: ${expectedAlgorithm}` };
    }
    return { valid };
  } catch (err: any) {
    return { valid: false, error: `Signature verification threw: ${err.message}` };
  }
}

/**
 * Convert an IEEE P1363 ECDSA signature (r || s, fixed-length) to DER format.
 * ES256 uses 32-byte r and s values (P-256 curve order is 256 bits).
 */
function ieeeP1363ToDer(sig: Buffer): Buffer {
  if (sig.length !== 64) {
    throw new Error(`Expected 64-byte P1363 signature, got ${sig.length}`);
  }
  const r = sig.subarray(0, 32);
  const s = sig.subarray(32, 64);

  const encodeInt = (value: Buffer): Buffer => {
    // DER integer: strip leading zeros but keep one zero if high bit set
    let start = 0;
    while (start < value.length - 1 && value[start] === 0) start++;
    const trimmed = value.subarray(start);
    const needsPad = trimmed[0] & 0x80;
    const len = trimmed.length + (needsPad ? 1 : 0);
    const result = Buffer.alloc(2 + len);
    result[0] = 0x02; // INTEGER tag
    result[1] = len;
    if (needsPad) {
      result[2] = 0x00;
      trimmed.copy(result, 3);
    } else {
      trimmed.copy(result, 2);
    }
    return result;
  };

  const rDer = encodeInt(r);
  const sDer = encodeInt(s);
  const seqLen = rDer.length + sDer.length;
  const der = Buffer.alloc(2 + seqLen);
  der[0] = 0x30; // SEQUENCE tag
  der[1] = seqLen;
  rDer.copy(der, 2);
  sDer.copy(der, 2 + rDer.length);
  return der;
}

// ---------------------------------------------------------------------------
// Full VP verification
// ---------------------------------------------------------------------------

export interface VPVerificationResult {
  /** Whether the VP proof is cryptographically valid. */
  valid: boolean;
  /** Human-readable explanation of the result. */
  message: string;
  /** Detailed check results. */
  checks: {
    proofSignatureValid: boolean;
    holderBindingValid: boolean;
    nonceValid: boolean;
    proofType: string;
    algorithm: string;
    fragmentCount: number;
    holderDid: string;
    verificationMethodDid: string;
  };
  /** The VC(s) contained in the VP. Only populated on success. */
  verifiableCredentials?: any[];
  /** Error details if verification failed. */
  error?: string;
}

/**
 * Verify a W3C Verifiable Presentation with full cryptographic proof checking.
 *
 * This function:
 * 1. Extracts the VP proof and holder
 * 2. Resolves the verification method key from did:jwk (fragment-tolerant)
 * 3. Recomputes the signing input (SHA-256 hash of proof options + document)
 * 4. Verifies the JWS or proofValue signature
 * 5. Checks that the holder DID matches the proof controller
 * 6. Validates the proof challenge against the expected nonce
 */
export async function verifyPresentation(params: {
  vp: any;
  expectedNonce: string;
  expectedDomain?: string;
  documentLoader?: (url: string) => Promise<{ contextUrl: string | null; documentUrl: string; document: any }>;
}): Promise<VPVerificationResult> {
  const { vp, expectedNonce, expectedDomain } = params;

  // Basic structure validation
  if (!vp || typeof vp !== 'object') {
    return failure('VP is not a valid object');
  }

  if (Array.isArray(vp.proof) && vp.proof.length !== 1) {
    return failure('VP must contain exactly one proof for this verifier');
  }
  const holder = typeof vp.holder === 'string' ? vp.holder : undefined;
  const proof = Array.isArray(vp.proof) ? vp.proof[0] : vp.proof;
  if (!proof || typeof proof !== 'object') {
    return failure('VP has no proof');
  }

  const proofType = proof.type;
  const verificationMethod = proof.verificationMethod;
  if (typeof verificationMethod !== 'string') {
    return failure('VP proof has no verificationMethod');
  }
  if (!(verificationMethod.endsWith('#0') || verificationMethod.endsWith('#0#0'))) {
    return failure('VP proof does not identify the did:jwk #0 key');
  }
  // Inji Mobile 1.0.0-alpha.1 omits proofPurpose in its LDP VP proof model.
  // The challenge, domain, signature, and holder key are checked below.
  if (proof.proofPurpose != null && proof.proofPurpose !== 'authentication') {
    return failure('VP proof purpose is not authentication');
  }

  // Resolve the public key from the verification method
  // This is the fragment-tolerant part: it handles did:jwk:…#0#0
  let resolved: ResolvedKey;
  try {
    resolved = resolveDidJwkKey(verificationMethod);
  } catch (err: any) {
    return failure(`Key resolution failed: ${err.message}`);
  }

  // Check holder binding: the holder DID base should match the proof method base
  const holderBase = holder ? holder.split('#')[0] : undefined;
  const methodBase = resolved.baseDid;
  const holderBindingValid = holderBase === methodBase &&
    (holder === methodBase || holder === `${methodBase}#0` || holder === `${methodBase}#0#0`);

  // Validate nonce
  const challenge = proof.challenge;
  const nonceValid = typeof challenge === 'string' && challenge === expectedNonce;

  // Validate domain (if provided)
  if (expectedDomain && proof.domain !== expectedDomain) {
    return failureWithChecks('Proof domain does not match expected domain', {
      proofSignatureValid: false, holderBindingValid, nonceValid,
      proofType, algorithm: resolved.algorithm, fragmentCount: resolved.fragmentCount,
      holderDid: holder || '', verificationMethodDid: verificationMethod
    });
  }

  if (!nonceValid) {
    return failureWithChecks(
      `Nonce mismatch: proof challenge ${challenge ? `"${challenge}"` : '(missing)'} vs expected "${expectedNonce}"`,
      { proofSignatureValid: false, holderBindingValid, nonceValid: false,
        proofType, algorithm: resolved.algorithm, fragmentCount: resolved.fragmentCount,
        holderDid: holder || '', verificationMethodDid: verificationMethod }
    );
  }

  // Build the signing input using jsonld-signatures compatible canonicalization.
  // For linked-data proofs, the signing input is:
  //   SHA-256(canonicalize(proofOptions)) || SHA-256(canonicalize(document))
  // where proofOptions excludes jws/proofValue/signatureValue and document excludes proof.
  let signingInput: Buffer;
  try {
    signingInput = await computeLinkedDataSigningInput(vp, proof, params.documentLoader);
  } catch (err: any) {
    return failureWithChecks(`Failed to compute signing input: ${err.message}`, {
      proofSignatureValid: false, holderBindingValid, nonceValid,
      proofType, algorithm: resolved.algorithm, fragmentCount: resolved.fragmentCount,
      holderDid: holder || '', verificationMethodDid: verificationMethod
    });
  }

  // Verify the signature
  let proofSignatureValid = false;
  let sigError: string | undefined;

  if (proofType === 'JsonWebSignature2020' && typeof proof.jws === 'string') {
    const result = verifyJsonWebSignature2020({
      jws: proof.jws, signingInput, publicKey: resolved.publicKey,
      expectedAlgorithm: resolved.algorithm
    });
    proofSignatureValid = result.valid;
    sigError = result.error;
  } else if (proofType === 'Ed25519Signature2020' && typeof proof.proofValue === 'string') {
    // Ed25519Signature2020 uses multibase-encoded raw signature
    try {
      const bs58 = require('bs58');
      const sigStr = proof.proofValue.startsWith('z') ? proof.proofValue.slice(1) : proof.proofValue;
      const sigBytes = Buffer.from(bs58.decode(sigStr));
      proofSignatureValid = crypto.verify(null, signingInput, resolved.publicKey, sigBytes);
    } catch (err: any) {
      sigError = `Ed25519 signature verification threw: ${err.message}`;
    }
  } else {
    sigError = `Unsupported proof type/format: ${proofType}, jws=${typeof proof.jws}, proofValue=${typeof proof.proofValue}`;
  }

  const checks = {
    proofSignatureValid, holderBindingValid, nonceValid,
    proofType: proofType || 'unknown',
    algorithm: resolved.algorithm,
    fragmentCount: resolved.fragmentCount,
    holderDid: holder || '',
    verificationMethodDid: verificationMethod
  };

  if (!proofSignatureValid) {
    return {
      valid: false,
      message: sigError || 'VP proof signature verification failed',
      checks,
      error: sigError
    };
  }

  if (!holderBindingValid) {
    return {
      valid: false,
      message: 'Holder binding check failed: holder DID does not match proof verification method controller',
      checks,
      error: 'holder_binding_failed'
    };
  }

  // Success!
  const verifiableCredentials = Array.isArray(vp.verifiableCredential) ? vp.verifiableCredential : [];
  return {
    valid: true,
    message: `VP proof verified successfully (${proofType}/${resolved.algorithm}, ${resolved.fragmentCount} fragment(s) in method)`,
    checks,
    verifiableCredentials
  };
}

// ---------------------------------------------------------------------------
// Linked-data signing input computation
// ---------------------------------------------------------------------------

/**
 * Compute the linked-data signing input for a VP proof.
 *
 * Uses jsonld-signatures' URDNA2015 canonicalization via the same library
 * already used by the local reference wallet. The result is:
 *   SHA-256(canonicalize(proofOptions)) || SHA-256(canonicalize(document))
 */
async function computeLinkedDataSigningInput(
  vp: any,
  proof: any,
  documentLoader?: (url: string) => Promise<{ contextUrl: string | null; documentUrl: string; document: any }>
): Promise<Buffer> {
  // Linked-data proof verification must fail if RDF canonicalization is unavailable.
  const jsonld: any = require('jsonld');

  // Load pinned JSON-LD contexts
  const securityContext: any = require('@digitalbazaar/security-context');
  const credentialsContext: any = require('@digitalbazaar/credentials-context');
  const ed25519SuiteContext: any = require('@digitalbazaar/ed25519-signature-2020').suiteContext;
  const { FARMER_CONTEXT, FARMER_CONTEXT_URL } = require('../context/farmer');

  const loader = documentLoader || (async (url: string) => {
    // did:jwk DID document resolution (fragment-tolerant)
    if (url.startsWith('did:jwk:')) {
      const baseDid = url.split('#')[0];
      resolveDidJwkKey(url);
      const jwkEncoded = baseDid.slice('did:jwk:'.length);
      const jwk = JSON.parse(Buffer.from(jwkEncoded, 'base64url').toString('utf8'));
      const didDocument = {
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/suites/jws-2020/v1'
        ],
        id: baseDid,
        verificationMethod: [{
          id: `${baseDid}#0`,
          type: 'JsonWebKey2020',
          controller: baseDid,
          publicKeyJwk: jwk
        }],
        authentication: [`${baseDid}#0`],
        assertionMethod: [`${baseDid}#0`]
      };
      return { contextUrl: null, documentUrl: url, document: didDocument };
    }

    // Pinned contexts
    const document = url === FARMER_CONTEXT_URL ? FARMER_CONTEXT
      : credentialsContext?.contexts?.get(url)
      || ed25519SuiteContext?.contexts?.get(url)
      || securityContext?.contexts?.get(url);
    if (document) return { contextUrl: null, documentUrl: url, document };

    // Well-known JSON-LD contexts
    if (url === 'https://www.w3.org/ns/did/v1') {
      return { contextUrl: null, documentUrl: url, document: { '@context': { '@version': 1.1, id: '@id', type: '@type' } } };
    }
    if (url === 'https://w3id.org/security/suites/jws-2020/v1') {
      return {
        contextUrl: null, documentUrl: url,
        document: {
          '@context': {
            '@version': 1.1,
            id: '@id', type: '@type',
            JsonWebSignature2020: 'https://w3id.org/security#JsonWebSignature2020',
            JsonWebKey2020: 'https://w3id.org/security#JsonWebKey2020',
            publicKeyJwk: { '@id': 'https://w3id.org/security#publicKeyJwk', '@type': '@json' },
            jws: 'https://w3id.org/security#jws',
            verificationMethod: { '@id': 'https://w3id.org/security#verificationMethod', '@type': '@id' },
            challenge: 'https://w3id.org/security#challenge',
            domain: 'https://w3id.org/security#domain',
            created: { '@id': 'http://purl.org/dc/terms/created', '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
            proofPurpose: { '@id': 'https://w3id.org/security#proofPurpose', '@type': '@vocab', '@context': {
              '@version': 1.1, id: '@id', type: '@type',
              authentication: 'https://w3id.org/security#authenticationMethod',
              assertionMethod: 'https://w3id.org/security#assertionMethod'
            } },
            proof: { '@id': 'https://w3id.org/security#proof', '@type': '@id', '@container': '@graph' }
          }
        }
      };
    }

    throw new Error(`Unresolvable JSON-LD context: ${url}`);
  });

  // Separate document and proof options
  const { proof: _proof, ...docWithoutProof } = vp;
  const { jws: _j, proofValue: _pv, signatureValue: _sv, ...proofOptions } = proof;

  // Add @context to proof options for proper canonicalization
  const proofWithContext = { '@context': vp['@context'], ...proofOptions };

  // Canonicalize using URDNA2015 (RDF Dataset Canonicalization Algorithm)
  const canonicalizedProof = await jsonld.canonize(proofWithContext, {
    algorithm: 'URDNA2015', format: 'application/n-quads', documentLoader: loader
  });
  const canonicalizedDoc = await jsonld.canonize(docWithoutProof, {
    algorithm: 'URDNA2015', format: 'application/n-quads', documentLoader: loader
  });

  const proofHash = crypto.createHash('sha256').update(canonicalizedProof).digest();
  const docHash = crypto.createHash('sha256').update(canonicalizedDoc).digest();

  return Buffer.concat([proofHash, docHash]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function failure(msg: string): VPVerificationResult {
  return {
    valid: false, message: msg,
    checks: {
      proofSignatureValid: false, holderBindingValid: false, nonceValid: false,
      proofType: 'unknown', algorithm: 'unknown', fragmentCount: 0,
      holderDid: '', verificationMethodDid: ''
    },
    error: msg
  };
}

function failureWithChecks(msg: string, checks: VPVerificationResult['checks']): VPVerificationResult {
  return { valid: false, message: msg, checks, error: msg };
}
