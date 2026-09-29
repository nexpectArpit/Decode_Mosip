import fetch from 'node-fetch';
import { inspectorStore } from '../middleware/inspector';

const MIMOTO_BASE_URL = process.env.MIMOTO_URL || 'http://localhost:8099/v1/mimoto';

export class MimotoService {
  public static async getIssuers(): Promise<any> {
    const start = Date.now();
    const url = `${MIMOTO_BASE_URL}/issuers`;

    inspectorStore.addLog({
      protocol: 'OpenID4VCI',
      step: 'Fetch Wallet Issuer Catalog',
      actor: 'WALLET',
      direction: 'REQUEST',
      endpoint: url,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      payload: null
    });

    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await res.json();

      inspectorStore.addLog({
        protocol: 'OpenID4VCI',
        step: 'Issuer Catalog Response',
        actor: 'WALLET',
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
      inspectorStore.addLog({
        protocol: 'OpenID4VCI',
        step: 'Issuer Catalog Error',
        actor: 'WALLET',
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
}
