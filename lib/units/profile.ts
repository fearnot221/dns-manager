import { z } from "zod";
import { unitDepartments } from "./policy";

export const unitProfileFields = {
  location: z.string().trim().min(1, "請填寫單位位置。").max(100),
  extension: z.string().trim().regex(/^[0-9]{1,10}$/, "單位分機須為 1–10 位數字。"),
  advisor: z.string().trim().max(100).default(""),
};
export const unitProfileSchema = z.object(unitProfileFields).strict();
export type UnitProfile = z.infer<typeof unitProfileSchema>;
export const unitProfileUpdateSchema = unitProfileSchema.extend({
  note: z.string().trim().max(2000).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  department: z.enum(unitDepartments).optional(),
});
export type UnitProfileUpdate = z.infer<typeof unitProfileUpdateSchema>;
