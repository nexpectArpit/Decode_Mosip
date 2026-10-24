import express from 'express';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { verifyIndependentVP, type IndependentVPResult } from './services/independent-vp.service';

const app = express();
const port = Number(process.env.PORT || 8080);
const upstream = (process.env.VERIFY_UPSTREAM_URL || 'http://verify-service:8080').replace(/\/$/, '');
const requests = new Map<string, { nonce: string; clientId: string; expiresAt: number; transactionId?: string }>();
const transactionByRequestId = new Map<string, string>();
const requestProtocolByRequestId = new Map<string, 'draft' | 'openid4vp-v1'>();
const requestExpiresAt = new Map<string, number>();
type GatewayTrace = { id: string; timestamp: string; step: string; actor: 'WALLET' | 'VERIFIER';
  direction: 'REQUEST' | 'RESPONSE'; endpoint: string; method: string; headers: Record<string, string>;
  payload: unknown; status?: number; durationMs?: number };
const tracesByTransaction = new Map<string, GatewayTrace[]>();
type SubmittedVPMetadata = { proofType?: string; jwsAlgorithm?: string;
  verificationMethodScheme?: string; verificationMethodFragmentCount?: number;
  holderScheme?: string; holderFragmentCount?: number; proofMethodMatchesHolder?: boolean;
  submittedCredentialCount: number; submittedCredentialFormats: string[];
  submittedCredentialProofTypes: string[]; submittedIssuerIds: string[] };
const proofDiagnosticsByTransaction = new Map<string, SubmittedVPMetadata>();
const independentResultsByTransaction = new Map<string, IndependentVPResult>();
const finalResultsRecorded = new Set<string>();
let nextTraceId = 0;
const TTL_MS = 5 * 60_000;
const independentVPEnabled = process.env.VERIFY_INDEPENDENT_VP_ENABLED === 'true';
const verifyDid = process.env.VERIFY_PUBLIC_DID || 'did:web:localhost:v1:verify';
const signingKeyPath = process.env.VERIFY_REQUEST_SIGNING_KEY_PATH ||
  path.resolve(process.cwd(), 'data/verify-request-signing-key.pem');

function loadSigningKey(): { privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']; publicKey: Buffer } {
  let privateKeyPem: string;
  if (existsSync(signingKeyPath)) {
    privateKeyPem = readFileSync(signingKeyPath, 'utf8');
  } else {
    mkdirSync(path.dirname(signingKeyPath), { recursive: true });
    const pair = generateKeyPairSync('ed25519');
    privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    try {
      writeFileSync(signingKeyPath, privateKeyPem, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      privateKeyPem = readFileSync(signingKeyPath, 'utf8');
    }
  }
  const privateKey = createPrivateKey(privateKeyPem);
  const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }) as Buffer;
  return { privateKey, publicKey: spki.subarray(-32) };
}

function base58btc(input: Buffer): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt(`0x${input.toString('hex')}`);
  let encoded = '';
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = alphabet[remainder] + encoded;
    value /= 58n;
  }
  for (const byte of input) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return `z${encoded}`;
}

const requestSigningKey = loadSigningKey();
const verifyKeyId = `${verifyDid}#key-0`;

