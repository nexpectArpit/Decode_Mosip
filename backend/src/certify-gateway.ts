import express from 'express';
import { createHash } from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 8080);
const upstream = (process.env.CERTIFY_GATEWAY_UPSTREAM || 'http://certify-nginx').replace(/\/$/, '');
const MAX_TRACE_AGE = 10 * 60_000;
type Trace = { id: string; timestamp: string; step: string; actor: 'WALLET' | 'ISSUER';
  direction: 'REQUEST' | 'RESPONSE'; endpoint: string; method: string; headers: Record<string, string>;
  payload: unknown; status?: number; durationMs?: number };
const flowsByOffer = new Map<string, { flowId: string; expiresAt: number }>();
const flowsByCodeHash = new Map<string, { flowId: string; expiresAt: number }>();
const flowsByTokenHash = new Map<string, { flowId: string; expiresAt: number }>();
const tracesByFlow = new Map<string, Trace[]>();
let nextTraceId = 0;

function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function getFlow(map: Map<string, { flowId: string; expiresAt: number }>, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const entry = map.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) { map.delete(key); return undefined; }
  return entry.flowId;
}
function remember(map: Map<string, { flowId: string; expiresAt: number }>, key: string, flowId: string): void {
  map.set(key, { flowId, expiresAt: Date.now() + MAX_TRACE_AGE });
  if (map.size > 1000) map.delete(map.keys().next().value!);
}
function record(flowId: string | undefined, entry: Omit<Trace, 'id' | 'timestamp'>): void {
  if (!flowId) return;
  const events = tracesByFlow.get(flowId) || [];
  events.push({ ...entry, id: `certify_gateway_${++nextTraceId}`, timestamp: new Date().toISOString() });
  tracesByFlow.set(flowId, events.slice(-40));
  if (tracesByFlow.size > 1000) tracesByFlow.delete(tracesByFlow.keys().next().value!);
}
function parseJson(bytes: Buffer): any {
  try { return JSON.parse(bytes.toString('utf8')); } catch { return null; }
}

app.use(express.raw({ type: '*/*', limit: '5mb' }));
app.get('/health', async (_req, res) => {
  try {
    const response = await fetch(`${upstream}/.well-known/openid-credential-issuer`, { signal: AbortSignal.timeout(3000) });
    res.status(response.ok ? 200 : 503).json({ status: response.ok ? 'ok' : 'starting' });
  } catch { res.status(503).json({ status: 'starting' }); }
});
app.post('/internal/register-offer', (req, res) => {
  const body = Buffer.isBuffer(req.body) ? parseJson(req.body) : null;
  if (!body || typeof body.offerId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.offerId) ||
      typeof body.flowId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.flowId)) {
    return res.status(400).json({ error: 'Invalid offer registration' });
  }
  remember(flowsByOffer, body.offerId, body.flowId);
  res.status(201).json({ registered: true });
});
app.get('/internal/trace/:flowId', (req, res) => {
  res.json({ flowId: req.params.flowId, events: tracesByFlow.get(req.params.flowId) || [] });
});

app.use(async (req, res) => {
  if (!req.path.startsWith('/v1/certify/')) return res.sendStatus(404);
  const started = Date.now();
  const offerId = req.method === 'GET' ? req.path.match(/\/credential-offer-data\/([^/]+)$/)?.[1] : undefined;
  const isToken = req.method === 'POST' && req.path.endsWith('/oauth/token');
  const isCredential = req.method === 'POST' && req.path.endsWith('/issuance/credential');
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const form = isToken ? new URLSearchParams(body.toString('utf8')) : undefined;
  const code = form?.get('pre-authorized_code') || undefined;
  const bearer = isCredential ? req.header('authorization')?.replace(/^Bearer\s+/i, '') : undefined;
  const flowId = getFlow(flowsByOffer, offerId) || getFlow(flowsByCodeHash, code && digest(code)) ||
    getFlow(flowsByTokenHash, bearer && digest(bearer));
  const relevant = Boolean(offerId || isToken || isCredential);
  if (relevant) record(flowId, { step: offerId ? 'Wallet retrieves Certify credential offer' : isToken ?
    'Wallet exchanges pre-authorized code' : 'Wallet requests credential with bearer and proof',
    actor: 'WALLET', direction: 'REQUEST', endpoint: req.path, method: req.method,
    headers: { 'Content-Type': req.header('content-type') || '', Authorization: bearer ? 'Bearer [REDACTED]' : '' },
    payload: offerId ? { offerId } : isToken ? { grantType: form?.get('grant_type'), preAuthorizedCodePresent: Boolean(code) } :
      { proofPresent: Boolean(parseJson(body)?.proof), format: parseJson(body)?.format } });

  try {
    const headers: Record<string, string> = { 'accept-encoding': 'identity' };
    for (const name of ['accept', 'content-type', 'authorization', 'origin', 'x-forwarded-proto']) {
      const value = req.header(name);
      if (value) headers[name] = value;
    }
    if (req.header('host')) headers.host = req.header('host')!;
    headers['x-forwarded-host'] = req.header('host') || '';
    const response = await fetch(`${upstream}${req.originalUrl}`, {
      method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : new Uint8Array(body)
    });
    const responseBytes = Buffer.from(await response.arrayBuffer());
    const data = response.ok && relevant ? parseJson(responseBytes) : null;
    if (offerId && flowId && data) {
      const preAuthCode = data.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code'];
      if (typeof preAuthCode === 'string') remember(flowsByCodeHash, digest(preAuthCode), flowId);
    }
    if (isToken && flowId && typeof data?.access_token === 'string') {
      remember(flowsByTokenHash, digest(data.access_token), flowId);
    }
    if (relevant) record(flowId, { step: offerId ? 'Certify returns credential offer' : isToken ?
      'Certify returns access token and c_nonce' : 'Certify returns signed credential',
      actor: 'ISSUER', direction: 'RESPONSE', endpoint: req.path, method: req.method,
      headers: { 'Content-Type': response.headers.get('content-type') || '' },
      payload: offerId ? { credentialIssuer: data?.credential_issuer, preAuthorizedCodePresent: Boolean(data?.grants) } :
        isToken ? { accessTokenPresent: Boolean(data?.access_token), cNoncePresent: Boolean(data?.c_nonce) } :
          { credentialPresent: Boolean(data?.credential), proofType: data?.credential?.proof?.type },
      status: response.status, durationMs: Date.now() - started });
    for (const name of ['content-type', 'cache-control', 'location', 'access-control-allow-origin',
      'access-control-allow-methods', 'access-control-allow-headers']) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.status(response.status).send(responseBytes);
  } catch (error: any) {
    res.status(502).json({ error: 'CERTIFY_GATEWAY_UPSTREAM_ERROR', message: error.message });
  }
});

app.listen(port, '0.0.0.0', () => console.log(`Certify trace gateway listening on ${port}`));
