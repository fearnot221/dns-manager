import type { InspectionEventSnapshot } from "@/lib/inspection-events/model";
export type Inspection = InspectionEventSnapshot & { recordStatus?: string | null; id: string; inspectedAt: string; inspectorId: string; inspectorEmail: string; inspectorName: string; inspectorStudentId?: string | null; note: string };
export type Ownership = {
  recordStatus?: string | null;
  unitId?: string | null; unitName?: string | null;
  id: string; applicantName: string; applicantEmail: string; applicantUnit: string; applicantExtension: string; purpose: string;
  updatedAt: string | null; updatedBy: string; updatedByName?: string | null; inspections: Inspection[];
};
export type InventoryRecord = { zoneName: string; recordName: string; recordType: string; content: string; ttl: number; disabled: boolean; ownership: Ownership };
