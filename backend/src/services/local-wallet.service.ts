import * as crypto from 'node:crypto';
import { VerifyService } from './verify.service';
import { FARMER_CONTEXT, FARMER_CONTEXT_URL } from '../context/farmer';
import { CredentialFormat } from '../types';
import { MockExternalService } from './mock-external.service';
import { ProtocolInspector } from '../middleware/inspector';
import { currentFlowId } from '../middleware/flow-context';
import { Ed25519Crypto } from '../crypto/ed25519';

const jsonldSignatures: any = require('jsonld-signatures');
const credentialsContext: any = require('@digitalbazaar/credentials-context');
const securityContext: any = require('@digitalbazaar/security-context');

/** A local reference wallet used to exercise Verify's HTTP OpenID4VP transport. */
export class LocalWalletService {
  private static keyPairPromise: Promise<any> | undefined;

  private static async getKeyPair(): Promise<any> {
    if (!this.keyPairPromise) {
      this.keyPairPromise = (async () => {
        // These linked-data suite packages are ESM; preserve native import in the CommonJS backend.
        const dynamicImport = new Function('name', 'return import(name)') as (name: string) => Promise<any>;
        const { Ed25519VerificationKey2020 } = await dynamicImport('@digitalbazaar/ed25519-verification-key-2020');
        const keyPair = await Ed25519VerificationKey2020.generate();
        const did = `did:key:${keyPair.fingerprint()}`;
        keyPair.controller = did;
        keyPair.id = `${did}#${keyPair.fingerprint()}`;
        return keyPair;
      })();
    }
    return this.keyPairPromise;
  }

