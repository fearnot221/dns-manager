import { AsyncLocalStorage } from "node:async_hooks";

const timings = new AsyncLocalStorage<{ id: string }>();

/** Only fixed stage names, duration and status; never URLs, codes or profiles. */
export async function measurePortalStep<T>(stage: "token" | "userinfo", operation: () => Promise<T>) {
  const started = performance.now();
  let completed = false;
  try { const result = await operation(); completed = true; return result; }
  finally {
    console.info(JSON.stringify({ event: "portal-timing", requestId: timings.getStore()?.id, stage, ms: Math.round(performance.now() - started), completed }));
  }
}

export async function measurePortalCallback(operation: () => Promise<Response>) {
  return timings.run({ id: crypto.randomUUID() }, async () => {
    const started = performance.now();
    let status = 500;
    try {
      const response = await operation();
      status = response.status;
      response.headers.set("Server-Timing", `portal_callback;dur=${(performance.now() - started).toFixed(1)}`);
      return response;
    } finally {
      console.info(JSON.stringify({ event: "portal-timing", requestId: timings.getStore()!.id, stage: "callback", ms: Math.round(performance.now() - started), status }));
    }
  });
}
