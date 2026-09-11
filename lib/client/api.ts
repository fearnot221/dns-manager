export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      // A hard navigation clears stale authenticated client state across workspace routes.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Authentication expiry deliberately resets the document.
      window.location.assign("/login");
    }
    throw new ApiError(body?.error || `操作失敗（${response.status}），請稍後重試。`, response.status);
  }
  if (body === null) throw new ApiError("伺服器回傳的資料無法讀取，請重新嘗試。", response.status);
  return body as T;
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
