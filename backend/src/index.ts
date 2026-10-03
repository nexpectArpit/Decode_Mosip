import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import issuerRouter from './routes/issuer.router';
import walletRouter from './routes/wallet.router';
import verifierRouter from './routes/verifier.router';
import inspectorRouter from './routes/inspector.router';
import interopRouter from './routes/interop.router';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

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

// System Health Endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    certify: { status: 'UNKNOWN', url: 'http://localhost:8090/v1/certify' },
    mimoto: { status: 'UNKNOWN', url: 'http://localhost:8099/v1/mimoto' },
    verify: { status: 'UNKNOWN', url: 'http://localhost:8095/v1/verify' },
    database: { status: 'UNKNOWN', url: 'localhost:5433' }
  };

  try {
    const resCertify = await fetch('http://localhost:8091/.well-known/openid-credential-issuer');
    health.certify.status = resCertify.ok ? 'UP' : 'DOWN';
  } catch {
    health.certify.status = 'DOWN';
  }

  try {
    const resMimoto = await fetch('http://localhost:8099/v1/mimoto/issuers');
    health.mimoto.status = resMimoto.ok ? 'UP' : 'DOWN';
  } catch {
    health.mimoto.status = 'DOWN';
  }

  try {
    const resVerify = await fetch('http://localhost:8095/v1/verify/did.json');
    health.verify.status = resVerify.ok ? 'UP' : 'DOWN';
  } catch {
    health.verify.status = 'DOWN';
  }

  health.database.status = (health.certify.status === 'UP' && health.mimoto.status === 'UP') ? 'UP' : 'DOWN';

  res.json(health);
});

app.listen(PORT, () => {
  console.log(`[API] Inji Interop Lab Server running on http://localhost:${PORT}`);
});
