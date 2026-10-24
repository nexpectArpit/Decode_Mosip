import { Router } from 'express';
import { inspectorStore, ProtocolInspector } from '../middleware/inspector';
import { runWithFlowId } from '../middleware/flow-context';

const router = Router();
const importedGatewayEvents = new Set<string>();

router.get('/logs', async (req, res) => {
  const { protocol, actor, flowId } = req.query;
  if (typeof flowId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(flowId)) {
    const verifyGateway = process.env.VERIFY_GATEWAY_URL || (process.env.VERIFY_URL
      ? new URL(process.env.VERIFY_URL).origin : 'http://localhost:8095');
    const gateways = [{ base: verifyGateway, protocol: 'OpenID4VP' as const },
      { base: process.env.CERTIFY_GATEWAY_URL, protocol: 'OpenID4VCI' as const }];
    await Promise.all(gateways.map(async ({ base, protocol }) => {
      if (!base) return;
      try {
        const gatewayResponse = await fetch(`${base}/internal/trace/${encodeURIComponent(flowId)}`,
          { signal: AbortSignal.timeout(1500) });
        if (!gatewayResponse.ok) return;
        const data: any = await gatewayResponse.json();
        runWithFlowId(flowId, () => {
          for (const event of Array.isArray(data.events) ? data.events : []) {
            const key = `${flowId}:${event.id}`;
            if (importedGatewayEvents.has(key)) continue;
            importedGatewayEvents.add(key);
            ProtocolInspector.record({ protocol, step: event.step, actor: event.actor,
              direction: event.direction, endpoint: event.endpoint, method: event.method,
              headers: event.headers || {}, payload: event.payload, status: event.status, durationMs: event.durationMs });
          }
        });
        if (importedGatewayEvents.size > 5000) importedGatewayEvents.clear();
      } catch { /* Keep local traces available while a gateway is restarting. */ }
    }));
  }
  const logs = inspectorStore.getLogs(protocol as string, actor as string, flowId as string);
  res.json({ logs });
});

router.delete('/logs', (_req, res) => {
  inspectorStore.clearLogs();
  res.json({ message: 'Inspector logs cleared' });
});

export default router;
