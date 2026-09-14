import { z } from "zod";
import { RECORD_TYPES } from "@/lib/dns/types";

export const createZoneSchema=z.object({name:z.string().min(1).max(253),kind:z.enum(["Native","Master","Slave"]).default("Native"),nameservers:z.array(z.string()).min(1).max(10)}).strict();
export const recordMutationSchema=z.object({name:z.string().min(1).max(253),type:z.enum(RECORD_TYPES),ttl:z.number().int().min(30).max(2147483647),content:z.string().min(1).max(65535),expectedHash:z.string().max(100).optional()}).strict();
export const rrsetReplaceSchema=z.object({name:z.string().min(1),type:z.enum(RECORD_TYPES),ttl:z.number().int().min(30).max(2147483647),contents:z.array(z.string().min(1).max(65535)).min(1).max(100),expectedHash:z.string().min(10).max(100)}).strict();
export const recordDeleteSchema=z.object({name:z.string().min(1),type:z.enum(RECORD_TYPES),content:z.string().optional(),expectedHash:z.string().min(10).max(100)}).strict();
export const permissionSchema=z.object({userId:z.string().min(1).optional(),userEmail:z.email().optional(),role:z.enum(["VIEWER","EDITOR","ADMIN"]),expiresAt:z.iso.datetime().nullable().optional(),resourcePattern:z.string().max(253).nullable().optional()}).refine((value)=>Boolean(value.userId||value.userEmail),"A user is required");
export const userRoleSchema=z.object({globalRole:z.enum(["USER","SUPER_ADMIN"])}).strict();
export const dnsRequestSchema=z.object({zoneName:z.string().min(1).max(253),name:z.string().min(1).max(253),type:z.enum(["A","AAAA","CNAME","MX","TXT","SRV","CAA","PTR"]),ttl:z.number().int().min(30).max(2147483647),content:z.string().min(1).max(65535),purpose:z.string().trim().max(1000).optional()}).strict();
export const dnsApplicationSchema = z.object({
  unitId: z.string().min(1).max(100).optional(),
  applicantName: z.string().trim().min(1, "請填寫申請人姓名").max(100),
  applicantUnit: z.string().trim().min(1, "請填寫申請單位").max(200),
  applicantExtension: z.string().trim().regex(/^[0-9]{1,10}$/, "單位分機請填入 1–10 位數字"),
  records: z.array(dnsRequestSchema).min(1, "請至少填寫一筆 DNS 紀錄"),
}).strict();
export const dnsRequestDecisionSchema=z.object({decision:z.enum(["APPROVE","REJECT"]),reviewNote:z.string().trim().max(1000).optional()}).strict();
