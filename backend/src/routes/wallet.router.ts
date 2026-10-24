import { Router } from 'express';
import { MimotoService } from '../services/mimoto.service';
import { LocalWalletService } from '../services/local-wallet.service';

const router = Router();

router.get('/issuers', async (_req, res) => {
  try {
    const issuers = await MimotoService.getIssuers();
    res.json(issuers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/present-vp', async (req, res) => {
  try {
    const supportedAttacks = req.body?.verifierImplementation === 'MOCK_EXTERNAL_OID4VP'
      ? ['NONE', 'MISMATCHED_NONCE', 'INVALID_SIGNATURE', 'CORRUPTED_DISCLOSURE']
      : ['NONE', 'MISMATCHED_NONCE', 'INVALID_SIGNATURE'];
    const attack = req.body?.attack ?? 'NONE';
    if (!supportedAttacks.includes(attack)) {
      res.status(400).json({ error: `Attack ${String(attack)} is not supported by this wallet and verifier path` });
      return;
    }
    const result = req.body?.verifierImplementation === 'MOCK_EXTERNAL_OID4VP'
      ? await LocalWalletService.presentSDJWTToMockVerifier(req.body?.vc, attack)
      : await LocalWalletService.presentToInjiVerify(req.body?.vc, attack);
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
