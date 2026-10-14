"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";

/**
 * Owns request cancellation so previous routes cannot overwrite the current data.
 * Reloads of the same URL keep the last data visible; `keepPreviousData` extends that to
 * URL changes of one list (search, filters, pages) so the view refreshes in place instead of flashing.
 */
export function useResource<T>(url: string, { keepPreviousData = false }: { keepPreviousData?: boolean } = {}) {
  const [state, setState] = useState<{ url: string; data?: T; error: string; loading: boolean }>({ url, error: "", loading: true });
  const controller = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setState((previous) => ({ url, data: previous.url === url || keepPreviousData ? previous.data : undefined, error: "", loading: true }));
    try {
      const data = await apiRequest<T>(url, { signal: request.signal });
      if (!request.signal.aborted) setState({ url, data, error: "", loading: false });
    } catch (error) {
      if (!request.signal.aborted) setState({ url, error: error instanceof Error ? error.message : "無法載入資料，請重新嘗試。", loading: false });
    }
  }, [url, keepPreviousData]);

  useEffect(() => {
    void reload();
    return () => controller.current?.abort();
  }, [reload]);

  const current = state.url === url;
  const data = current || keepPreviousData ? state.data : undefined;
  const loading = !current || state.loading;
  return { data, error: current ? state.error : "", loading, refreshing: loading && data !== undefined, reload };
}
