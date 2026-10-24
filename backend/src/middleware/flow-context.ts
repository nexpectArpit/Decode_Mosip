import { AsyncLocalStorage } from 'node:async_hooks';

const flowStorage = new AsyncLocalStorage<string>();

export function runWithFlowId<T>(flowId: string, callback: () => T): T {
  return flowStorage.run(flowId, callback);
}

export function currentFlowId(): string | undefined {
  return flowStorage.getStore();
}
