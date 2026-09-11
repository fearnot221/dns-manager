"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";

/** Owns request cancellation so previous routes cannot overwrite the current data. */
export function useResource<T>(url: string) {
  const [state, setState] = useState<{ url: string; data?: T; error: string; loading: boolean }>({ url, error: "", loading: true });
  const controller = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setState((previous) => ({ url, data: previous.url === url ? previous.data : undefined, error: "", loading: true }));
    try {
      const data = await apiRequest<T>(url, { signal: request.signal });
      if (!request.signal.aborted) setState({ url, data, error: "", loading: false });
    } catch (error) {
      if (!request.signal.aborted) setState({ url, error: error instanceof Error ? error.message : "無法載入資料，請重新嘗試。", loading: false });
    }
  }, [url]);

  useEffect(() => {
    void reload();
    return () => controller.current?.abort();
  }, [reload]);

  return { data: state.url === url ? state.data : undefined, error: state.url === url ? state.error : "", loading: state.url !== url || state.loading, reload };
}
