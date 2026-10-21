import { z } from "zod";

export const unitProfileFields = {
  location: z.string().trim().max(100).default(""),
  extension: z.string().trim().regex(/^[0-9]{0,10}$/, "單位分機須為 1–10 位數字，或留空。").default(""),
  advisor: z.string().trim().max(100).default(""),
};
export const unitProfileSchema = z.object(unitProfileFields).strict();
export type UnitProfile = z.infer<typeof unitProfileSchema>;