function signAuthorizationRequest(jwt: string, expiresAtMs?: number, openid4vpV1 = false): string {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Inji Verify returned an invalid authorization request JWT');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (typeof payload.nonce !== 'string' || typeof payload.state !== 'string' ||
      typeof payload.response_uri !== 'string') {
    throw new Error('Inji Verify authorization request is missing nonce, state, or response_uri');
  }
  const now = Math.floor(Date.now() / 1000);
  const expiry = expiresAtMs ? Math.min(now + 300, Math.floor(expiresAtMs / 1000)) : now + 300;
  const requestHeader = Buffer.from(JSON.stringify({ ...header, typ: 'oauth-authz-req+jwt', alg: 'EdDSA', kid: verifyKeyId }))
    .toString('base64url');
  const clientId = typeof payload.client_id === 'string' ? payload.client_id : verifyDid;
  const signedPayload: Record<string, unknown> = openid4vpV1
    ? { ...payload, iss: clientId, aud: clientId, client_id: clientId,
      iat: typeof payload.iat === 'number' ? payload.iat : now, exp: expiry }
    : { ...payload, iss: verifyDid, aud: verifyDid, client_id: clientId,
      client_id_scheme: 'did', iat: typeof payload.iat === 'number' ? payload.iat : now, exp: expiry };
  // OpenID4VP 1.0 carries the client identifier scheme in the standardized
  // `decentralized_identifier:` prefix on client_id. Do not leak the old
  // draft-era client_id_scheme parameter into a 1.0 Request Object.
  if (openid4vpV1) delete signedPayload.client_id_scheme;
  const requestPayload = Buffer.from(JSON.stringify(signedPayload))
    .toString('base64url');
  const signingInput = `${requestHeader}.${requestPayload}`;
  const signature = sign(null, Buffer.from(signingInput), requestSigningKey.privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

function recordTrace(transactionId: string | undefined, entry: Omit<GatewayTrace, 'id' | 'timestamp'>): void {
  if (!transactionId) return;
  const traces = tracesByTransaction.get(transactionId) || [];
  traces.push({ ...entry, id: `gateway_${++nextTraceId}`, timestamp: new Date().toISOString() });
  tracesByTransaction.set(transactionId, traces.slice(-50));
  if (tracesByTransaction.size > 1000) tracesByTransaction.delete(tracesByTransaction.keys().next().value!);
}

function decodeJwtPayload(jwt: string): any {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Verifier authorization request is not a compact JWT');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

function findProofChallenge(vpToken: any): string | undefined {
  const presentations = collectPresentations(vpToken);
  for (const presentation of presentations) {
    const proofs = Array.isArray(presentation?.proof) ? presentation.proof : [presentation?.proof];
    for (const proof of proofs) if (typeof proof?.challenge === 'string') return proof.challenge;
  }
  return undefined;
}

// Draft-era OpenID4VP responses commonly carried VP arrays. OpenID4VP 1.0
// keys vp_token by the DCQL credential query id, so normalize either shape
// without relaxing the nonce check or retaining credential bodies.
function collectPresentations(vpToken: any, depth = 0): any[] {
  if (depth > 8 || vpToken == null) return [];
  if (Array.isArray(vpToken)) return vpToken.flatMap((item) => collectPresentations(item, depth + 1));
  if (typeof vpToken !== 'object') return [];
  const types = Array.isArray(vpToken.type) ? vpToken.type : [vpToken.type];
  if (typeof vpToken.holder === 'string' || Array.isArray(vpToken.verifiableCredential) ||
      types.includes('VerifiablePresentation')) return [vpToken];
  return Object.values(vpToken).flatMap((item) => collectPresentations(item, depth + 1));
}

function inspectProof(vpToken: any): SubmittedVPMetadata {
  const presentation = collectPresentations(vpToken)[0];
  const proof = Array.isArray(presentation?.proof) ? presentation.proof[0] : presentation?.proof;
  const method = typeof proof?.verificationMethod === 'string' ? proof.verificationMethod : '';
  const holder = typeof presentation?.holder === 'string' ? presentation.holder : '';
  let jwsAlgorithm: string | undefined;
  if (typeof proof?.jws === 'string') {
    try {
      const header = JSON.parse(Buffer.from(proof.jws.split('.')[0], 'base64url').toString('utf8'));
      if (typeof header.alg === 'string') jwsAlgorithm = header.alg;
    } catch { /* Malformed JWS is left for Inji Verify to reject. */ }
  }
  const submittedCredentials = Array.isArray(presentation?.verifiableCredential)
    ? presentation.verifiableCredential.slice(0, 20) : [];
  const strings = (values: unknown[]) => [...new Set(values.filter((value): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 256))];
  return {
    ...(typeof proof?.type === 'string' ? { proofType: proof.type } : {}),
    ...(jwsAlgorithm ? { jwsAlgorithm } : {}),
    ...(method ? { verificationMethodScheme: method.split(':')[0],
      verificationMethodFragmentCount: method.split('#').length - 1 } : {}),
    ...(holder ? { holderScheme: holder.split(':')[0],
      holderFragmentCount: holder.split('#').length - 1 } : {}),
    ...(method && holder ? { proofMethodMatchesHolder: method === holder } : {}),
    submittedCredentialCount: Array.isArray(presentation?.verifiableCredential)
      ? presentation.verifiableCredential.length : 0,
    submittedCredentialFormats: strings(submittedCredentials.map((credential: any) =>
      typeof credential === 'string' ? 'unclassified-string' :
        credential && typeof credential === 'object' && Array.isArray(credential['@context']) ? 'ldp_vc' : undefined)),
    submittedCredentialProofTypes: strings(submittedCredentials.map((credential: any) => credential?.proof?.type)),
    submittedIssuerIds: strings(submittedCredentials.map((credential: any) =>
      typeof credential?.issuer === 'string' ? credential.issuer : credential?.issuer?.id))
  };
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: ['text/plain', 'application/vc+sd-jwt'], limit: '5mb' }));

