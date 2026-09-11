"use client";

import { ResourceError } from "@/components/ui/resource-error";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <div className="content"><ResourceError message="頁面暫時無法載入，請重新嘗試。" retry={reset} /></div>;
}
