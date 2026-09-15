import { AtSign, Grid3X3, LayoutList, Rows3, Tags, TextSearch } from "lucide-react";
import type { ViewMode } from "./model";

export const recordViews: Array<{ key: ViewMode; label: string; icon: typeof Rows3 }> = [
  { key: "table", label: "表格", icon: Rows3 },
  { key: "list", label: "列表", icon: LayoutList },
  { key: "grid", label: "IP 棋盤", icon: Grid3X3 },
  { key: "type", label: "依類型", icon: Tags },
  { key: "name", label: "依名稱", icon: AtSign },
  { key: "content", label: "依內容", icon: TextSearch },
];

export const isRecordView = (value: string | null): value is ViewMode => recordViews.some((item) => item.key === value);