app.get('/health', async (_req, res) => {
  try {
    const response = await fetch(`${upstream}/v1/verify/did.json`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`Verify returned ${response.status}`);
    res.json({ status: 'ok', upstream, verifyDid: 'UP' });
  } catch (error: any) {
    res.status(503).json({ status: 'starting', upstream, verifyDid: 'DOWN', error: error.message });
  }
});

// Inji Verify 0.17.x and 0.18.2 omit aud/exp from its request JWT. Inji Mobile
// validates those claims, so expose a stable gateway DID and re-sign the
// otherwise unchanged request object with the required dynamic-discovery claims.
app.get('/v1/verify/did.json', (_req, res) => {
  const keyMultibase = base58btc(Buffer.concat([Buffer.from([0xed, 0x01]), requestSigningKey.publicKey]));
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: verifyDid,
    verificationMethod: [{ id: verifyKeyId, type: 'Ed25519VerificationKey2020', controller: verifyDid,
      publicKeyMultibase: keyMultibase, '@context': 'https://w3id.org/security/suites/ed25519-2020/v1' }],
    authentication: [verifyKeyId],
    assertionMethod: [verifyKeyId],
    service: [],
    alsoKnownAs: []
  });
});

// Metadata only: VP credential bodies and bearer values are never stored here.
app.get('/internal/trace/:transactionId', (req, res) => {
  res.json({ transactionId: req.params.transactionId, events: tracesByTransaction.get(req.params.transactionId) || [] });
});

app.get('/internal/proof-diagnostic/:transactionId', (req, res) => {
  res.json({ transactionId: req.params.transactionId,
    proof: proofDiagnosticsByTransaction.get(req.params.transactionId) || null });
});

app.get('/internal/independent-result/:transactionId', (req, res) => {
  res.json({ transactionId: req.params.transactionId,
    result: independentResultsByTransaction.get(req.params.transactionId) || null });
});

function setIndependentResult(transactionId: string, result: IndependentVPResult): void {
  independentResultsByTransaction.set(transactionId, result);
  if (independentResultsByTransaction.size > 1000) {
    independentResultsByTransaction.delete(independentResultsByTransaction.keys().next().value!);
  }
  if (result.status !== 'PENDING') {
    recordTrace(transactionId, {
      step: 'Independent VP proof and Inji Verify VC check', actor: 'VERIFIER',
      direction: 'RESPONSE', endpoint: '/internal/independent-result', method: 'GET',
      headers: {}, payload: result
    });
  }
}

