import * as crypto from 'crypto';
import { ProtocolInspector } from '../middleware/inspector';
import { IssuedCredentialPayload, CredentialFormat } from '../types';
import { currentFlowId } from '../middleware/flow-context';

const CERTIFY_BASE_URL = process.env.CERTIFY_URL || 'http://localhost:8090/v1/certify';
const CERTIFY_NGINX_URL = process.env.CERTIFY_NGINX_URL || 'http://localhost:8091';

type IssueParams = {
  credentialType: 'FarmerCredential' | 'MockMdl' | 'NationalId';
  format?: CredentialFormat;
  uin?: string;
  subjectData?: Record<string, any>;
};

export class CertifyService {
  public static async assertMobileIssuerConfiguration(publicIssuerUrl: string): Promise<void> {
    const publicIssuer = new URL(publicIssuerUrl);
    const origin = publicIssuer.origin;
    const [metadata, oauth, didDocument] = await Promise.all([
      this.getWellKnownIssuer(), this.getAuthorizationServerMetadata(), this.getUpstreamDidDocument()
    ]);
    if ((metadata.credential_issuer !== origin && metadata.credential_issuer !== `${origin}/v1/certify`) ||
        !Array.isArray(metadata.authorization_servers) ||
        !metadata.authorization_servers.includes(origin) ||
        oauth.issuer !== origin ||
        oauth.token_endpoint !== `${origin}/v1/certify/oauth/token` ||
        didDocument.id !== process.env.CERTIFY_PUBLIC_DID) {
      throw new Error('Certify is not advertising the configured public issuer, authorization server, token endpoint, and DID. Restart Compose with matching CERTIFY_PUBLIC_ORIGIN and CERTIFY_PUBLIC_DID.');
    }
  }

