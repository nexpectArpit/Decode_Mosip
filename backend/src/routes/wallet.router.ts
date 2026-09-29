import { Router } from 'express';
import { MimotoService } from '../services/mimoto.service';

const router = Router();

router.get('/issuers', async (req, res) => {
  try {
    const issuers = await MimotoService.getIssuers();
    res.json(issuers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
