import * as crypto from 'crypto';
import * as fs from 'node:fs';
import { Ed25519Crypto, Ed25519KeyPair } from '../crypto/ed25519';
import { SDJWTCrypto, SDJWTIssuanceResult, SDJWTSigningKey, SDJWTVerificationResult } from '../crypto/sd-jwt';
import { MDocCrypto, MDocIssuanceResult, MDocVerificationResult } from '../crypto/mdoc-cose';
import { W3CVCProtocol, W3CCredential, W3CVerificationResult } from '../protocols/w3c-vc';
import { ProtocolInspector } from '../middleware/inspector';
import { CredentialFormat } from '../types';
import { CertifyService } from './certify.service';
import { FARMER_CONTEXT, FARMER_CONTEXT_URL } from '../context/farmer';

const jsonldSignatures: any = require('jsonld-signatures');
const credentialsContext: any = require('@digitalbazaar/credentials-context');
const securityContext: any = require('@digitalbazaar/security-context');

export class MockExternalService {
  // Deterministic seed for External Mock Issuer so DID and key remain consistent
  private static readonly ISSUER_SEED = Buffer.from('4a9b2c1d8e7f605a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a', 'hex');
  public static readonly issuerKeyPair: Ed25519KeyPair = Ed25519Crypto.fromSeed(MockExternalService.ISSUER_SEED);

  // Deterministic seed for External Mock Verifier
  private static readonly VERIFIER_SEED = Buffer.from('9f8e7d6c5b4a3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b', 'hex');
  public static readonly verifierKeyPair: Ed25519KeyPair = Ed25519Crypto.fromSeed(MockExternalService.VERIFIER_SEED);
  public static readonly holderKeyPair: Ed25519KeyPair = Ed25519Crypto.fromSeed(
    Buffer.from('25b83e1496282d1141ac900d74e083c8c7bb97e99d792dc4264b1fbe34d2a84a', 'hex')
  );
  private static readonly configuredSDJWTSigningKey: SDJWTSigningKey | null = (() => {
    const privateKeyPath = process.env.MOCK_ISSUER_PRIVATE_KEY_PATH;
    const certificatePath = process.env.MOCK_ISSUER_CERTIFICATE_PATH;
    if (!privateKeyPath && !certificatePath) return null;
    if (!privateKeyPath || !certificatePath || !fs.existsSync(privateKeyPath) || !fs.existsSync(certificatePath)) {
      throw new Error('Configured mock issuer certificate and private key must both exist');
    }
    const privateKeyObject = crypto.createPrivateKey(fs.readFileSync(privateKeyPath));
    const certificate = new crypto.X509Certificate(fs.readFileSync(certificatePath));
    const publicKeyObject = certificate.publicKey;
    const derivedKey = crypto.createPublicKey(privateKeyObject).export({ type: 'spki', format: 'der' });
    const certificateKey = publicKeyObject.export({ type: 'spki', format: 'der' });
    if (!Buffer.from(derivedKey).equals(Buffer.from(certificateKey))) {
      throw new Error('Configured mock SD-JWT issuer certificate does not match its private key');
    }
    return {
      issuer: process.env.MOCK_SD_JWT_ISSUER || 'https://mock-issuer.playground/',
      algorithm: 'RS256',
      keyId: 'https://mock-issuer.playground/#issuer-key-1',
      privateKeyObject,
      publicKeyObject,
      x5c: [certificate.raw.toString('base64')]
    };
  })();
  private static readonly offers = new Map<string, {
    code: string; format: CredentialFormat; holderDid: string; subjectData: Record<string, any>;
    createdAt: number; used: boolean;
  }>();
  private static readonly accessTokens = new Map<string, {
    offerId: string; nonce: string; expiresAt: number; used: boolean;
  }>();
  private static readonly vpRequests = new Map<string, {
    nonce: string; clientId: string; format: CredentialFormat; createdAt: number; used: boolean;
  }>();

  private static get publicBaseUrl(): string {
    return (process.env.PLAYGROUND_PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, '');
  }