  public static async createMobileCredentialOffer(params: { uin: string; fullName: string; publicIssuerUrl: string }): Promise<string> {
    const publicIssuer = new URL(params.publicIssuerUrl);
    if (publicIssuer.protocol !== 'https:' || publicIssuer.pathname.replace(/\/$/, '') !== '/v1/certify' ||
        /^(localhost|127\.|certify-nginx$|certify$|playground-backend$)/i.test(publicIssuer.hostname)) {
      throw new Error('Configure a phone-reachable HTTPS origin for the mobile protocol edge before creating a mobile offer.');
    }
    const publicDid = process.env.CERTIFY_PUBLIC_DID || '';
    if (publicDid !== `did:web:${publicIssuer.hostname.toLowerCase()}`) {
      throw new Error(`Set CERTIFY_PUBLIC_DID=did:web:${publicIssuer.hostname.toLowerCase()} and restart Compose so the phone can resolve the signed credential issuer.`);
    }
    if (process.env.CERTIFY_PUBLIC_ORIGIN !== publicIssuer.origin) {
      throw new Error(`Set CERTIFY_PUBLIC_ORIGIN=${publicIssuer.origin} and restart Compose so Certify advertises the same public issuer and proof audience.`);
    }
    await this.assertMobileIssuerConfiguration(publicIssuer.toString());
    const preAuthUrl = `${CERTIFY_BASE_URL}/pre-authorized-data`;
    const payload = {
      credential_configuration_id: 'FarmerCredential',
      claims: {
        id: params.uin, fullName: params.fullName, mobileNumber: `98${params.uin.slice(-8)}`,
        dateOfBirth: '1978-08-20', gender: 'Male', state: 'Karnataka', district: 'Bangalore',
        villageOrTown: 'Koramangala', postalCode: '453000', landArea: '3 hectares',
        landOwnershipType: 'Owner', primaryCropType: 'Maize', secondaryCropType: 'Rice', face: '', farmerID: params.uin
      },
      expires_in: 600
    };
    ProtocolInspector.record({ protocol: 'OpenID4VCI', step: 'Inji Certify: Create pre-authorized mobile offer', actor: 'ISSUER', direction: 'REQUEST', endpoint: preAuthUrl, method: 'POST', headers: { 'Content-Type': 'application/json' }, payload });
    const response = await fetch(preAuthUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data: any = await response.json();
    if (!response.ok || typeof data.credential_offer_uri !== 'string') throw new Error(`Inji Certify offer creation failed (${response.status}): ${JSON.stringify(data)}`);
    const offerUri = new URL(data.credential_offer_uri);
    const embeddedOfferUrl = offerUri.searchParams.get('credential_offer_uri');
    if (!embeddedOfferUrl) throw new Error('Inji Certify returned an offer URI without credential_offer_uri');
    const offerUrl = new URL(embeddedOfferUrl);
    const offerId = offerUrl.pathname.match(/\/credential-offer-data\/([^/]+)$/)?.[1];
    const gatewayUrl = process.env.CERTIFY_GATEWAY_URL;
    if (gatewayUrl) {
      if (!offerId || !currentFlowId()) throw new Error('Could not associate the mobile offer with its protocol trace');
      const registered = await fetch(`${gatewayUrl}/internal/register-offer`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId, flowId: currentFlowId() }) });
      if (!registered.ok) throw new Error(`Could not register mobile offer trace (${registered.status})`);
    }
    const reachableBase = publicIssuer.toString().replace(/\/$/, '');
    const path = offerUrl.pathname.replace(/^\/v1\/certify/, '');
    const reachableOfferUrl = `${reachableBase}${path}${offerUrl.search}`;
    const mobileUri = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(reachableOfferUrl)}`;
    ProtocolInspector.record({ protocol: 'OpenID4VCI', step: 'Inji Certify: Mobile credential offer QR ready', actor: 'ISSUER', direction: 'RESPONSE', endpoint: preAuthUrl, method: 'POST', headers: Object.fromEntries(response.headers.entries()), payload: { credential_offer_uri: mobileUri, expiresInSeconds: 600 }, status: response.status });
    return mobileUri;
  }

  public static async getWellKnownIssuer(): Promise<any> {
    const start = Date.now();
    const url = `${CERTIFY_NGINX_URL}/.well-known/openid-credential-issuer`;
    
    ProtocolInspector.record({
      protocol: 'OpenID4VCI',
      step: 'Issuer Well-Known Metadata Discovery',
      actor: 'ISSUER',
      direction: 'REQUEST',
      endpoint: url,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      payload: null
    });

    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(`Issuer metadata request failed (${res.status})`);

      ProtocolInspector.record({
        protocol: 'OpenID4VCI',
        step: 'Issuer Well-Known Metadata Discovery Response',
        actor: 'ISSUER',
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
      ProtocolInspector.record({
        protocol: 'OpenID4VCI',
        step: 'Issuer Metadata Error',
        actor: 'ISSUER',
        direction: 'RESPONSE',
        endpoint: url,
        method: 'GET',
        headers: {},
        payload: { error: err.message },
        status: 500,
        durationMs: Date.now() - start
      });
      throw err;
    }
  }

  public static async getAuthorizationServerMetadata(): Promise<any> {
    const url = `${CERTIFY_NGINX_URL}/v1/certify/.well-known/oauth-authorization-server`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Certify OAuth metadata request failed (${response.status})`);
    return response.json();
  }

  public static async getDidDocument(): Promise<any> {
    const url = `${CERTIFY_NGINX_URL}/.well-known/did.json`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(`DID document request failed (${res.status})`);
      return data;
    } catch (err: any) {
      throw new Error(`Inji Certify DID discovery failed: ${err.message}`);
    }
  }

  /** Fetch Certify's raw DID document for the local resolver compatibility adapter. */
  public static async getUpstreamDidDocument(): Promise<any> {
    const url = `${CERTIFY_BASE_URL}/.well-known/did.json`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok || !data || typeof data !== 'object') {
      throw new Error(`Raw Certify DID document request failed (${res.status})`);
    }
    return data;
  }

  public static async issueCredential(params: IssueParams): Promise<IssuedCredentialPayload> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.issueCredentialOnce(params);
      } catch (error: any) {
        const transientContextFailure = error.message?.includes('ERROR_SIGNING_QR_DATA') &&
          error.message?.includes('canonicalization');
        if (!transientContextFailure || attempt === 3) throw error;
        ProtocolInspector.record({ protocol: 'SYSTEM', step: `Retry Certify issuance after remote JSON-LD context error (${attempt}/2)`,
          actor: 'ISSUER', direction: 'INTERNAL', endpoint: 'local:CertifyService.issueCredential',
          method: 'LOCAL', headers: {}, payload: { reason: 'ERROR_SIGNING_QR_DATA' } });
        await new Promise(resolve => setTimeout(resolve, attempt * 750));
      }
    }
    throw new Error('Inji Certify issuance retry loop ended unexpectedly');
  }

  private static async issueCredentialOnce(params: IssueParams): Promise<IssuedCredentialPayload> {
    const start = Date.now();
    const uin = params.subjectData?.uin || params.uin || '9876543210';
    const fullName = params.subjectData?.fullName || 'Ramesh Patel';
    if (params.format && params.format !== 'ldp_vc') {
      throw new Error(`Inji Certify ${params.format} issuance is not wired to an upstream credential configuration. Select the external mock issuer for this format.`);
    }

    // When FarmerCredential (ldp_vc) is requested, attempt live Inji Certify OpenID4VCI issuance
    if (params.credentialType === 'FarmerCredential' || (!params.format || params.format === 'ldp_vc')) {
      try {
        // Step 1: Pre-Authorized Code & Credential Offer
        const preAuthUrl = `${CERTIFY_BASE_URL}/pre-authorized-data`;
        const preAuthPayload = {
          credential_configuration_id: 'FarmerCredential',
          claims: {
            id: uin,
            fullName,
            mobileNumber: `98${uin.slice(-8)}`,
            dateOfBirth: '1978-08-20',
            gender: 'Male',
            state: 'Karnataka',
            district: 'Bangalore',
            villageOrTown: 'Koramangala',
            postalCode: '453000',
            landArea: '3 hectares',
            landOwnershipType: 'Owner',
            primaryCropType: 'Maize',
            secondaryCropType: 'Rice',
            face: '',
            farmerID: uin
          },
          expires_in: 600
        };

        ProtocolInspector.record({
          protocol: 'OpenID4VCI',
          step: '1. Inji Certify: Request Pre-Authorized Code (OpenID4VCI Draft 13)',
          actor: 'ISSUER',
          direction: 'REQUEST',
          endpoint: preAuthUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          payload: preAuthPayload
        });

        const preAuthRes = await fetch(preAuthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preAuthPayload)
        });
        const preAuthData: any = await preAuthRes.json();
        if (!preAuthRes.ok || !preAuthData.credential_offer_uri) {
          throw new Error(`Pre-authorization failed (${preAuthRes.status}): ${JSON.stringify(preAuthData)}`);
        }

        ProtocolInspector.record({
          protocol: 'OpenID4VCI',
          step: '1. Inji Certify: Pre-Authorized Code & Offer URI Issued',
          actor: 'ISSUER',
          direction: 'RESPONSE',
          endpoint: preAuthUrl,
          method: 'POST',
          headers: Object.fromEntries(preAuthRes.headers.entries()),
          payload: preAuthData,
          status: preAuthRes.status
        });

        if (preAuthData.credential_offer_uri) {
          const offerUri = decodeURIComponent(preAuthData.credential_offer_uri);
          const offerId = offerUri.split('/').pop();

          // Step 2: Fetch Credential Offer
          const offerUrl = `${CERTIFY_BASE_URL}/credential-offer-data/${offerId}`;
          const offerRes = await fetch(offerUrl);
          const offerData: any = await offerRes.json();
          if (!offerRes.ok) throw new Error(`Credential offer failed (${offerRes.status}): ${JSON.stringify(offerData)}`);

          ProtocolInspector.record({
            protocol: 'OpenID4VCI',
            step: '2. Wallet: Resolved Credential Offer Data',
            actor: 'WALLET',
            direction: 'RESPONSE',
            endpoint: offerUrl,
            method: 'GET',
            headers: Object.fromEntries(offerRes.headers.entries()),
            payload: offerData,
            status: offerRes.status
          });

          const preAuthCode = offerData.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code'];
          if (!preAuthCode) throw new Error('Credential offer did not contain a pre-authorized code');

          // Step 3: Exchange Pre-Auth Code for Access Token
          const tokenUrl = `${CERTIFY_BASE_URL}/oauth/token`;
          const tokenBody = `grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code&pre-authorized_code=${encodeURIComponent(preAuthCode)}`;

          ProtocolInspector.record({
            protocol: 'OpenID4VCI',
            step: '3. Wallet ➔ Certify: Exchange Pre-Auth Code for Access Token',
            actor: 'WALLET',
            direction: 'REQUEST',
            endpoint: tokenUrl,
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            payload: { grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code' }
          });

          const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody
          });
          const tokenData: any = await tokenRes.json();
          if (!tokenRes.ok || !tokenData.access_token || !tokenData.c_nonce) {
            throw new Error(`Token exchange failed (${tokenRes.status}): ${JSON.stringify(tokenData)}`);
          }

          ProtocolInspector.record({
            protocol: 'OpenID4VCI',
            step: '3. Inji Certify: Access Token & c_nonce Granted',
            actor: 'ISSUER',
            direction: 'RESPONSE',
            endpoint: tokenUrl,
            method: 'POST',
            headers: Object.fromEntries(tokenRes.headers.entries()),
            payload: { token_type: tokenData.token_type, expires_in: tokenData.expires_in, c_nonce: tokenData.c_nonce },
            status: tokenRes.status
          });

          const accessToken = tokenData.access_token;
          const cNonce = tokenData.c_nonce;

          // Step 4: Generate RFC-compliant Proof of Possession JWT
          const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
          const rawJwk: any = publicKey.export({ format: 'jwk' });
          delete rawJwk.kid;

          const proofHeader = { alg: 'RS256', typ: 'openid4vci-proof+jwt', jwk: rawJwk };
          const proofPayload = {
            aud: process.env.CERTIFY_PUBLIC_ORIGIN || 'http://certify-nginx:80',
            nonce: cNonce,
            iat: Math.floor(Date.now() / 1000)
          };
          const b64Header = Buffer.from(JSON.stringify(proofHeader)).toString('base64url');
          const b64Payload = Buffer.from(JSON.stringify(proofPayload)).toString('base64url');
          const signer = crypto.createSign('RSA-SHA256');
          signer.update(`${b64Header}.${b64Payload}`);
          const signature = signer.sign(privateKey).toString('base64url');
          const proofJwt = `${b64Header}.${b64Payload}.${signature}`;

          // Step 5: Request Live Credential from Inji Certify
          const credUrl = `${CERTIFY_BASE_URL}/issuance/credential`;
          const credReqBody = {
            format: 'ldp_vc',
            credential_definition: {
              '@context': ['https://www.w3.org/2018/credentials/v1'],
              type: ['VerifiableCredential', 'FarmerCredential']
            },
            proof: {
              proof_type: 'jwt',
              jwt: proofJwt
            }
          };

          ProtocolInspector.record({
            protocol: 'OpenID4VCI',
            step: '4. Wallet ➔ Certify: Request Credential with Proof of Possession',
            actor: 'WALLET',
            direction: 'REQUEST',
            endpoint: credUrl,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer [REDACTED]' },
            payload: { format: 'ldp_vc', credential_definition: credReqBody.credential_definition }
          });

          const credRes = await fetch(credUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(credReqBody)
          });

          {
            const credData: any = await credRes.json();
            if (!credRes.ok || !credData.credential) {
              throw new Error(`Credential issuance failed (${credRes.status}): ${JSON.stringify(credData)}`);
            }
            const liveVc = credData.credential || credData;

            ProtocolInspector.record({
              protocol: 'OpenID4VCI',
              step: '4. Inji Certify: Authentic Cryptographic Credential Issued',
              actor: 'ISSUER',
              direction: 'RESPONSE',
              endpoint: credUrl,
              method: 'POST',
              headers: Object.fromEntries(credRes.headers.entries()),
              payload: { id: liveVc.id, issuer: liveVc.issuer, proofType: liveVc.proof?.type, subjectKeys: Object.keys(liveVc.credentialSubject || {}) },
              status: credRes.status,
              durationMs: Date.now() - start
            });

            // If live Inji Certify returned a raw template with unrendered placeholders, dynamically populate user's claims and re-sign
            const rawSubject = liveVc.credentialSubject || {};
            const isUnrendered = typeof rawSubject.primaryCropType === 'string' && rawSubject.primaryCropType.includes('${');
            
            if (!isUnrendered && rawSubject.fullName === fullName && liveVc.proof) {
              return {
                ...liveVc,
                format: 'ldp_vc',
                issuerImplementation: 'INJI_CERTIFY'
              };
            }
            throw new Error(`Inji Certify credential did not match the requested subject (proof=${Boolean(liveVc.proof)}, unresolvedTemplate=${isUnrendered}, subjectKeys=${Object.keys(rawSubject).join(',')}, fullNameMatched=${rawSubject.fullName === fullName})`);
          }
        }
      } catch (err: any) {
        throw new Error(`Inji Certify issuance failed: ${err.message}`);
      }
    }

    throw new Error('Inji Certify issuance did not complete');

  }
}
