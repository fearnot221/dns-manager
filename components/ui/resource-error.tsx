"use client";

import { AlertCircle, RotateCw } from "lucide-react";

export function ResourceError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="card resource-error" role="alert">
    <AlertCircle size={24} aria-hidden="true" />
    <div><h2>無法載入資料</h2><p>{message}</p></div>
    <button type="button" className="button" onClick={retry}><RotateCw size={16} aria-hidden="true" /> 重新載入</button>
  </div>;
}
