export type Workload = 'rows-1k' | 'rows-10k' | 'nested' | 'catalog';

export interface BenchmarkApi {
  mount(workload: Workload): Promise<void>;
  unmount(): Promise<void>;
  settle(): Promise<void>;
}

declare global {
  interface Window {
    __benchmark?: BenchmarkApi;
    __benchmarkReady?: boolean;
    __benchmarkReadyAt?: number;
  }
}

export const sizes: Record<Workload, number> = {
  'rows-1k': 1_000,
  'rows-10k': 10_000,
  nested: 1_000,
  catalog: 1_000
};

export function rows(size: number) {
  return Array.from({length: size}, (_, id) => ({id, name: `Row ${id}`, value: 0}));
}

export function products(size: number) {
  return Array.from({length: size}, (_, id) => ({id, name: `Product ${id}`, price: id + 1, value: 0}));
}

export function install(api: BenchmarkApi): void {
  window.__benchmark = api;
  window.__benchmarkReadyAt = performance.now();
  window.__benchmarkReady = true;
}

