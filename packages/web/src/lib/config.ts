const isDev = import.meta.env.DEV;

const WORKER_ORIGIN = isDev ? "" : "https://gitsandbox-worker.soyrun.workers.dev";

export function getApiBase(): string {
  return WORKER_ORIGIN;
}
