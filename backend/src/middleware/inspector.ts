import { ProtocolLogEntry } from '../types';

export class ProtocolInspectorStore {
  private logs: ProtocolLogEntry[] = [];
  private maxLogs = 300;

  public addLog(entry: Omit<ProtocolLogEntry, 'id' | 'timestamp'>): ProtocolLogEntry {
    const log: ProtocolLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString()
    };
    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    return log;
  }

  public getLogs(protocol?: string, actor?: string): ProtocolLogEntry[] {
    return this.logs.filter(l => {
      if (protocol && l.protocol !== protocol) return false;
      if (actor && l.actor !== actor) return false;
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
  getLogs: (protocol?: string, actor?: string) => inspectorStore.getLogs(protocol, actor),
  clear: () => inspectorStore.clearLogs()
};
