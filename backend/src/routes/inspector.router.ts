import { Router } from 'express';
import { inspectorStore } from '../middleware/inspector';

const router = Router();

router.get('/logs', (req, res) => {
  const { protocol, actor } = req.query;
  const logs = inspectorStore.getLogs(protocol as string, actor as string);
  res.json({ logs });
});

router.delete('/logs', (req, res) => {
  inspectorStore.clearLogs();
  res.json({ message: 'Inspector logs cleared' });
});

export default router;