  /** Obtain a credential by acting as a wallet in the mock issuer's OID4VCI pre-authorized-code flow. */
  public static async obtainMockCredential(params: {
    format: CredentialFormat; subjectData: Record<string, any>;
  }): Promise<any> {
    const baseUrl = (process.env.PLAYGROUND_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 4000}`).replace(/\/$/, '');
    const publicBaseUrl = (process.env.PLAYGROUND_PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, '');
    const flowId = currentFlowId();
    const protocolHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (flowId) protocolHeaders['X-Playground-Flow-Id'] = flowId;
    const internalizeIssuerUrl = (value: string): string => {
      const parsed = new URL(value);
      if (parsed.origin !== new URL(publicBaseUrl).origin) throw new Error('Issuer metadata advertised an unexpected endpoint origin');
      return `${baseUrl}${parsed.pathname}${parsed.search}`;
    };
    const recordWalletRequest = (step: string, endpoint: string, method: string, payload: unknown) =>
      ProtocolInspector.record({ protocol: 'OpenID4VCI', step, actor: 'WALLET', direction: 'REQUEST',
        endpoint, method, headers: { 'Content-Type': 'application/json' }, payload });
    const recordWalletResponse = (step: string, endpoint: string, method: string, payload: unknown, status: number) =>
      ProtocolInspector.record({ protocol: 'OpenID4VCI', step, actor: 'WALLET', direction: 'RESPONSE',
        endpoint, method, headers: { 'Content-Type': 'application/json' }, payload, status });

    const metadataEndpoint = `${baseUrl}/api/issuer/.well-known/openid-credential-issuer`;
    recordWalletRequest('Wallet discovers issuer metadata', metadataEndpoint, 'GET', null);
    const metadataResponse = await fetch(metadataEndpoint, { headers: { Accept: 'application/json', ...protocolHeaders } });
    const metadata: any = await metadataResponse.json();
    recordWalletResponse('Wallet receives issuer metadata', metadataEndpoint, 'GET', metadata, metadataResponse.status);
    if (!metadataResponse.ok || metadata.credential_issuer !== publicBaseUrl || !metadata.credential_offer_endpoint ||
        !metadata.credential_endpoint || !Array.isArray(metadata.authorization_servers) || !metadata.authorization_servers.length) {
      throw new Error('Issuer metadata is incomplete or does not match the configured issuer');
    }

    const authorizationServer = new URL(metadata.authorization_servers[0]);
    if (authorizationServer.origin !== new URL(publicBaseUrl).origin) throw new Error('Authorization server origin is not trusted by this reference wallet');
    const asMetadataEndpoint = `${baseUrl}/api/issuer/.well-known/oauth-authorization-server`;
    recordWalletRequest('Wallet discovers authorization server metadata', asMetadataEndpoint, 'GET', null);
    const asMetadataResponse = await fetch(asMetadataEndpoint, { headers: { Accept: 'application/json', ...protocolHeaders } });
    const asMetadata: any = await asMetadataResponse.json();
    recordWalletResponse('Wallet receives authorization server metadata', asMetadataEndpoint, 'GET', asMetadata, asMetadataResponse.status);
    if (!asMetadataResponse.ok || asMetadata.issuer !== authorizationServer.origin || !asMetadata.token_endpoint ||
        !asMetadata.grant_types_supported?.includes('urn:ietf:params:oauth:grant-type:pre-authorized_code')) {
      throw new Error('Authorization server metadata is incomplete or does not match its advertised issuer');
    }

    const offerEndpoint = internalizeIssuerUrl(metadata.credential_offer_endpoint);
    const offerRequest = { format: params.format, subjectData: params.subjectData };
    recordWalletRequest('Wallet requests OpenID4VCI credential offer', offerEndpoint, 'POST', offerRequest);
    const offerResponse = await fetch(offerEndpoint, {
      method: 'POST', headers: protocolHeaders, body: JSON.stringify(offerRequest)
    });
    const offerData: any = await offerResponse.json();
    recordWalletResponse('Wallet receives credential offer URI', offerEndpoint, 'POST', offerData, offerResponse.status);
    if (!offerResponse.ok || !offerData.credential_offer_uri) throw new Error(offerData.error || 'Issuer did not return an offer URI');

    const offerUri = new URL(offerData.credential_offer_uri);
    if (offerUri.origin !== new URL(publicBaseUrl).origin || !offerUri.pathname.startsWith('/api/issuer/credential-offer/')) {
      throw new Error('Issuer returned an unexpected credential offer origin or path');
    }
    const offerDetailEndpoint = `${baseUrl}${offerUri.pathname}`;
    recordWalletRequest('Wallet resolves credential offer data', offerDetailEndpoint, 'GET', null);
    const offerDetailResponse = await fetch(offerDetailEndpoint, { headers: { Accept: 'application/json' } });
    const offer: any = await offerDetailResponse.json();
    recordWalletResponse('Wallet receives credential offer data', offerDetailEndpoint, 'GET', offer, offerDetailResponse.status);
    if (!offerDetailResponse.ok) throw new Error(offer.error || 'Credential offer could not be resolved');

    const preAuthCode = offer.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code'];
    if (typeof preAuthCode !== 'string' || !preAuthCode) throw new Error('Credential offer has no pre-authorized code');
    const tokenEndpoint = internalizeIssuerUrl(asMetadata.token_endpoint);
    const tokenBody = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': preAuthCode
    });
    recordWalletRequest('Wallet exchanges pre-authorized code for access token', tokenEndpoint, 'POST', {
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code', 'pre-authorized_code': '[REDACTED]'
    });
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST', headers: { ...protocolHeaders, 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody
    });
    const token: any = await tokenResponse.json();
    recordWalletResponse('Wallet receives access token and c_nonce', tokenEndpoint, 'POST', {
      token_type: token.token_type, expires_in: token.expires_in, c_nonce: token.c_nonce
    }, tokenResponse.status);
    if (!tokenResponse.ok || !token.access_token || !token.c_nonce) throw new Error(token.error_description || 'Token exchange failed');

    const proofJwt = MockExternalService.createHolderProof(token.c_nonce);
    const credentialEndpoint = internalizeIssuerUrl(metadata.credential_endpoint);
    const credentialRequest = { format: params.format, proof: { proof_type: 'jwt', jwt: proofJwt } };
    recordWalletRequest('Wallet requests credential with nonce-bound proof of possession', credentialEndpoint, 'POST', {
      format: params.format, proof: { proof_type: 'jwt', jwt: '[SIGNED JWT REDACTED]' }
    });
    const credentialResponse = await fetch(credentialEndpoint, {
      method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${token.access_token}`,
        ...(flowId ? { 'X-Playground-Flow-Id': flowId } : {})
      }, body: JSON.stringify(credentialRequest)
    });
    const credentialData: any = await credentialResponse.json();
    recordWalletResponse('Wallet receives issued credential', credentialEndpoint, 'POST', {
      format: credentialData.format, credentialId: credentialData.credential?.id,
      issuer: credentialData.credential?.issuer
    }, credentialResponse.status);
    if (!credentialResponse.ok || !credentialData.credential) {
      throw new Error(credentialData.error_description || 'Credential endpoint rejected the request');
    }
    return credentialData.credential;
  }

  /** Send an SD-JWT VP and key-binding JWT to the reference OpenID4VP verifier. */
  public static async presentSDJWTToMockVerifier(
    vc: any, attack: 'NONE' | 'MISMATCHED_NONCE' | 'INVALID_SIGNATURE' | 'CORRUPTED_DISCLOSURE' = 'NONE'
  ): Promise<any> {
    if (vc?.format !== 'vc+sd-jwt' || typeof vc.combinedSDJWT !== 'string') {
      throw new Error('OpenID4VP mock presentation requires an SD-JWT VC');
    }
    const baseUrl = (process.env.PLAYGROUND_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 4000}`).replace(/\/$/, '');
    const publicBaseUrl = (process.env.PLAYGROUND_PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, '');
    const flowId = currentFlowId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (flowId) headers['X-Playground-Flow-Id'] = flowId;
    const requestEndpoint = `${baseUrl}/api/verifier/mock/vp-request`;
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: 'Wallet requests SD-JWT presentation challenge',
      actor: 'WALLET', direction: 'REQUEST', endpoint: requestEndpoint, method: 'POST', headers,
      payload: { format: 'vc+sd-jwt' } });
    const requestResponse = await fetch(requestEndpoint, {
      method: 'POST', headers, body: JSON.stringify({ format: 'vc+sd-jwt' })
    });
    const request: any = await requestResponse.json();
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: 'Wallet receives signed presentation request',
      actor: 'WALLET', direction: 'RESPONSE', endpoint: requestEndpoint, method: 'POST', headers,
      payload: request, status: requestResponse.status });
    if (!requestResponse.ok) throw new Error(request.error || 'Verifier did not create a VP request');

    const [headerB64, payloadB64, signatureB64] = String(request.request_jwt || '').split('.');
    if (!headerB64 || !payloadB64 || !signatureB64 ||
        !Ed25519Crypto.verify(`${headerB64}.${payloadB64}`, Buffer.from(signatureB64, 'base64url'), MockExternalService.verifierKeyPair.publicKeyObject)) {
      throw new Error('Verifier authorization request JWT signature is invalid');
    }
    const requestPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (requestPayload.request_id !== request.request_id || requestPayload.client_id !== request.client_id ||
        requestPayload.nonce !== request.nonce || requestPayload.state !== request.state ||
        requestPayload.exp < Date.now() / 1000) {
      throw new Error('Verifier authorization request claims do not match the retrieved request');
    }

    let sdJwt = vc.combinedSDJWT as string;
    if (attack === 'INVALID_SIGNATURE') {
      const segments = sdJwt.split('~');
      const jwt = segments[0].split('.');
      jwt[2] = `${jwt[2].slice(0, -1)}${jwt[2].endsWith('A') ? 'B' : 'A'}`;
      segments[0] = jwt.join('.');
      sdJwt = segments.join('~');
    }
    if (attack === 'CORRUPTED_DISCLOSURE') {
      const segments = sdJwt.split('~');
      if (segments.length < 3 || !segments[1]) throw new Error('SD-JWT has no disclosure to corrupt');
      const disclosure = segments[1];
      segments[1] = `${disclosure.slice(0, -3)}XYZ`;
      sdJwt = segments.join('~');
    }
    const challenge = attack === 'MISMATCHED_NONCE' ? 'wrong-nonce-for-replay-test' : requestPayload.nonce;
    const keyBindingJwt = MockExternalService.createSDJWTKeyBinding(sdJwt, challenge, requestPayload.client_id);
    const vpToken = `${sdJwt}${keyBindingJwt}`;
    const responsePublicUrl = new URL(requestPayload.response_uri);
    if (responsePublicUrl.origin !== new URL(publicBaseUrl).origin || responsePublicUrl.pathname !== '/api/verifier/mock/vp-response') {
      throw new Error('Verifier authorization request advertises an unexpected response URI');
    }
    const responseEndpoint = `${baseUrl}${responsePublicUrl.pathname}`;
    const responseBody = {
      state: requestPayload.state, vp_token: vpToken,
      presentation_submission: {
        id: crypto.randomUUID(), definition_id: requestPayload.presentation_definition?.id,
        descriptor_map: [{ id: 'sd-jwt-vc', format: 'vc+sd-jwt', path: '$' }]
      }
    };
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: 'Wallet submits SD-JWT VP by direct_post',
      actor: 'WALLET', direction: 'REQUEST', endpoint: responseEndpoint, method: 'POST', headers,
      payload: { ...responseBody, vp_token: vpToken } });
    const response = await fetch(responseEndpoint, { method: 'POST', headers, body: JSON.stringify(responseBody) });
    const result: any = await response.json();
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: 'Wallet receives verifier presentation result',
      actor: 'WALLET', direction: 'RESPONSE', endpoint: responseEndpoint, method: 'POST', headers,
      payload: result, status: response.status });
    if (!response.ok) throw new Error(result.error || 'Verifier rejected the presentation transaction');
    return result;
  }

  public static async presentToInjiVerify(vc: any, attack: 'NONE' | 'MISMATCHED_NONCE' | 'INVALID_SIGNATURE' = 'NONE',
    directUpstream = false): Promise<any> {
    if (!vc || vc.format !== 'ldp_vc' || !vc.proof) {
      throw new Error('Local wallet presentation requires a signed W3C JSON-LD credential');
    }
    const clientId = 'playground-local-wallet-verifier';
    const request = await VerifyService.createVPRequest({ clientId });
    if (!request.requestId || !request.transactionId) throw new Error('Verifier did not create a VP transaction');
    const jwt = await VerifyService.getVPRequestJwt(request.requestId);
    const parts = jwt.split('.');
    if (parts.length !== 3) throw new Error('Verifier did not return a signed request JWT');
    const authorization: any = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!authorization.nonce || authorization.client_id !== clientId ||
      authorization.state !== request.requestId || !authorization.response_uri) {
      throw new Error('Verifier request JWT is missing nonce, matching client ID, state, or response URI');
    }

    const keyPair = await this.getKeyPair();
    const holder = keyPair.controller;
    const vp = {
      '@context': ['https://www.w3.org/2018/credentials/v1', 'https://w3id.org/security/suites/ed25519-2020/v1'],
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['VerifiablePresentation'],
      holder,
      verifiableCredential: [(({
        format, issuerImplementation, ...signedCredential
      }: any) => signedCredential)(vc)]
    };
    const dynamicImport = new Function('name', 'return import(name)') as (name: string) => Promise<any>;
    const { Ed25519Signature2020, suiteContext } = await dynamicImport('@digitalbazaar/ed25519-signature-2020');
    const documentLoader = async (url: string) => {
      const document = url === FARMER_CONTEXT_URL ? FARMER_CONTEXT :
        suiteContext.contexts.get(url) || credentialsContext.contexts.get(url) ||
        securityContext.contexts.get(url);
      if (!document) throw new Error(`Unpinned JSON-LD context URL: ${url}`);
      return { contextUrl: null, documentUrl: url, document };
    };
    const signedVp = await jsonldSignatures.sign(vp, {
      suite: new Ed25519Signature2020({ key: keyPair }),
      purpose: new jsonldSignatures.purposes.AuthenticationProofPurpose({
        challenge: attack === 'MISMATCHED_NONCE' ? 'intentionally-wrong-nonce' : authorization.nonce,
        domain: clientId
      }),
      documentLoader
    });
    if (attack === 'INVALID_SIGNATURE') {
      const proof = signedVp.proof?.proofValue;
      if (typeof proof !== 'string' || proof.length < 4) throw new Error('Signed VP has no mutable holder proof');
      signedVp.proof.proofValue = `${proof.slice(0, -1)}${proof.at(-1) === '2' ? '3' : '2'}`;
    }
    const submission = {
      id: crypto.randomUUID(),
      definition_id: authorization.presentation_definition?.id,
      descriptor_map: [{
        id: authorization.presentation_definition?.input_descriptors?.[0]?.id,
        format: 'ldp_vp',
        path: '$'
      }]
    };
    const submitResult = await VerifyService.submitVP(authorization.response_uri, request.requestId, signedVp, submission, directUpstream);
    const result = await VerifyService.getVPResult(request.transactionId);
    return {
      requestId: request.requestId,
      transactionId: request.transactionId,
      holderDid: holder,
      nonce: authorization.nonce,
      submittedChallenge: signedVp.proof?.challenge,
      submitResult,
      verifierResult: result,
      valid: result.vpResultStatus === 'SUCCESS' &&
        Array.isArray(result.vcResults) && result.vcResults.length > 0 &&
        result.vcResults.every((entry: any) => entry.verificationStatus === 'SUCCESS'),
      walletImplementation: 'LOCAL_REFERENCE_WALLET',
      vpProofType: signedVp.proof?.type
    };
  }
}
