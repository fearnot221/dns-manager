"use client";

import { createContext, useContext, useState } from "react";
import type { UnitRole } from "@/lib/units/policy";

export type UnitWorkspace = { id: string; name: string; role: UnitRole; status: "PENDING" | "APPROVED" | "REJECTED" };
const WorkspaceContext = createContext<{ units: UnitWorkspace[]; active?: UnitWorkspace; select: (id: string) => void }>({ units: [], select: () => {} });

export function UnitWorkspaceProvider({ units, children }: { units: UnitWorkspace[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState("");
  const active = units.find((unit) => unit.id === selected) ?? units[0];
  return <WorkspaceContext.Provider value={{ units, active, select: setSelected }}>{children}</WorkspaceContext.Provider>;
}
export function useUnitWorkspace() { return useContext(WorkspaceContext); }