  public static getSDJWTSigningKey(): SDJWTSigningKey {
    return this.configuredSDJWTSigningKey || {
      issuer: this.issuerKeyPair.did,
      algorithm: 'EdDSA',
      keyId: `${this.issuerKeyPair.did}#key-1`,
      privateKeyObject: this.issuerKeyPair.privateKeyObject,
      publicKeyObject: this.issuerKeyPair.publicKeyObject
    };
  }

  public static createHolderProof(nonce: string): string {
    const jwk = this.holderKeyPair.publicKeyObject.export({ format: 'jwk' });
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'openid4vci-proof+jwt', jwk })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ aud: this.publicBaseUrl, nonce,
      iat: Math.floor(Date.now() / 1000), iss: this.holderKeyPair.did })).toString('base64url');
    const signingInput = `${header}.${payload}`;
    const signature = Ed25519Crypto.sign(signingInput, this.holderKeyPair.privateKeyObject).toString('base64url');
    return `${signingInput}.${signature}`;
  }

  public static createVPRequest(format: CredentialFormat): any {
    if (format !== 'vc+sd-jwt') throw new Error('Local OpenID4VP mock request currently supports SD-JWT VC');
    const requestId = crypto.randomUUID();
    const nonce = crypto.randomBytes(32).toString('base64url');
    const clientId = this.verifierKeyPair.did;
    this.vpRequests.set(requestId, { nonce, clientId, format, createdAt: Date.now(), used: false });
    const responseUri = `${this.publicBaseUrl}/api/verifier/mock/vp-response`;
    const request = {
      request_id: requestId, client_id: clientId, nonce, state: requestId,
      response_uri: responseUri,
      presentation_definition: {
        id: 'sd-jwt-vc-request', input_descriptors: [{ id: 'sd-jwt-vc', format: {
          'vc+sd-jwt': { alg: [this.getSDJWTSigningKey().algorithm] }
        } }]
      }
    };
    const requestHeader = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'oauth-authz-req+jwt',
      kid: `${clientId}#key-1` })).toString('base64url');
    const requestPayload = Buffer.from(JSON.stringify({ ...request, iss: clientId,
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
    const requestSigningInput = `${requestHeader}.${requestPayload}`;
    const requestSignature = Ed25519Crypto.sign(requestSigningInput, this.verifierKeyPair.privateKeyObject).toString('base64url');
    (request as any).request_jwt = `${requestSigningInput}.${requestSignature}`;
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: 'Mock verifier creates nonce-bound authorization request',
      actor: 'VERIFIER', direction: 'RESPONSE', endpoint: `${this.publicBaseUrl}/api/verifier/mock/vp-request`,
      method: 'POST', headers: { 'Content-Type': 'application/json' }, payload: request, status: 201 });
    return request;
  }

  public static createSDJWTKeyBinding(sdJwt: string, nonce: string, audience: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'kb+jwt',
      jwk: this.holderKeyPair.publicKeyObject.export({ format: 'jwk' }) })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      aud: audience, nonce, iat: Math.floor(Date.now() / 1000),
      sd_hash: crypto.createHash('sha256').update(sdJwt, 'ascii').digest('base64url'),
      iss: this.holderKeyPair.did
    })).toString('base64url');
    const signingInput = `${header}.${payload}`;
    const signature = Ed25519Crypto.sign(signingInput, this.holderKeyPair.privateKeyObject).toString('base64url');
    return `${signingInput}.${signature}`;
  }

  public static async submitSDJWTPresentation(params: {
    state: string; vpToken: string; presentationSubmission?: any;
  }): Promise<any> {
    const request = this.vpRequests.get(params.state);
    if (!request || request.used || Date.now() - request.createdAt > 5 * 60_000) {
      throw new Error('Unknown, expired, or already used OpenID4VP state');
    }
    request.used = true;
    const pieces = params.vpToken.split('~');
    const keyBindingJwt = pieces.pop() || '';
    if (!keyBindingJwt || pieces.length < 2) throw new Error('SD-JWT presentation has no key-binding JWT');
    while (pieces.length && pieces[pieces.length - 1] === '') pieces.pop();
    const sdJwt = `${pieces.join('~')}~`;
    const credentialResult = SDJWTCrypto.verifySDJWT(sdJwt, this.getSDJWTSigningKey().publicKeyObject);
    let keyBindingValid = false;
    let keyBindingError = 'Key-binding JWT is invalid';
    try {
      const [headerB64, payloadB64, signatureB64] = keyBindingJwt.split('.');
      if (!headerB64 || !payloadB64 || !signatureB64) throw new Error('Malformed key-binding JWT');
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      const credentialPayload = JSON.parse(Buffer.from(sdJwt.split('.')[1], 'base64url').toString('utf8'));
      const expectedJwk = credentialPayload.cnf?.jwk;
      const presentedJwk = header.jwk;
      const publicKey = presentedJwk && crypto.createPublicKey({ key: presentedJwk, format: 'jwk' });
      const proofValid = publicKey && header.alg === 'EdDSA' && header.typ === 'kb+jwt' &&
        crypto.verify(null, Buffer.from(`${headerB64}.${payloadB64}`), publicKey, Buffer.from(signatureB64, 'base64url'));
      const sameKey = expectedJwk?.x && expectedJwk.x === presentedJwk?.x &&
        expectedJwk?.crv === presentedJwk?.crv && expectedJwk?.kty === presentedJwk?.kty;
      const expectedSdHash = crypto.createHash('sha256').update(sdJwt, 'ascii').digest('base64url');
      const fresh = Number.isFinite(payload.iat) && Math.abs(Date.now() / 1000 - payload.iat) <= 300;
      keyBindingValid = Boolean(credentialResult.valid && proofValid && sameKey && fresh &&
        payload.nonce === request.nonce && payload.aud === request.clientId &&
        payload.sd_hash === expectedSdHash && payload.iss === credentialPayload.sub);
      if (!keyBindingValid) keyBindingError = 'Key-binding proof, nonce, audience, SD-JWT hash, or holder key binding did not match';
    } catch (error: any) {
      keyBindingError = error.message;
    }
    const credential = {
      format: 'vc+sd-jwt', combinedSDJWT: sdJwt,
      issuer: credentialResult.issuerDid,
      issuerImplementation: 'MOCK_EXTERNAL_OID4VCI',
      proof: { type: this.getSDJWTSigningKey().algorithm,
        verificationMethod: this.getSDJWTSigningKey().keyId || `${credentialResult.issuerDid}#key-1` }
    };
    const credentialVerification = credentialResult.valid
      ? await this.verifyPresentation(credential)
      : { valid: false, status: 'TAMPERED', format: 'vc+sd-jwt', error: credentialResult.errorMessage };
    const valid = keyBindingValid && credentialVerification.valid;
    const result = {
      vpResultStatus: valid ? 'SUCCESS' : 'INVALID',
      vcResults: [{ verificationStatus: valid ? 'SUCCESS' : 'INVALID', format: 'vc+sd-jwt',
        error: valid ? undefined : (!credentialResult.valid ? credentialResult.errorMessage : keyBindingError) }],
      presentationDefinitionId: params.presentationSubmission?.definition_id,
      verifier: 'MOCK_EXTERNAL_OID4VP'
    };
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: `Mock verifier processes SD-JWT VP [${result.vpResultStatus}]`,
      actor: 'VERIFIER', direction: 'RESPONSE', endpoint: `${this.publicBaseUrl}/api/verifier/mock/vp-response`,
      method: 'POST', headers: { 'Content-Type': 'application/json' }, payload: result, status: 200 });
    return { valid, requestId: params.state, verifierResult: result, keyBindingValid,
      walletImplementation: 'LOCAL_REFERENCE_WALLET', vpProofType: 'kb+jwt' };
  }

  public static getWellKnownMetadata() {
    const endpoint = `${this.publicBaseUrl}/api/issuer/.well-known`;
    const metadata = {
      credential_issuer: this.publicBaseUrl,
      authorization_servers: [this.publicBaseUrl],
      credential_offer_endpoint: `${this.publicBaseUrl}/api/issuer/credential-offer`,
      credential_endpoint: `${this.publicBaseUrl}/api/issuer/credential`,
      credential_configurations_supported: {
        'SD_JWT_NationalID': {
          format: 'vc+sd-jwt',
          scope: 'national_id_sd_jwt',
          cryptographic_binding_methods_supported: ['did:key', 'did:jwk'],
        credential_signing_alg_values_supported: [this.getSDJWTSigningKey().algorithm],
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
      protocol: 'SYSTEM',
      step: 'Local mock issuer metadata generated',
      actor: 'ISSUER',
      direction: 'INTERNAL',
      endpoint,
      method: 'LOCAL',
      headers: {},
      payload: metadata,
      durationMs: 0
    });

    return metadata;
  }

  public static getAuthorizationServerMetadata(): any {
    return {
      issuer: this.publicBaseUrl,
      token_endpoint: `${this.publicBaseUrl}/api/issuer/oauth/token`,
      grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      token_endpoint_auth_methods_supported: ['none']
    };
  }

  public static createCredentialOffer(params: {
    format: CredentialFormat; subjectData: Record<string, any>;
  }): { credential_offer_uri: string; credential_offer: any } {
    const id = crypto.randomUUID();
    const code = crypto.randomBytes(24).toString('base64url');
    const formatToConfiguration: Record<CredentialFormat, string> = {
      'ldp_vc': 'W3C_StudentDegree', 'vc+sd-jwt': 'SD_JWT_NationalID', 'mso_mdoc': 'ISO_mDL'
    };
    this.offers.set(id, {
      code, format: params.format, holderDid: this.holderKeyPair.did,
      subjectData: params.subjectData, createdAt: Date.now(), used: false
    });
    const credentialOffer = {
      credential_issuer: this.publicBaseUrl,
      credential_configuration_ids: [formatToConfiguration[params.format]],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': code,
          'user_pin_required': false
        }
      }
    };
    const credentialOfferUri = `${this.publicBaseUrl}/api/issuer/credential-offer/${id}`;
    ProtocolInspector.record({ protocol: 'OpenID4VCI', step: 'Issuer creates pre-authorized credential offer',
      actor: 'ISSUER', direction: 'RESPONSE', endpoint: `${this.publicBaseUrl}/api/issuer/credential-offer`,
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      payload: { credential_offer_uri: credentialOfferUri, ...credentialOffer }, status: 201 });
    return { credential_offer_uri: credentialOfferUri, credential_offer: credentialOffer };
  }

  public static getCredentialOffer(id: string): any {
    const offer = this.offers.get(id);
    if (!offer || offer.used || Date.now() - offer.createdAt > 10 * 60_000) {
      throw new Error('Credential offer is missing, expired, or already used');
    }
    const formatToConfiguration: Record<CredentialFormat, string> = {
      'ldp_vc': 'W3C_StudentDegree', 'vc+sd-jwt': 'SD_JWT_NationalID', 'mso_mdoc': 'ISO_mDL'
    };
    const body = {
      credential_issuer: this.publicBaseUrl,
      credential_configuration_ids: [formatToConfiguration[offer.format]],
      grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': offer.code, 'user_pin_required': false
      } }
    };
    ProtocolInspector.record({ protocol: 'OpenID4VCI', step: 'Wallet resolves credential offer',
      actor: 'WALLET', direction: 'REQUEST', endpoint: `${this.publicBaseUrl}/api/issuer/credential-offer/${id}`,
      method: 'GET', headers: { Accept: 'application/json' }, payload: null });
    ProtocolInspector.record({ protocol: 'OpenID4VCI', step: 'Issuer returns credential offer data',
      actor: 'ISSUER', direction: 'RESPONSE', endpoint: `${this.publicBaseUrl}/api/issuer/credential-offer/${id}`,
      method: 'GET', headers: { 'Content-Type': 'application/json' }, payload: body, status: 200 });
    return body;
  }

  public static exchangePreAuthorizedCode(code: string): any {
    const found = [...this.offers.entries()].find(([, offer]) => offer.code === code);
    if (!found || found[1].used || Date.now() - found[1].createdAt > 10 * 60_000) {
      throw new Error('Invalid, expired, or already used pre-authorized code');
    }
    const [offerId] = found;
    const accessToken = crypto.randomBytes(32).toString('base64url');
    const cNonce = crypto.randomBytes(32).toString('base64url');
    this.accessTokens.set(accessToken, { offerId, nonce: cNonce, expiresAt: Date.now() + 5 * 60_000, used: false });
    ProtocolInspector.record({ protocol: 'OpenID4VCI', step: 'Issuer exchanges pre-authorized code for access token',
      actor: 'ISSUER', direction: 'RESPONSE', endpoint: `${this.publicBaseUrl}/api/issuer/oauth/token`,
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      payload: { token_type: 'Bearer', expires_in: 300, c_nonce: cNonce }, status: 200 });
    return { access_token: accessToken, token_type: 'Bearer', expires_in: 300, c_nonce: cNonce };
  }

  public static issueFromToken(accessToken: string, requestedFormat: CredentialFormat, proofJwt: string): any {
    const token = this.accessTokens.get(accessToken);
    const offer = token && this.offers.get(token.offerId);
    if (!token || !offer || token.used || token.expiresAt < Date.now() || offer.used) {
      throw new Error('Invalid, expired, or already used access token');
    }
    if (offer.format !== requestedFormat) throw new Error('Requested format does not match the offered credential configuration');
    const [headerPart, payloadPart, signaturePart] = proofJwt.split('.');
    if (!headerPart || !payloadPart || !signaturePart) throw new Error('Credential proof JWT is malformed');
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (header.alg !== 'EdDSA' || header.typ !== 'openid4vci-proof+jwt' || !header.jwk ||
        payload.aud !== this.publicBaseUrl || payload.nonce !== token.nonce ||
        !Number.isFinite(payload.iat) || Math.abs(Date.now() / 1000 - payload.iat) > 300 ||
        payload.iss !== this.holderKeyPair.did) {
      throw new Error('Credential proof is missing the required algorithm, audience, nonce, time, or holder binding');
    }
    const publicKey = crypto.createPublicKey({ key: header.jwk, format: 'jwk' });
    const signature = Buffer.from(signaturePart, 'base64url');
    if (!crypto.verify(null, Buffer.from(`${headerPart}.${payloadPart}`), publicKey, signature) ||
        !publicKey.export({ format: 'jwk' }).x ||
        publicKey.export({ format: 'jwk' }).x !== this.holderKeyPair.publicKeyObject.export({ format: 'jwk' }).x) {
      throw new Error('Credential proof signature or holder key binding is invalid');
    }
    token.used = true;
    offer.used = true;
    const credential = this.issueCredential({
      format: requestedFormat, holderDid: offer.holderDid,
      subjectData: offer.subjectData
    });
    ProtocolInspector.record({ protocol: 'OpenID4VCI', step: 'Issuer returns credential after proof validation',
      actor: 'ISSUER', direction: 'RESPONSE', endpoint: `${this.publicBaseUrl}/api/issuer/credential`,
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      payload: { format: requestedFormat, credentialId: credential.id, holderDid: offer.holderDid }, status: 200 });
    return { format: requestedFormat, credential };
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
        signingKey: this.getSDJWTSigningKey(),
        holderDid: params.holderDid,
        holderPublicJwk: this.holderKeyPair.publicKeyObject.export({ format: 'jwk' }) as Record<string, string>,
        claims,
        disclosableClaimKeys: ['nationalId', 'birthdate', 'residentCountry']
      });

      credentialResult = {
        id: `urn:uuid:${crypto.randomUUID()}`,
        format: 'vc+sd-jwt',
        type: ['VerifiableCredential', 'SDJWTCredential'],
        issuer: issuance.issuerDid,
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
          type: this.getSDJWTSigningKey().algorithm === 'EdDSA' ? 'EdDSA' : 'RS256',
          alg: this.getSDJWTSigningKey().algorithm,
          verificationMethod: this.getSDJWTSigningKey().keyId || `${this.issuerKeyPair.did}#key-1`
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
      protocol: 'SYSTEM',
      step: `Local mock cryptographic issuance [${params.format}]`,
      actor: 'ISSUER',
      direction: 'INTERNAL',
      endpoint: 'local:MockExternalService.issueCredential',
      method: 'LOCAL',
      headers: {},
      payload: { credentialId: credentialResult.id, format: params.format },
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
      protocol: 'SYSTEM',
      step: 'Local mock verifier: checking credential',
      actor: 'VERIFIER',
      direction: 'INTERNAL',
      endpoint: 'local:MockExternalService.verifyPresentation',
      method: 'LOCAL',
      headers: {},
      payload: { id: presentedCredential.id, format },
    });

    const issuerDid: string = presentedCredential.issuer || '';
    if (issuerDid.includes('certify-nginx') || presentedCredential.issuerImplementation === 'INJI_CERTIFY') {
      return this.verifyCertifyCredential(presentedCredential, start);
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
        this.getSDJWTSigningKey().publicKeyObject
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
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString()
    };

    ProtocolInspector.record({
      protocol: 'SYSTEM',
      step: `Local mock verifier: cryptographic check [${actualStatus}]`,
      actor: 'VERIFIER',
      direction: 'INTERNAL',
      endpoint: 'local:MockExternalService.verifyPresentation',
      method: 'LOCAL',
      headers: {},
      payload: verificationResult,
      durationMs: verificationResult.durationMs
    });

    return verificationResult;
  }

  private static async verifyCertifyCredential(credential: any, start: number): Promise<any> {
    if (credential.format !== 'ldp_vc' || !credential.proof) {
      throw new Error('Independent Certify verification requires a signed JSON-LD credential');
    }
    const didDocument = await CertifyService.getDidDocument();
    const method = didDocument.verificationMethod?.find((item: any) => item.id === credential.proof.verificationMethod);
    if (!method || didDocument.id !== credential.issuer) {
      throw new Error('Certify DID document does not contain the issuer or proof verification method');
    }
    const dynamicImport = new Function('name', 'return import(name)') as (name: string) => Promise<any>;
    const { Ed25519Signature2020, suiteContext } = await dynamicImport('@digitalbazaar/ed25519-signature-2020');
    const documentLoader = async (url: string) => {
      const document = url === didDocument.id ? didDocument : url === method.id ? method :
        url === FARMER_CONTEXT_URL ? FARMER_CONTEXT :
          suiteContext.contexts.get(url) || credentialsContext.contexts.get(url) || securityContext.contexts.get(url);
      if (!document) throw new Error(`Unpinned JSON-LD context or DID URL: ${url}`);
      return { contextUrl: null, documentUrl: url, document };
    };
    const { format, issuerImplementation, ...signedCredential } = credential;
    const checked = await jsonldSignatures.verify(signedCredential, {
      suite: new Ed25519Signature2020(),
      purpose: new jsonldSignatures.purposes.AssertionProofPurpose(),
      documentLoader
    });
    const errorMessage = checked.error?.errors?.map((error: Error) => error.message).join('; ') ||
      checked.error?.message;
    const notExpired = !credential.expirationDate || Date.parse(credential.expirationDate) >= Date.now();
    const valid = Boolean(checked.verified && notExpired);
    const result = {
      valid, status: valid ? 'VALID' : !notExpired ? 'EXPIRED' : 'INVALID', format: 'ldp_vc',
      verifier: 'MOCK_EXTERNAL_OID4VP',
      cryptographicCheck: { signatureValid: checked.verified ? true : null,
        signatureSuite: credential.proof.type, issuerDid: credential.issuer,
        tamperDetected: checked.verified ? false : null,
        message: errorMessage || (valid ? 'JSON-LD proof and assertion relationship verified' : 'Proof verification failed') },
      claimsCheck: { issuerTrusted: checked.verified, subjectMatched: null, notExpired,
        claims: valid ? credential.credentialSubject : {} },
      durationMs: Date.now() - start, timestamp: new Date().toISOString()
    };
    ProtocolInspector.record({ protocol: 'SYSTEM', step: `Independent Certify JSON-LD verification [${result.status}]`,
      actor: 'VERIFIER', direction: 'INTERNAL', endpoint: 'local:MockExternalService.verifyCertifyCredential',
      method: 'LOCAL', headers: {}, payload: result, durationMs: result.durationMs });
    return result;
  }
}
