import * as crypto from 'node:crypto';
import { CertifyService } from '../services/certify.service';
import { VerifyService } from '../services/verify.service';
import { LocalWalletService } from '../services/local-wallet.service';
import { MockExternalService } from '../services/mock-external.service';
import { ProtocolInspector } from '../middleware/inspector';
import { canonicalizeJson } from '../crypto/canonicalize';
import { SDJWTCrypto } from '../crypto/sd-jwt';
import { MDocCrypto } from '../crypto/mdoc-cose';
import { W3CVCProtocol } from '../protocols/w3c-vc';
import { NormativeMatrixRegistry, NormativeRequirement } from './normative-matrix';
import { CredentialTamperEngine } from './tamper';

type Scope = NonNullable<NormativeRequirement['scope']>;

/** Executes bounded assertions. A passing local reference check is never presented as an upstream wallet result. */
export async function runNormativeAudit(): Promise<NormativeRequirement[]> {
  const requirements = NormativeMatrixRegistry.getRequirements();
  const set = (id: string, passed: boolean, scope: Scope, evidence: unknown, failureReason?: string) => {
    const item = requirements.find(candidate => candidate.id === id);
    if (!item) throw new Error(`Unknown normative check ${id}`);
    Object.assign(item, { tested: true, passed, scope, evidence, failureReason: passed ? undefined : failureReason });
  };
  const fail = (ids: string[], scope: Scope, error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    for (const id of ids) set(id, false, scope, null, reason);
  };

  let issuerMetadata: any;
  try {
    const metadata = await CertifyService.getWellKnownIssuer();
    issuerMetadata = metadata;
    set('OID4VCI-DISC-01', Boolean(metadata.credential_issuer && metadata.credential_endpoint),
      'UPSTREAM_API', { credentialIssuer: metadata.credential_issuer, credentialEndpoint: metadata.credential_endpoint },
      'Issuer metadata omits credential_issuer or credential_endpoint');
    const configs = metadata.credential_configurations_supported;
    const declared = configs && typeof configs === 'object'
      ? Object.entries(configs).map(([name, value]: [string, any]) => ({ name, format: value?.format })) : [];
    set('OID4VCI-CONF-02', declared.length > 0 && declared.every(entry => typeof entry.format === 'string'),
      'UPSTREAM_API', { declaredConfigurations: declared }, 'No credential configurations with a format were declared');
  } catch (error) {
    fail(['OID4VCI-DISC-01', 'OID4VCI-CONF-02'], 'UPSTREAM_API', error);
  }

  let liveVc: any;
  try {
    const started = Date.now();
    liveVc = await CertifyService.issueCredential({ credentialType: 'FarmerCredential', format: 'ldp_vc',
      uin: '73912084', subjectData: { fullName: 'Normative Audit Subject', uin: '73912084' } });
    const logs = ProtocolInspector.getLogs('OpenID4VCI').filter(log => Date.parse(log.timestamp) >= started);
    const offer = logs.find(log => log.step.includes('Resolved Credential Offer Data') && log.status === 200);
    const token = logs.find(log => log.step.includes('Access Token & c_nonce Granted') && log.status === 200);
    const grant = offer?.payload?.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code'];
    set('OID4VCI-OFFER-03', Boolean(grant?.['pre-authorized_code']), 'UPSTREAM_API',
      { offerEndpoint: offer?.endpoint, grantType: 'pre-authorized_code', codePresent: Boolean(grant?.['pre-authorized_code']) },
      'Resolved offer did not contain the pre-authorized grant');
    let advertisedTokenEndpointAligned = false;
    let authorizationEvidence: Record<string, unknown> = {};
    try {
      const oauth = await CertifyService.getAuthorizationServerMetadata();
      const issuer = new URL(issuerMetadata.credential_issuer);
      const advertisedServers = Array.isArray(issuerMetadata.authorization_servers)
        ? issuerMetadata.authorization_servers.map((value: string) => new URL(value)) : [];
      const oauthIssuer = new URL(oauth.issuer);
      const oauthToken = new URL(oauth.token_endpoint);
      const credentialEndpoint = new URL(issuerMetadata.credential_endpoint);
      const issuerApiPath = credentialEndpoint.pathname.replace(/\/issuance\/credential$/, '');
      advertisedTokenEndpointAligned = advertisedServers.some((server: URL) => server.hostname === issuer.hostname) &&
        oauthIssuer.hostname === issuer.hostname && oauthToken.hostname === issuer.hostname &&
        credentialEndpoint.hostname === issuer.hostname &&
        issuerApiPath !== credentialEndpoint.pathname &&
        oauthToken.pathname === `${issuerApiPath}/oauth/token`;
      authorizationEvidence = { advertisedServers: issuerMetadata.authorization_servers,
        oauthIssuer: oauth.issuer, oauthTokenEndpoint: oauth.token_endpoint,
        advertisedTokenEndpointAligned };
    } catch (error) {
      authorizationEvidence = { metadataError: error instanceof Error ? error.message : String(error) };
    }
    set('OID4VCI-TOKEN-04', Boolean(token?.payload?.c_nonce) && advertisedTokenEndpointAligned, 'UPSTREAM_API',
      { tokenEndpoint: token?.endpoint, noncePresent: Boolean(token?.payload?.c_nonce),
        credentialIssued: Boolean(liveVc?.proof), ...authorizationEvidence },
      'Token exchange did not return c_nonce or the advertised authorization server does not lead to Certify’s token endpoint');
    set('W3C-DATA-01', Boolean(liveVc['@context'] && liveVc.id && liveVc.type && liveVc.issuer &&
      liveVc.issuanceDate && liveVc.credentialSubject?.fullName === 'Normative Audit Subject'),
      'UPSTREAM_API', { credentialId: liveVc.id, issuer: liveVc.issuer, subjectMatched: liveVc.credentialSubject?.fullName === 'Normative Audit Subject' },
      'Issued credential omitted required fields or requested subject');
  } catch (error) {
    fail(['OID4VCI-OFFER-03', 'OID4VCI-TOKEN-04', 'W3C-DATA-01'], 'UPSTREAM_API', error);
  }
  if (liveVc) {
    try {
      const accepted = await VerifyService.verifyVC(liveVc);
      const damaged = CredentialTamperEngine.mutate(liveVc, 'INVALID_SIGNATURE').tamperedCredential;
      const rejected = await VerifyService.verifyVC(damaged);
      set('W3C-CRYPTO-03', Boolean(accepted.valid && !rejected.valid && liveVc.proof?.type === 'Ed25519Signature2020'),
        'UPSTREAM_API', { validCredentialAccepted: accepted.valid, alteredProofRejected: !rejected.valid,
          proofType: liveVc.proof?.type }, 'Live verifier accepted a modified proof or rejected the original');
    } catch (error) {
      fail(['W3C-CRYPTO-03'], 'UPSTREAM_API', error);
    }
  } else {
    set('W3C-CRYPTO-03', false, 'UPSTREAM_API', null, 'No live credential was available');
  }

  try {
    const request = await VerifyService.createVPRequest({ clientId: 'playground-normative-audit' });
    const jwt = await VerifyService.getVPRequestJwt(request.requestId);
    const parts = jwt.split('.');
    const payload = parts.length === 3 ? JSON.parse(Buffer.from(parts[1], 'base64url').toString()) : {};
    set('OID4VP-REQ-01', Boolean(request.requestId && payload.nonce && payload.client_id && payload.response_uri),
      'UPSTREAM_API', { requestId: request.requestId, noncePresent: Boolean(payload.nonce), responseUri: payload.response_uri },
      'Signed VP request lacks request ID, nonce, client ID, or response URI');
    set('OID4VP-DEF-02', Array.isArray(payload.presentation_definition?.input_descriptors) &&
      payload.presentation_definition.input_descriptors.length > 0,
      'UPSTREAM_API', { presentationDefinition: payload.presentation_definition },
      'VP request lacks presentation input descriptors');
  } catch (error) {
    fail(['OID4VP-REQ-01', 'OID4VP-DEF-02'], 'UPSTREAM_API', error);
  }
  try {
    const did = await VerifyService.getDidDocument();
    set('OID4VP-DID-03', Boolean(did.id && Array.isArray(did.verificationMethod) && did.verificationMethod.length),
      'UPSTREAM_API', { did: did.id, verificationMethods: did.verificationMethod?.length || 0 },
      'Verifier DID document has no verification method');
  } catch (error) {
    fail(['OID4VP-DID-03'], 'UPSTREAM_API', error);
  }
  const vpResponse = requirements.find(item => item.id === 'OID4VP-RESP-04')!;
  vpResponse.scope = 'WALLET_PRESENTATION';
  if (liveVc) {
    try {
      // Exercise the same project verification ingress used by the SDK and the
      // phone edge. The gateway binds the signed request state to its nonce
      // before forwarding a presentation to Inji Verify.
      const success = await LocalWalletService.presentToInjiVerify(liveVc);
      let gatewayNonceRejected = false;
      let gatewayNonceProbeError: string | undefined;
      try {
        await LocalWalletService.presentToInjiVerify(liveVc, 'MISMATCHED_NONCE');
        gatewayNonceProbeError = 'Gateway returned a verifier result instead of rejecting the mismatched challenge';
      } catch (error) {
        gatewayNonceProbeError = (error as any)?.nonceRejected === true
          ? 'Gateway returned its explicit nonce guard rejection'
          : 'Gateway nonce probe did not return its explicit rejection marker';
        gatewayNonceRejected = Boolean((error as any)?.nonceRejected === true);
      }
      // Keep a direct-upstream control to make upstream gaps visible. This
      // result does not decide project conformance because all project traffic
      // is required to pass through the nonce-enforcing gateway.
      let rawUpstreamNonceProbe: any = null;
      try {
        const raw = await LocalWalletService.presentToInjiVerify(liveVc, 'MISMATCHED_NONCE', true);
        rawUpstreamNonceProbe = { accepted: raw.valid === true,
          vpStatus: raw.verifierResult?.vpResultStatus,
          credentialStatuses: (raw.verifierResult?.vcResults || []).map((entry: any) => entry.verificationStatus) };
      } catch (error) {
        rawUpstreamNonceProbe = { accepted: false,
          rejectionLayer: (error as any)?.rejectionLayer || 'INJI_VERIFY' };
      }
      let holderSignatureRejected = false;
      try {
        const invalidProof = await LocalWalletService.presentToInjiVerify(liveVc, 'INVALID_SIGNATURE');
        holderSignatureRejected = !invalidProof.valid;
      } catch {
        holderSignatureRejected = true;
      }
      set('OID4VP-RESP-04', success.valid && gatewayNonceRejected && holderSignatureRejected, 'WALLET_PRESENTATION',
        { wallet: 'LOCAL_REFERENCE_WALLET', verifierPath: 'PLAYGROUND_VERIFY_GATEWAY_TO_INJI_VERIFY',
          transactionId: success.transactionId, vpStatus: success.verifierResult.vpResultStatus,
          vpCredentialStatuses: (success.verifierResult.vcResults || []).map((entry: any) => entry.verificationStatus),
          acceptVPWithoutHolderProof: false,
          nonceMismatch: { probeLayer: 'PLAYGROUND_VERIFY_GATEWAY',
            rejected: gatewayNonceRejected, probeError: gatewayNonceProbeError },
          rawUpstreamNonceControl: { probeLayer: 'DIRECT_UPSTREAM_INJI_VERIFY', ...rawUpstreamNonceProbe },
          tamperedHolderProofRejected: holderSignatureRejected },
        !success.valid ? 'Valid signed VP was not accepted' :
          !gatewayNonceRejected ? 'Project verification gateway did not explicitly reject the mismatched holder-proof nonce' :
            'A VP with a damaged holder proof was accepted');
    } catch (error) {
      fail(['OID4VP-RESP-04'], 'WALLET_PRESENTATION', error);
    }
  } else {
    vpResponse.failureReason = 'No live signed credential was available for wallet presentation';
  }

  try {
    const canonical = canonicalizeJson({ z: 1, a: { y: 2, x: 3 } });
    set('W3C-JCS-02', canonical === '{"a":{"x":3,"y":2},"z":1}', 'LOCAL_REFERENCE',
      { input: { z: 1, a: { y: 2, x: 3 } }, canonical }, 'Local canonicalizer did not produce deterministic sorted JSON');
    const expired = W3CVCProtocol.issueCredential({ issuerKeyPair: MockExternalService.issuerKeyPair,
      holderDid: 'did:example:audit-holder', type: ['AuditCredential'], claims: { name: 'Audit' }, validityDays: -1 });
    const expiredResult = W3CVCProtocol.verifyCredential(expired, MockExternalService.issuerKeyPair.publicKeyObject);
    set('W3C-TEMPORAL-04', !expiredResult.valid && !expiredResult.notExpired,
      'LOCAL_REFERENCE', { expiredCredentialRejected: !expiredResult.valid }, 'Expired local credential was accepted');
  } catch (error) {
    fail(['W3C-JCS-02', 'W3C-TEMPORAL-04'], 'LOCAL_REFERENCE', error);
  }

  try {
    const sd = SDJWTCrypto.issueSDJWT({ issuerKeyPair: MockExternalService.issuerKeyPair,
      holderDid: 'did:example:audit-holder', claims: { name: 'Audit', secret: 'hidden' },
      disclosableClaimKeys: ['secret'] });
    const disclosure = sd.disclosures[0];
    const decoded = JSON.parse(SDJWTCrypto.base64UrlDecode(disclosure.disclosureString));
    set('SDJWT-DISC-01', Array.isArray(decoded) && decoded.length === 3 &&
      Buffer.from(decoded[0], 'base64url').length >= 16, 'LOCAL_REFERENCE',
      { saltBytes: Buffer.from(decoded[0], 'base64url').length, claimName: decoded[1] },
      'Disclosure salt is shorter than 128 bits or structure is malformed');
    set('SDJWT-DIGEST-02', sd.payload._sd.includes(crypto.createHash('sha256')
      .update(disclosure.disclosureString).digest('base64url')), 'LOCAL_REFERENCE',
      { digestCount: sd.payload._sd.length, digestMatched: sd.payload._sd.includes(disclosure.digest) },
      'Disclosure digest does not match signed _sd value');
    const verified = SDJWTCrypto.verifySDJWT(sd.combinedSDJWT, MockExternalService.issuerKeyPair.publicKeyObject);
    const malformedSignature = sd.combinedSDJWT.replace(/^[^.]+\.[^.]+\./, match => match + 'A');
    const rejected = SDJWTCrypto.verifySDJWT(malformedSignature, MockExternalService.issuerKeyPair.publicKeyObject);
    set('SDJWT-SIGN-03', verified.signatureValid && !rejected.signatureValid, 'LOCAL_REFERENCE',
      { signedJwtAccepted: verified.signatureValid, mutatedSignatureRejected: !rejected.signatureValid },
      'Local SD-JWT JWS signature validation failed');
    const undisclosed = SDJWTCrypto.verifySDJWT(`${sd.issuerSignedJwt}~`, MockExternalService.issuerKeyPair.publicKeyObject);
    const corrupted = SDJWTCrypto.verifySDJWT(`${sd.issuerSignedJwt}~${disclosure.disclosureString}A~`,
      MockExternalService.issuerKeyPair.publicKeyObject);
    set('SDJWT-SELECT-04', verified.valid && undisclosed.valid && !('secret' in undisclosed.disclosedClaims) &&
      !corrupted.valid, 'LOCAL_REFERENCE',
      { disclosedAccepted: verified.valid, hiddenClaimAbsent: !('secret' in undisclosed.disclosedClaims), corruptedRejected: !corrupted.valid },
      'Selective disclosure privacy or digest rejection failed');
  } catch (error) {
    fail(['SDJWT-DISC-01', 'SDJWT-DIGEST-02', 'SDJWT-SIGN-03', 'SDJWT-SELECT-04'], 'LOCAL_REFERENCE', error);
  }

  try {
    const mdoc = MDocCrypto.issueMDoc({ issuerKeyPair: MockExternalService.issuerKeyPair,
      claims: { family_name: 'Audit', given_name: 'Subject' } });
    const item = MDocCrypto.createIssuerSignedItem(0, 'family_name', 'Audit');
    set('MDOC-CBOR-01', item.random.length >= 16 && item.encodedItemBytes.length > 0,
      'LOCAL_REFERENCE', { randomBytes: item.random.length, encodedBytes: item.encodedItemBytes.length },
      'IssuerSigned item lacks random salt or CBOR encoding');
    set('MDOC-MSO-02', mdoc.mso.digestAlgorithm === 'SHA-256' &&
      Object.keys(mdoc.mso.valueDigests['org.iso.18013.5.1']).length === 2,
      'LOCAL_REFERENCE', { digestAlgorithm: mdoc.mso.digestAlgorithm, digestCount: 2 },
      'MSO lacks SHA-256 value digests');
    const verified = MDocCrypto.verifyMDoc(mdoc.rawCborHex, MockExternalService.issuerKeyPair.publicKeyObject);
    const wrongKey = MDocCrypto.verifyMDoc(mdoc.rawCborHex, MockExternalService.verifierKeyPair.publicKeyObject);
    set('MDOC-COSE-03', verified.signatureValid && !wrongKey.signatureValid, 'LOCAL_REFERENCE',
      { correctKeyAccepted: verified.signatureValid, wrongKeyRejected: !wrongKey.signatureValid },
      'COSE signature check accepted wrong key or rejected issuer key');
    const expired = MDocCrypto.issueMDoc({ issuerKeyPair: MockExternalService.issuerKeyPair,
      validityDays: -1, claims: { family_name: 'Audit' } });
    const expiredResult = MDocCrypto.verifyMDoc(expired.rawCborHex, MockExternalService.issuerKeyPair.publicKeyObject);
    set('MDOC-TEMP-04', verified.valid && !expiredResult.valid && !expiredResult.notExpired,
      'LOCAL_REFERENCE', { currentAccepted: verified.valid, expiredRejected: !expiredResult.valid },
      'mDoc validity interval was not enforced');
  } catch (error) {
    fail(['MDOC-CBOR-01', 'MDOC-MSO-02', 'MDOC-COSE-03', 'MDOC-TEMP-04'], 'LOCAL_REFERENCE', error);
  }

  return requirements;
}
