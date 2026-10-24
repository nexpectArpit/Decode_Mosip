import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import net from 'node:net';
import * as crypto from 'node:crypto';
import { runWithFlowId } from './middleware/flow-context';
import issuerRouter from './routes/issuer.router';
import walletRouter from './routes/wallet.router';
import verifierRouter from './routes/verifier.router';
import inspectorRouter from './routes/inspector.router';
import interopRouter from './routes/interop.router';
import { CertifyService } from './services/certify.service';
import { ProtocolInspector } from './middleware/inspector';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ exposedHeaders: ['X-Playground-Flow-Id'] }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use((req, res, next) => {
  const supplied = req.header('X-Playground-Flow-Id');
  const flowId = supplied && /^[a-zA-Z0-9_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
  res.setHeader('X-Playground-Flow-Id', flowId);
  runWithFlowId(flowId, next);
});

app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/inspector/logs')) {
    return next();
  }
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    console.log(`[API] ${req.method} ${req.originalUrl} -> ${statusColor}${res.statusCode}\x1b[0m (${duration}ms)`);
  });
  next();
});

// Routes
app.use('/api/issuer', issuerRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/verifier', verifierRouter);
app.use('/api/inspector', inspectorRouter);
app.use('/api/interop', interopRouter);

// Certify 0.14.0 currently publishes its root DID in assertionMethod instead of
// the verification method URL. Keep the upstream defect visible in the issue
// draft, while serving a standards-shaped DID document from this local lab.
app.get('/api/did/certify', async (_req, res) => {
  try {
    const document = await CertifyService.getUpstreamDidDocument();
    const methods = Array.isArray(document.verificationMethod) ? document.verificationMethod : [];
    const assertion = Array.isArray(document.assertionMethod) ? document.assertionMethod : [];
    const controlledMethods = methods
      .filter((method: any) => method?.controller === document.id && typeof method.id === 'string')
      .map((method: any) => method.id);

    if (typeof document.id !== 'string' || !assertion.includes(document.id) || controlledMethods.length === 0) {
      throw new Error('Certify DID document did not match the known assertionMethod defect');
    }

    const repaired = { ...document, assertionMethod: [
      ...assertion.filter((method: unknown) => method !== document.id),
      ...controlledMethods
    ] };
    ProtocolInspector.record({ protocol: 'SYSTEM', step: 'Local Certify DID assertionMethod compatibility repair',
      actor: 'BFF', direction: 'RESPONSE', endpoint: '/.well-known/did.json', method: 'GET',
      headers: { 'X-Playground-DID-Compatibility': 'assertion-method-key-reference-repair' },
      payload: { did: document.id, upstreamAssertionMethod: assertion, servedAssertionMethod: repaired.assertionMethod }, status: 200 });
    res.setHeader('X-Playground-DID-Compatibility', 'assertion-method-key-reference-repair');
    res.json(repaired);
  } catch (error: any) {
    res.status(502).json({ error: `Certify DID compatibility adapter failed: ${error.message}` });
  }
});

// System Health Endpoint
app.get('/api/health', async (_req, res) => {
  const certifyBase = process.env.CERTIFY_URL || 'http://localhost:8090/v1/certify';
  const certifyNginx = process.env.CERTIFY_NGINX_URL || 'http://localhost:8091';
  const mimotoBase = process.env.MIMOTO_URL || 'http://localhost:8099/v1/mimoto';
  const verifyBase = process.env.VERIFY_URL || 'http://localhost:8095/v1/verify';
  const databaseHost = process.env.DATABASE_HOST || 'localhost';
  const databasePort = Number(process.env.DATABASE_PORT || 5433);
  const health = {
    certify: { status: 'UNKNOWN', url: certifyBase },
    mimoto: { status: 'UNKNOWN', url: mimotoBase },
    verify: { status: 'UNKNOWN', url: verifyBase },
    database: { status: 'UNKNOWN', url: `${databaseHost}:${databasePort}` }
  };

  try {
    const resCertify = await fetch(`${certifyNginx}/.well-known/openid-credential-issuer`, { signal: AbortSignal.timeout(3000) });
    health.certify.status = resCertify.ok ? 'UP' : 'DOWN';
  } catch {
    health.certify.status = 'DOWN';
  }

  try {
    const resMimoto = await fetch(`${mimotoBase}/issuers`, { signal: AbortSignal.timeout(3000) });
    health.mimoto.status = resMimoto.status < 500 ? 'UP' : 'DOWN';
  } catch {
    health.mimoto.status = 'DOWN';
  }

  try {
    const resVerify = await fetch(`${verifyBase}/did.json`, { signal: AbortSignal.timeout(3000) });
    health.verify.status = resVerify.ok ? 'UP' : 'DOWN';
  } catch {
    health.verify.status = 'DOWN';
  }

  health.database.status = await new Promise<'UP' | 'DOWN'>((resolve) => {
    const socket = net.createConnection({ host: databaseHost, port: databasePort });
    const finish = (status: 'UP' | 'DOWN') => {
      socket.destroy();
      resolve(status);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => finish('UP'));
    socket.once('error', () => finish('DOWN'));
    socket.once('timeout', () => finish('DOWN'));
  });

  res.json(health);
});

app.listen(PORT, () => {
  console.log(`[API] Inji Interop Lab Server running on http://localhost:${PORT}`);
});
