import { ProtocolLogEntry } from '../types';
import { currentFlowId } from './flow-context';

export class ProtocolInspectorStore {
  private logs: ProtocolLogEntry[] = [];
  private maxLogs = 300;

  public addLog(entry: Omit<ProtocolLogEntry, 'id' | 'timestamp'>): ProtocolLogEntry {
    const log: ProtocolLogEntry = {
      ...entry,
      flowId: currentFlowId(),
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString()
    };
    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    return log;
  }

  public getLogs(protocol?: string, actor?: string, flowId?: string): ProtocolLogEntry[] {
    return this.logs.filter(l => {
      if (flowId && l.flowId !== flowId) return false;
      if (protocol && protocol !== 'ALL') {
        const normFilter = protocol.toLowerCase().replace(/[_\s-]/g, '');
        const normLog = (l.protocol || '').toLowerCase().replace(/[_\s-]/g, '');
        if (!normLog.includes(normFilter) && !normFilter.includes(normLog)) return false;
      }
      if (actor && actor !== 'ALL' && l.actor !== actor) return false;
      return true;
    });
  }

  public clearLogs(): void {
    this.logs = [];
  }
}

export const inspectorStore = new ProtocolInspectorStore();

export const ProtocolInspector = {
  record: (entry: Omit<ProtocolLogEntry, 'id' | 'timestamp'>) => inspectorStore.addLog(entry),
  getLogs: (protocol?: string, actor?: string, flowId?: string) => inspectorStore.getLogs(protocol, actor, flowId),
  clear: () => inspectorStore.clearLogs()
};
