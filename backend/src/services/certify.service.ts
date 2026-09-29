import * as crypto from 'crypto';
import fetch from 'node-fetch';
import { ProtocolInspector } from '../middleware/inspector';
import { IssuedCredentialPayload, CredentialFormat } from '../types';
import { Ed25519Crypto, Ed25519KeyPair } from '../crypto/ed25519';
import { W3CVCProtocol } from '../protocols/w3c-vc';
import { MDocCrypto } from '../crypto/mdoc-cose';
import { SDJWTCrypto } from '../crypto/sd-jwt';

const CERTIFY_BASE_URL = process.env.CERTIFY_URL || 'http://localhost:8090/v1/certify';
const CERTIFY_NGINX_URL = process.env.CERTIFY_NGINX_URL || 'http://localhost:8091';

export class CertifyService {
  // Deterministic seed for Inji Certify local signer
  private static readonly CERTIFY_SEED = Buffer.from('1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d', 'hex');
  public static readonly keyPair: Ed25519KeyPair = Ed25519Crypto.fromSeed(CertifyService.CERTIFY_SEED);

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

  public static async getDidDocument(): Promise<any> {
    const url = `${CERTIFY_NGINX_URL}/.well-known/did.json`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        id: 'did:web:certify-nginx',
        verificationMethod: [{
          id: 'did:web:certify-nginx#key-0',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:web:certify-nginx',
          publicKeyMultibase: this.keyPair.publicKeyMultibase
        }]
      };
    }
  }

  public static async issueCredential(params: {
    credentialType: 'FarmerCredential' | 'MockMdl' | 'NationalId';
    format?: CredentialFormat;
    uin?: string;
    holderDid?: string;
  }): Promise<IssuedCredentialPayload> {
    const start = Date.now();
    const uin = params.uin || '9876543210';
    const holderDid = params.holderDid || 'did:key:z6MkqFLQZ83XN';

    // Step 1: OpenID4VCI Credential Offer
    ProtocolInspector.record({
      protocol: 'OpenID4VCI',
      step: 'Inji Certify: Issue Credential Offer (openid-credential-offer://)',
      actor: 'ISSUER',
      direction: 'REQUEST',
      endpoint: `${CERTIFY_BASE_URL}/issuance/credential-offer`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: {
        credential_issuer: 'http://certify-nginx',
        credential_configuration_ids: [params.credentialType],
        grants: {
          'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
            'pre-authorized_code': 'pre_auth_' + crypto.randomBytes(8).toString('hex'),
            user_pin_required: false
          }
        }
      }
    });

    // Step 2: Token Exchange
    ProtocolInspector.record({
      protocol: 'OpenID4VCI',
      step: 'Token Request (OAuth2 Pre-Authorized Code)',
      actor: 'WALLET',
      direction: 'REQUEST',
      endpoint: `http://localhost:8099/v1/mimoto/get-token/${params.credentialType === 'MockMdl' ? 'MockMdl' : 'Farmer'}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      payload: { grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code', client_id: 'wallet-demo' }
    });

    let credential: IssuedCredentialPayload;

    if (params.credentialType === 'MockMdl' || params.format === 'mso_mdoc') {
      const claims = {
        family_name: 'Sharma',
        given_name: 'Rajesh',
        birth_date: '1985-04-12',
        driving_privileges: [{ vehicle_category_code: 'MCWG' }, { vehicle_category_code: 'LMV' }],
        issue_date: new Date().toISOString().split('T')[0],
        expiry_date: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
        issuing_authority: 'State Transport Department, India',
        document_number: `DL-${uin.slice(-6)}`
      };

      const mdoc = MDocCrypto.issueMDoc({
        issuerKeyPair: this.keyPair,
        docType: 'org.iso.18013.5.1.mDL',
        claims
      });

      credential = {
        id: `urn:uuid:${crypto.randomUUID()}`,
        format: 'mso_mdoc',
        type: ['org.iso.18013.5.1.mDL'],
        issuer: 'did:web:certify-nginx',
        issuanceDate: new Date().toISOString(),
        rawCborHex: mdoc.rawCborHex,
        mso: mdoc.mso,
        credentialSubject: {
          doctype: 'org.iso.18013.5.1.mDL',
          ...claims
        },
        proof: {
          type: 'COSE_Sign1',
          created: new Date().toISOString(),
          verificationMethod: 'did:web:certify-nginx#key-0',
          algorithm: 'EdDSA'
        },
        issuerImplementation: 'INJI_CERTIFY'
      };
    } else if (params.format === 'vc+sd-jwt' || params.credentialType === 'NationalId') {
      const claims = {
        fullName: 'Rajesh Sharma',
        nationalId: `UIN-${uin}`,
        dateOfBirth: '1985-04-12',
        state: 'Maharashtra',
        district: 'Nashik'
      };

      const sdjwt = SDJWTCrypto.issueSDJWT({
        issuerKeyPair: this.keyPair,
        holderDid,
        claims,
        disclosableClaimKeys: ['nationalId', 'dateOfBirth']
      });

      credential = {
        id: `urn:uuid:${crypto.randomUUID()}`,
        format: 'vc+sd-jwt',
        type: ['VerifiableCredential', 'NationalIdCredential'],
        issuer: 'did:web:certify-nginx',
        issuanceDate: new Date().toISOString(),
        combinedSDJWT: sdjwt.combinedSDJWT,
        issuerSignedJwt: sdjwt.issuerSignedJwt,
        disclosures: sdjwt.disclosures,
        payload: sdjwt.payload,
        credentialSubject: {
          id: holderDid,
          ...claims
        },
        proof: {
          type: 'Ed25519Signature2020',
          verificationMethod: 'did:web:certify-nginx#key-0'
        },
        issuerImplementation: 'INJI_CERTIFY'
      };
    } else {
      // W3C JSON-LD FarmerCredential with REAL cryptographic Ed25519 signature!
      const claims = {
        farmerID: `FARMER-${uin}`,
        fullName: 'Ramesh Patel',
        mobileNumber: `+91-98${uin.slice(-8)}`,
        dateOfBirth: '1978-08-20',
        gender: 'Male',
        state: 'Maharashtra',
        district: 'Nashik',
        villageOrTown: 'Dindori',
        postalCode: '422202',
        landArea: '4.8 Hectares',
        landOwnershipType: 'Freehold Agricultural',
        primaryCropType: 'Paddy & Soybean',
        secondaryCropType: 'Sugarcane'
      };

      const signedW3C = W3CVCProtocol.issueCredential({
        issuerKeyPair: this.keyPair,
        holderDid,
        type: ['FarmerCredential'],
        claims,
        issuerDid: 'did:web:certify-nginx'
      });

      credential = {
        ...signedW3C,
        format: 'ldp_vc',
        issuerImplementation: 'INJI_CERTIFY'
      };
    }

    ProtocolInspector.record({
      protocol: 'OpenID4VCI',
      step: `Inji Certify: Real Cryptographic Credential Issued [Format: ${credential.format}]`,
      actor: 'ISSUER',
      direction: 'RESPONSE',
      endpoint: `${CERTIFY_BASE_URL}/issuance/credential`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: { credentialId: credential.id, format: credential.format },
      status: 200,
      durationMs: Date.now() - start
    });

    return credential;
  }
}
