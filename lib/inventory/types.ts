export type Inspection = { id: string; inspectedAt: string; inspectorId: string; inspectorEmail: string; inspectorName: string; note: string };
export type Ownership = {
  id: string; applicantName: string; applicantEmail: string; applicantUnit: string; applicantExtension: string; purpose: string;
  updatedAt: string | null; updatedBy: string; updatedByName?: string | null; inspections: Inspection[];
};
export type InventoryRecord = { zoneName: string; recordName: string; recordType: string; content: string; ttl: number; disabled: boolean; ownership: Ownership };
