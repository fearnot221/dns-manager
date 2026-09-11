"use client";

import { AlertCircle, RotateCw } from "lucide-react";

export function ResourceError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="card resource-error" role="alert">
    <AlertCircle size={24} />
    <div><h2>無法載入資料</h2><p>{message}</p></div>
    <button className="button" onClick={retry}><RotateCw size={16} /> 重新載入</button>
  </div>;
}