app.use(async (req, res) => {
  const target = `${upstream}${req.path}${req.url.includes('?') ? `?${req.url.split('?').slice(1).join('?')}` : ''}`;
  const startedAt = Date.now();
  const isVPRequest = req.method === 'POST' && /(?:\/vp-request|\/v2\/vp-session-request)$/.test(req.path);
  const isDirectPost = req.method === 'POST' && /(?:\/vp-submission\/direct-post|\/v2\/vp-submission\/direct-post)$/.test(req.path);
  const requestId = req.method === 'GET' ? req.path.match(/\/vp-request\/([^/]+)$/)?.[1] : undefined;
  const resultTransactionId = req.method === 'GET' ? req.path.match(/\/vp-result\/([^/]+)$/)?.[1] : undefined;
  const postedState = isDirectPost && typeof req.body?.state === 'string' ? req.body.state : undefined;
  const postedTransactionId = postedState
    ? requests.get(postedState)?.transactionId || transactionByRequestId.get(postedState)
    : undefined;
  try {
    const headers: Record<string, string> = {};
    // Session-based OID4VP 1.0 result retrieval requires the browser's Verify
    // session cookie. Forward it only to the configured Verify upstream.
    for (const name of ['accept', 'content-type', 'authorization', 'cookie']) {
      const value = req.header(name);
      if (value) headers[name] = value;
    }
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined :
      req.is('application/x-www-form-urlencoded') ? new URLSearchParams(req.body).toString() :
        req.is('application/json') ? JSON.stringify(req.body) :
          typeof req.body === 'string' ? req.body : undefined;
    let nonceGuardPassed = false;
    if (isVPRequest) recordTrace(req.body?.transactionId, {
      step: 'Verifier creates OpenID4VP request', actor: 'VERIFIER', direction: 'REQUEST', endpoint: req.path,
      method: req.method, headers: { 'Content-Type': req.header('content-type') || '' },
      payload: { clientId: req.body?.clientId, transactionId: req.body?.transactionId,
        presentationDefinition: req.body?.presentationDefinition || req.body?.presentationDefinitionId,
        dcqlQuery: req.body?.dcqlQuery }
    });
    if (isDirectPost) recordTrace(postedTransactionId, {
      step: 'Wallet submits VP by direct_post', actor: 'WALLET', direction: 'REQUEST', endpoint: req.path,
      method: req.method, headers: { 'Content-Type': req.header('content-type') || '' },
      payload: { state: postedState, vpTokenPresent: Boolean(req.body?.vp_token),
        presentationSubmissionPresent: Boolean(req.body?.presentation_submission), credentialBody: '[REDACTED]' }
    });
    if (isDirectPost) {
      const state = typeof req.body?.state === 'string' ? req.body.state : '';
      const cached = requests.get(state);
      const vpToken = typeof req.body?.vp_token === 'string' ? JSON.parse(req.body.vp_token) : req.body?.vp_token;
      if (postedTransactionId) {
        const proof = inspectProof(vpToken);
        proofDiagnosticsByTransaction.set(postedTransactionId, proof);
        if (proofDiagnosticsByTransaction.size > 1000) {
          proofDiagnosticsByTransaction.delete(proofDiagnosticsByTransaction.keys().next().value!);
        }
        recordTrace(postedTransactionId, { step: 'Wallet VP proof metadata', actor: 'WALLET',
          direction: 'REQUEST', endpoint: req.path, method: req.method, headers: {}, payload: proof });
      }
      const challenge = findProofChallenge(vpToken);
      const expired = cached && cached.expiresAt <= Date.now();
      if (expired) requests.delete(state);
      if (!cached || expired || !challenge || challenge !== cached.nonce) {
        const rejection = !cached || expired ? 'missing_or_expired_state' :
          !challenge ? 'vp_proof_challenge_missing' : 'vp_proof_challenge_mismatch';
        console.warn(`[Verify Gateway] Rejected direct_post nonce guard: ${rejection}; endpoint=${req.path}`);
        res.setHeader('X-Playground-Nonce-Guard', 'rejected');
        recordTrace(postedTransactionId, { step: 'Gateway rejects VP nonce', actor: 'VERIFIER',
          direction: 'RESPONSE', endpoint: req.path, method: req.method, headers: { 'X-Playground-Nonce-Guard': 'rejected' },
          payload: { error: 'NONCE_VALIDATION_FAILED', reason: rejection }, status: 400, durationMs: Date.now() - startedAt });
        res.status(400).json({ error: 'NONCE_VALIDATION_FAILED', message: !cached || expired
          ? 'No active verifier nonce is associated with this presentation state'
          : !challenge ? 'Holder proof has no challenge' : 'Holder proof challenge does not match the verifier request nonce' });
        return;
      }
      nonceGuardPassed = true;
      requests.delete(state);
      if (independentVPEnabled && postedTransactionId) {
        const transactionId = postedTransactionId;
        setIndependentResult(transactionId, {
          status: 'PENDING', reason: 'VERIFICATION_IN_PROGRESS',
          vpProofValid: false, holderBindingValid: false, nonceValid: true,
          credentialSubjectBindingValid: false,
          verificationMethodFragmentCount: 0, credentialCount: 0, credentialStatuses: [],
          credentialVerifier: 'INJI_VERIFY_VC_API'
        });
        void (async () => {
          const presentations = collectPresentations(vpToken);
          if (presentations.length !== 1) throw new Error('Expected exactly one linked-data presentation');
          const assessment = await verifyIndependentVP({
            vp: presentations[0], expectedNonce: cached.nonce, expectedDomain: cached.clientId,
            verifyCredential: async (credential) => {
              const response = await fetch(`${upstream}/v1/verify/vc-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(credential),
                signal: AbortSignal.timeout(12000)
              });
              if (!response.ok) throw new Error(`VC verifier returned ${response.status}`);
              const result = await response.json() as { verificationStatus?: unknown };
              if (typeof result.verificationStatus !== 'string') {
                throw new Error('VC verifier returned no status');
              }
              return { verificationStatus: result.verificationStatus };
            }
          });
          setIndependentResult(transactionId, assessment);
        })().catch(() => setIndependentResult(transactionId, {
          status: 'ERROR', reason: 'INDEPENDENT_VERIFICATION_ERROR',
          vpProofValid: false, holderBindingValid: false, nonceValid: true,
          credentialSubjectBindingValid: false,
          verificationMethodFragmentCount: 0, credentialCount: 0, credentialStatuses: [],
          credentialVerifier: 'INJI_VERIFY_VC_API'
        }));
      }
    }

    // Forward only after the nonce guard has accepted the request.
    const response = await fetch(target, { method: req.method, headers, body });
    let text = await response.text();

    if (isVPRequest && response.ok) {
      const result = JSON.parse(text);
      if (typeof result.requestId === 'string' && typeof result.transactionId === 'string') {
        transactionByRequestId.set(result.requestId, result.transactionId);
        requestProtocolByRequestId.set(result.requestId,
          req.path.includes('/v2/vp-session-request') ? 'openid4vp-v1' : 'draft');
        if (typeof result.expiresAt === 'number') requestExpiresAt.set(result.requestId, result.expiresAt);
        recordTrace(result.transactionId, { step: 'Verifier returns request QR transaction', actor: 'VERIFIER',
          direction: 'RESPONSE', endpoint: req.path, method: req.method, headers: { 'Content-Type': response.headers.get('content-type') || '' },
          payload: { requestId: result.requestId, transactionId: result.transactionId, requestUri: result.requestUri },
          status: response.status, durationMs: Date.now() - startedAt });
      }
    }

    if (req.method === 'GET' && /\/vp-request\/[^/]+$/.test(req.path) && response.ok) {
      const jwt = signAuthorizationRequest(text.trim(), requestExpiresAt.get(requestId || ''),
        requestProtocolByRequestId.get(requestId || '') === 'openid4vp-v1');
      text = jwt;
      const payload = decodeJwtPayload(jwt);
      if (typeof payload.state === 'string' && typeof payload.nonce === 'string' && typeof payload.client_id === 'string') {
        requests.set(payload.state, { nonce: payload.nonce, clientId: payload.client_id,
          expiresAt: Date.now() + TTL_MS,
          transactionId: requestId ? transactionByRequestId.get(requestId) : undefined });
        recordTrace(requestId ? transactionByRequestId.get(requestId) : undefined, {
          step: 'Wallet retrieves signed verifier request', actor: 'WALLET', direction: 'RESPONSE',
          endpoint: req.path, method: req.method, headers: { 'Content-Type': response.headers.get('content-type') || '' },
          payload: { state: payload.state, nonce: payload.nonce, clientId: payload.client_id,
            responseUri: payload.response_uri }, status: response.status, durationMs: Date.now() - startedAt });
      }
    }
    if (isDirectPost) recordTrace(postedTransactionId, { step: 'Inji Verify receives wallet VP', actor: 'VERIFIER',
      direction: 'RESPONSE', endpoint: req.path, method: req.method,
      headers: { 'Content-Type': response.headers.get('content-type') || '',
        'X-Playground-Nonce-Guard': nonceGuardPassed ? 'passed' : 'not-checked' },
      payload: { upstreamStatus: response.status, response: text.slice(0, 1500) },
      status: response.status, durationMs: Date.now() - startedAt });
    if (resultTransactionId && response.ok) {
      try {
        const result = JSON.parse(text);
        if (typeof result.vpResultStatus === 'string' && !['PENDING', 'PROCESSING', 'CREATED'].includes(result.vpResultStatus) &&
            !finalResultsRecorded.has(resultTransactionId)) {
          finalResultsRecorded.add(resultTransactionId);
          recordTrace(resultTransactionId, { step: 'Inji Verify final VP result', actor: 'VERIFIER', direction: 'RESPONSE',
            endpoint: req.path, method: req.method, headers: { 'Content-Type': response.headers.get('content-type') || '' },
            payload: { vpResultStatus: result.vpResultStatus,
              credentialStatuses: Array.isArray(result.vcResults) ? result.vcResults.map((item: any) => item.verificationStatus) : [] },
            status: response.status, durationMs: Date.now() - startedAt });
        }
      } catch { /* The upstream response is still forwarded unchanged. */ }
    }
    if (nonceGuardPassed) res.setHeader('X-Playground-Nonce-Guard', 'passed');

    // The OpenID4VP 1.0 SDK uses Verify's session cookie to fetch session
    // results. Preserve Set-Cookie through this same-origin compatibility proxy.
    for (const name of ['content-type', 'cache-control', 'location', 'set-cookie']) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.status(response.status).send(text);
  } catch (error: any) {
    res.status(502).json({ error: 'VERIFY_GATEWAY_UPSTREAM_ERROR', message: error.message });
  }
});

app.listen(port, '0.0.0.0', () => console.log(`Verify compatibility gateway listening on ${port}; upstream=${upstream}; did=${verifyDid}`));
