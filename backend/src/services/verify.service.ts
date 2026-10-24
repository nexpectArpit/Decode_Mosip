import { ProtocolInspector } from '../middleware/inspector';
import { VerificationResultPayload } from '../types';

const VERIFY_BASE_URL = process.env.VERIFY_URL || 'http://localhost:8095/v1/verify';

export class VerifyService {
  public static async getDidDocument(): Promise<any> {
    const start = Date.now();
    const url = `${VERIFY_BASE_URL}/did.json`;

    ProtocolInspector.record({
      protocol: 'SYSTEM',
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
      if (!res.ok) throw new Error(`DID document request failed (${res.status})`);

      ProtocolInspector.record({
        protocol: 'SYSTEM',
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
    } catch (err: any) {
      throw new Error(`Inji Verify DID discovery failed: ${err.message}`);
    }
  }

  /** Submit a W3C credential to the actual Inji Verify service. */
  public static async verifyVC(vcPayload: any): Promise<VerificationResultPayload> {
    if (!vcPayload || typeof vcPayload !== 'object') throw new Error('Missing credential');
    const format = vcPayload.format || 'ldp_vc';
    if (format !== 'ldp_vc' && format !== 'vc+sd-jwt') {
      throw new Error(`Inji Verify ${format} verification is not wired to a live upstream flow`);
    }
    const start = Date.now();
    const url = `${VERIFY_BASE_URL}/vc-verification`;
    const credential = { ...vcPayload };
    delete credential.format;
    delete credential.issuerImplementation;
    const sdJwt = vcPayload.format === 'vc+sd-jwt' ? vcPayload.combinedSDJWT : undefined;
    if (vcPayload.format === 'vc+sd-jwt' && typeof sdJwt !== 'string') {
      throw new Error('Inji Verify SD-JWT verification requires a compact SD-JWT VC string');
    }
    const contentType = vcPayload.format === 'vc+sd-jwt' ? 'application/vc+sd-jwt' : 'text/plain';
    const requestBody = sdJwt || JSON.stringify(credential);
    ProtocolInspector.record({
      protocol: 'W3C_VC', step: 'Submit VC to Inji Verify', actor: 'VERIFIER',
      direction: 'REQUEST', endpoint: url, method: 'POST',
      headers: { 'Content-Type': contentType }, payload: vcPayload.format === 'vc+sd-jwt'
        ? { format, compactSDJWT: sdJwt } : credential
    });
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': contentType },
      body: requestBody
    });
    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); } catch {
      throw new Error(`Inji Verify returned non-JSON response (${response.status}): ${raw.slice(0, 300)}`);
    }
    ProtocolInspector.record({
      protocol: format === 'vc+sd-jwt' ? 'SD_JWT' : 'W3C_VC', step: 'Inji Verify VC result', actor: 'VERIFIER',
      direction: 'RESPONSE', endpoint: url, method: 'POST',
      headers: Object.fromEntries(response.headers.entries()), payload: data,
      status: response.status, durationMs: Date.now() - start
    });
    const upstreamStatus = data?.verificationStatus;
    if (!['SUCCESS', 'INVALID', 'EXPIRED', 'REVOKED'].includes(upstreamStatus)) {
      throw new Error(`Inji Verify did not return a verification result (${response.status}): ${JSON.stringify(data)}`);
    }
    const valid = response.ok && upstreamStatus === 'SUCCESS';
    const status = valid ? 'VALID' : upstreamStatus === 'EXPIRED' ? 'EXPIRED' : upstreamStatus === 'REVOKED' ? 'REVOKED' : 'INVALID';
    return {
      valid, status, format, verifier: 'INJI_VERIFY',
      cryptographicCheck: {
        signatureValid: null, signatureSuite: credential.proof?.type || (format === 'vc+sd-jwt' ? 'SD-JWT JWS' : 'Unknown'),
        issuerDid: credential.issuer || (format === 'vc+sd-jwt' ? 'x5c certificate issuer' : ''), tamperDetected: null,
        message: `Inji Verify returned ${upstreamStatus}; individual proof checks were not exposed by this response`
      },
      claimsCheck: {
        issuerTrusted: null, subjectMatched: null, notExpired: status === 'EXPIRED' ? false : null,
        claims: valid ? credential.credentialSubject || {} : {}
      },
      durationMs: Date.now() - start, timestamp: new Date().toISOString()
    };
  }

  public static async createVPRequest(params: {
    clientId: string;
    presentationDefinition?: any;
    acceptVPWithoutHolderProof?: boolean;
  }): Promise<any> {
    const start = Date.now();
    const url = `${VERIFY_BASE_URL}/vp-request`;

    const body = {
      clientId: params.clientId || 'playground-verifier',
      acceptVPWithoutHolderProof: Boolean(params.acceptVPWithoutHolderProof),
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

    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Inji Verify VP request failed (${res.status}): ${JSON.stringify(data)}`);
    ProtocolInspector.record({
      protocol: 'OpenID4VP', step: 'Inji Verify: Authorization request created', actor: 'VERIFIER',
      direction: 'RESPONSE', endpoint: url, method: 'POST', headers: Object.fromEntries(res.headers.entries()),
      payload: data, status: res.status, durationMs: Date.now() - start
    });
    return data;
  }

  public static async getVPRequestJwt(requestId: string): Promise<string> {
    const url = `${VERIFY_BASE_URL}/vp-request/${encodeURIComponent(requestId)}`;
    const res = await fetch(url);
    const jwt = await res.text();
    if (!res.ok) throw new Error(`Inji Verify request JWT failed (${res.status}): ${jwt.slice(0, 300)}`);
    ProtocolInspector.record({
      protocol: 'OpenID4VP', step: 'Wallet retrieves signed authorization request', actor: 'WALLET',
      direction: 'REQUEST', endpoint: url, method: 'GET', headers: { 'Accept': 'application/jwt' }, payload: null
    });
    ProtocolInspector.record({
      protocol: 'OpenID4VP', step: 'Inji Verify returns signed authorization request', actor: 'VERIFIER',
      direction: 'RESPONSE', endpoint: url, method: 'GET', headers: Object.fromEntries(res.headers.entries()),
      payload: { jwt }, status: res.status
    });
    return jwt;
  }

  public static async submitVP(responseUri: string, state: string, vpToken: any, presentationSubmission: any,
    directUpstream = false): Promise<any> {
    const expected = new URL(`${VERIFY_BASE_URL}/vp-submission/direct-post`);
    const target = new URL(responseUri);
    const directBase = process.env.VERIFY_DIRECT_URL;
    const directExpected = directBase ? new URL(`${directBase}/vp-submission/direct-post`) : null;
    if (target.pathname !== expected.pathname || target.host !== expected.host) {
      // Verify may advertise its public URL while this backend reaches it over the Compose network.
      const publicUrl = new URL(process.env.VERIFY_PUBLIC_URL || 'http://localhost:8095/v1/verify');
      const targetIsDirect = directUpstream && directExpected && target.pathname === directExpected.pathname &&
        (target.host === directExpected.host || target.host === publicUrl.host);
      if (!targetIsDirect && (target.host !== publicUrl.host || target.pathname !== `${publicUrl.pathname}/vp-submission/direct-post`)) {
        throw new Error(`Refusing VP submission to unexpected verifier response URI: ${responseUri}`);
      }
    }
    const url = `${directUpstream && directBase ? directBase : VERIFY_BASE_URL}/vp-submission/direct-post`;
    const start = Date.now();
    const form = new URLSearchParams({
      state,
      vp_token: JSON.stringify(vpToken),
      presentation_submission: JSON.stringify(presentationSubmission)
    });
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: 'Wallet sends VP token by direct_post', actor: 'WALLET',
      direction: 'REQUEST', endpoint: url, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      payload: { state, credentialCount: vpToken.verifiableCredential?.length || 0 } });
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = raw; }
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: 'Inji Verify VP submission response', actor: 'VERIFIER',
      direction: 'RESPONSE', endpoint: url, method: 'POST', headers: Object.fromEntries(response.headers.entries()),
      payload: data, status: response.status, durationMs: Date.now() - start });
    if (!response.ok) {
      const error: any = new Error(`Inji Verify rejected VP submission (${response.status}): ${JSON.stringify(data)}`);
      error.nonceRejected = response.headers.get('x-playground-nonce-guard') === 'rejected';
      error.rejectionLayer = error.nonceRejected ? 'PLAYGROUND_NONCE_GATEWAY' : 'INJI_VERIFY';
      throw error;
    }
    return data;
  }

  public static async getVPResult(transactionId: string): Promise<any> {
    const url = `${VERIFY_BASE_URL}/vp-result/${encodeURIComponent(transactionId)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(`Inji Verify VP result failed (${response.status}): ${JSON.stringify(data)}`);
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: 'Inji Verify verified VP result', actor: 'VERIFIER',
      direction: 'RESPONSE', endpoint: url, method: 'GET', headers: Object.fromEntries(response.headers.entries()),
      payload: data, status: response.status });
    return data;
  }

  public static async getMobileAlphaVPResult(transactionId: string): Promise<any> {
    const base = (process.env.VERIFY_ALPHA_URL || 'http://verify-gateway-alpha:8080/v1/verify').replace(/\/$/, '');
    const url = `${base}/vp-result/${encodeURIComponent(transactionId)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(`Inji Verify 1.0 alpha VP result failed (${response.status}): ${JSON.stringify(data)}`);
    ProtocolInspector.record({ protocol: 'OpenID4VP', step: 'Inji Verify 1.0 alpha verified VP result', actor: 'VERIFIER',
      direction: 'RESPONSE', endpoint: url, method: 'GET', headers: Object.fromEntries(response.headers.entries()),
      payload: data, status: response.status });
    return data;
  }
}
