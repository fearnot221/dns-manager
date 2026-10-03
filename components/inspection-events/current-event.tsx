"use client";

import { useEffect } from "react";
import { useResource } from "@/lib/client/use-resource";
import type { EventFields } from "@/lib/inspection-events/model";
import { ResourceError } from "@/components/ui/resource-error";

export function CurrentInspectionEvent() {
  const { data, error, loading, reload } = useResource<{ event: EventFields | null }>("/api/inspection-events/current");
  useEffect(() => {
    const timer = window.setInterval(() => { void reload(); }, 60_000);
    const refresh = () => { void reload(); };
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [reload]);
  if (error) return <ResourceError message={error} retry={reload} />;
  if (!data) return <p role="status">{loading ? "載入清查活動…" : ""}</p>;
  return <CurrentEventSummary event={data.event} />;
}

export function CurrentEventSummary({ event }: { event: EventFields | null }) {
  return <section className="inspection-event-notice" aria-label="目前清查活動">
    {event ? <><strong>{event.name}</strong><p><time dateTime={event.startsOn}>{event.startsOn}</time> 至 <time dateTime={event.endsOn}>{event.endsOn}</time></p></> : <p>目前沒有進行中的清查活動</p>}
  </section>;
}
