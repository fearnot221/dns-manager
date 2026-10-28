import { z } from "zod";
import { dnsApplicationSchema, dnsRequestDecisionSchema, permissionSchema, recordDeleteSchema, recordMutationSchema, requestOwnershipSchema, rrsetReplaceSchema } from "@/lib/validation/api";
import { eventDelete, eventFields, eventUpdate } from "@/lib/inspection-events/model";
import { applicationPolicySchema } from "@/lib/requests/policy-model";
import { unitDepartments } from "@/lib/units/policy";
import { unitProfileFields, unitProfileUpdateSchema } from "@/lib/units/profile";
import { recordStatuses } from "@/lib/inventory/record-status";
import { customTemplateSchema, scenarioKeys } from "@/lib/mail/model";

type Schema = Record<string, unknown>;
type Parameter = { name: string; in: "query" | "path"; required: boolean; description: string; schema: Schema };
export type Operation = {
  operationId: string; summary: string; description: string; tags: string[];
  parameters: Parameter[]; responses: Record<string, Schema>; "x-access": string;
  requestBody?: Schema; deprecated?: boolean; security?: Record<string, string[]>[];
  "x-source-route"?: string;
};

const str: Schema = { type: "string" };
const bool: Schema = { type: "boolean" };
const integer: Schema = { type: "integer" };
const dateTime: Schema = { type: "string", format: "date-time" };
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const array = (items: Schema): Schema => ({ type: "array", items });
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: "object", properties, required });
const fromZod = (schema: z.ZodType): Schema => {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, { io: "input" });
  void _dialect;
  return json;
};
const enumeration = (...values: string[]): Schema => ({ type: "string", enum: values });
const id = z.string().min(1).max(100);
const hash = z.string().min(10).max(100);
const ttl = z.number().int().min(30).max(2147483647);
const secret = { type: "string", maxLength: 256, writeOnly: true };
const recordStatus = nullable(enumeration(...recordStatuses));
const unitStatus = enumeration("PENDING", "APPROVED", "REJECTED");
const role = enumeration("EDITOR", "ADMIN");
const zoneRole = nullable(enumeration("VIEWER", "EDITOR", "ADMIN"));
const contact = { applicantName: str, applicantEmail: str, applicantUnit: str, applicantExtension: str, purpose: str };
const recordIdentity = { zoneName: str, recordName: str, recordType: str, content: str };
const inventoryIdentity = { id: z.string().regex(/^[a-f0-9]{64}$/), zoneName: z.string().max(253), recordName: z.string().max(253), recordType: z.string().max(20), content: z.string().max(65535), expectedUpdatedAt: z.iso.datetime().nullable() };
const profile = { name: str, note: str, department: nullable(str), location: str, extension: str, advisor: str };
const template = object({ enabled: bool, ccTeam: bool, subject: { type: "string", minLength: 1, maxLength: 300 }, body: { type: "string", minLength: 1, maxLength: 20000 } });

const schemas: Record<string, Schema> = {
  Error: object({ error: str, requestId: str, fields: { type: "object", additionalProperties: array(str) } }, ["error"]),
  Success: object({ success: { const: true } }),
  Saved: object({ saved: { const: true } }),
  Id: object({ id: str }),
  Inspection: object({ id: str, inspectedAt: dateTime, inspectorName: str, inspectorEmail: str, inspectorStudentId: nullable(str), note: str, recordStatus, eventId: nullable(str), eventName: nullable(str), eventClassified: bool }, ["id", "inspectedAt", "inspectorName", "note"]),
  Ownership: object({ id: str, ...contact, updatedAt: nullable(dateTime), updatedBy: str, updatedByName: nullable(str), unitId: nullable(str), unitName: nullable(str), recordStatus, inspections: array(ref("Inspection")) }, ["id", ...Object.keys(contact), "updatedAt", "updatedBy", "inspections"]),
  InventoryRecord: object({ ...recordIdentity, ttl: integer, disabled: bool, ownership: ref("Ownership") }),
  RRSet: object({ name: str, type: str, ttl: integer, hash: str, records: array(object({ content: str, disabled: bool, ownership: ref("Ownership") }, ["content", "disabled"])), comments: array(object({ content: str, account: str, modified_at: integer }, ["content"])) }, ["name", "type", "ttl", "records"]),
  Zone: object({ id: str, name: str, kind: enumeration("Native", "Master", "Slave", "Producer", "Consumer"), serial: integer, dnssec: bool, rrsets: array(ref("RRSet")), edited_serial: integer, notified_serial: integer, last_check: integer }, ["id", "name", "kind", "serial", "dnssec", "rrsets"]),
  ZoneSummary: object({ id: str, name: str, kind: str, serial: integer, dnssec: bool, recordCount: integer, permission: zoneRole }, ["id", "name", "kind", "serial", "dnssec", "recordCount", "permission"]),
  Permission: object({ id: str, userId: str, zoneName: str, role: enumeration("VIEWER", "EDITOR", "ADMIN"), expiresAt: nullable(dateTime), resourcePattern: nullable(str), createdAt: dateTime, user: object({ name: nullable(str), email: str, image: nullable(str) }) }, ["id", "userId", "role", "expiresAt", "user"]),
  User: object({ id: str, name: str, email: nullable(str), studentId: nullable(str), account: str, note: str, portalIdentifier: nullable(str), globalRole: enumeration("USER", "ADMIN", "SUPER_ADMIN"), disabled: bool, zoneAdmin: bool, protected: bool, dataOnly: bool, units: array(object({ id: str, name: str })) }, ["id", "name", "email", "account", "note", "globalRole", "disabled", "zoneAdmin", "protected", "dataOnly"]),
  Unit: object({ id: str, ...profile, status: unitStatus }),
  UnitSummary: object({ id: str, name: str, department: nullable(str), extension: str, status: unitStatus, canApply: bool, role, memberCount: integer }),
  UnitRecord: object({ id: str, ...recordIdentity, ttl: integer, disabled: bool, ...contact, recordStatus, expectedHash: str, expectedUpdatedAt: dateTime, inspections: array(ref("Inspection")) }, ["id", ...Object.keys(recordIdentity), "ttl", "disabled", "purpose", "expectedHash", "expectedUpdatedAt", "inspections"]),
  UnitDetail: object({ unit: ref("Unit"), role, systemAdmin: bool, canApply: bool, records: array(ref("UnitRecord")), recordsError: str, members: array(object({ userId: str, label: str, studentId: nullable(str), role, disabled: bool })), allowlist: array(object({ studentId: str, userId: nullable(str), role })) }),
  UnitCreate: fromZod(z.object({ action: z.literal("create"), ...unitProfileFields, department: z.enum(unitDepartments), name: z.string().trim().min(1).max(100), note: z.string().trim().max(2000).default(""), managerStudentId: z.string().trim().max(100).optional() }).strict()),
  UnitUpdate: fromZod(z.discriminatedUnion("action", [
    unitProfileUpdateSchema.extend({ action: z.literal("profile") }),
    z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(100) }).strict(),
    z.object({ action: z.literal("department"), department: z.enum(unitDepartments) }).strict(),
    z.object({ action: z.literal("delete") }).strict(),
    z.object({ action: z.literal("assign-manager"), studentId: id }).strict(),
    z.object({ action: z.literal("allowlist"), studentId: id, remove: z.boolean().optional() }).strict(),
    z.object({ action: z.literal("member"), userId: id, role: z.enum(["EDITOR", "ADMIN"]).nullable() }).strict(),
  ])),
  UnitChange: fromZod(z.union([
    z.object({ recordId: id, purpose: z.string().trim().min(1).max(1000), expectedHash: hash, operation: z.literal("UPDATE").optional(), content: z.string().min(1).max(65535), ttl: ttl.optional(), ownership: requestOwnershipSchema.optional() }).strict(),
    z.object({ recordId: id, purpose: z.string().trim().min(1).max(1000), expectedHash: hash, operation: z.literal("DELETE") }).strict(),
  ])),
  UnitInspection: fromZod(z.object({ recordId: id, expectedHash: hash, ownership: requestOwnershipSchema.optional(), recordStatus: z.enum(recordStatuses).nullable().optional(), note: z.string().trim().max(1000) }).strict()),
  RecordCreate: fromZod(recordMutationSchema),
  RecordReplace: fromZod(rrsetReplaceSchema),
  RecordDelete: fromZod(recordDeleteSchema),
  PermissionInput: { ...fromZod(permissionSchema), anyOf: [{ required: ["userId"] }, { required: ["userEmail"] }] },
  DnsApplication: { ...fromZod(dnsApplicationSchema), description: "原子批次申請；預設最多 5000 筆，可由部署環境調整。另受單位待審數、每日筆數及資料量上限約束。PTR 只能用於反解網域；其目標主機不限於系統內的正解網域。CLAIM 必須對應尚未指派單位的既有解析值。" },
  DnsDecision: fromZod(dnsRequestDecisionSchema),
  DnsRequest: object({ id: str, operation: enumeration("CREATE", "CLAIM", "UPDATE", "DELETE"), applicationId: nullable(str), unitId: nullable(str), sourceRecordId: nullable(str), originalContent: nullable(str), originalTtl: nullable(integer), ...recordIdentity, ttl: integer, ...contact, recordPurpose: nullable(str), notes: nullable(str), status: enumeration("PENDING", "APPROVED", "REJECTED", "CANCELLED"), reviewNote: nullable(str), createdAt: dateTime, reviewedAt: nullable(dateTime), canReview: bool, user: object({ id: str, name: nullable(str), studentId: nullable(str), email: nullable(str) }, ["id"]), reviewer: nullable(object({ name: nullable(str), email: str })) }, ["id", ...Object.keys(recordIdentity), "ttl", "status", "createdAt", "canReview", "user"]),
  InventoryUpdate: fromZod(z.object({ ...inventoryIdentity, recordStatus: z.enum(recordStatuses).nullable().optional(), mode: z.enum(["metadata", "inspect", "inspect-and-metadata"]), applicantName: z.string().trim().max(100).default(""), applicantEmail: z.union([z.email(), z.literal("")]).default(""), applicantUnit: z.string().trim().max(200).default(""), applicantExtension: z.string().trim().max(30).default(""), purpose: z.string().trim().max(1000).default(""), note: z.string().trim().max(2000).default("") }).strict()),
  InventoryAssignment: fromZod(z.object({ ...inventoryIdentity, zoneName: z.string().min(1).max(253), recordName: z.string().min(1).max(253), recordType: z.string().min(1).max(20), unitId: id }).strict()),
  InspectionDelete: fromZod(z.object({ recordId: z.string().regex(/^[a-f0-9]{64}$/), expectedUpdatedAt: z.iso.datetime() }).strict()),
  EventFields: fromZod(eventFields),
  InspectionEvent: object({ id: str, name: str, startsOn: { type: "string", format: "date" }, endsOn: { type: "string", format: "date" }, revision: integer }),
  EventUpdate: fromZod(eventUpdate), EventDelete: fromZod(eventDelete),
  Policy: { ...fromZod(applicationPolicySchema), properties: { ...fromZod(applicationPolicySchema).properties as Record<string, Schema>, updatedAt: nullable(dateTime) } },
  PolicyUpdate: fromZod(z.object({ policy: applicationPolicySchema, expectedUpdatedAt: z.iso.datetime().nullable() }).strict()),
  DeletionProtection: object({ configured: bool, updatedAt: nullable(dateTime) }),
  DeletionSettings: { ...object({ password: { ...secret, minLength: 12 }, confirmation: { ...secret, minLength: 12 }, expectedUpdatedAt: nullable(dateTime) }), additionalProperties: false, description: "password 與 confirmation 必須相同；expectedUpdatedAt 須與目前設定相符。" },
  UserCreate: fromZod(z.object({ name: z.string().trim().min(1).max(100), email: z.string().max(320).pipe(z.union([z.email(), z.literal("")])).default(""), note: z.string().trim().max(1000).default(""), unitId: id.optional() }).strict()),
  UserUpdate: fromZod(z.object({ note: z.string().trim().max(1000).optional(), disabled: z.boolean().optional(), globalRole: z.enum(["USER", "ADMIN"]).optional() }).strict()),
  MailConfig: object({ enabled: bool, host: { const: "smtp-relay.gmail.com" }, port: { type: "integer", enum: [465, 587] }, fromEmail: str, fromName: { type: "string", maxLength: 100 }, recipients: { ...array({ type: "string", format: "email" }), maxItems: 20 }, templates: object(Object.fromEntries(scenarioKeys.map(key => [key, template]))), customTemplates: { ...array(fromZod(customTemplateSchema)), maxItems: 20 } }),
  MailSettings: object({ config: ref("MailConfig"), revision: nullable({ type: "string", format: "uuid" }) }),
  MailSave: { ...object({ config: ref("MailConfig"), expectedRevision: nullable({ type: "string", format: "uuid" }) }), additionalProperties: false, description: "啟用時須提供 fromEmail 與至少一個 recipients；名稱及主旨不得換行，模板變數須符合各情境允許的變數。" },
  MailAction: fromZod(z.discriminatedUnion("action", [
    z.object({ action: z.literal("test"), recipient: z.email().max(254), template: z.string().max(60).optional(), expectedRevision: z.uuid() }).strict(),
    z.object({ action: z.literal("send"), unitIds: z.array(id).min(1).max(500), subject: z.string(), body: z.string(), ccTeam: z.boolean() }).strict(),
    z.object({ action: z.literal("retry"), id }).strict(),
  ])),
  MailDelivery: object({ id: str, eventKey: str, recipient: str, subject: str, status: enumeration("PENDING", "SENDING", "SENT", "FAILED"), attempts: integer, lastError: nullable(str), createdAt: dateTime, sentAt: nullable(dateTime) }),
  AuditEvent: object({ id: str, createdAt: dateTime, userEmail: str, userName: nullable(str), userDisplayStudentId: nullable(str), zone: str, action: str, recordName: nullable(str), recordType: nullable(str), success: bool, requestId: nullable(str), oldValue: {}, newValue: {}, errorMessage: nullable(str), ipAddress: nullable(str), userAgent: nullable(str) }, ["id", "createdAt", "zone", "action", "success"]),
  OwnershipSnapshot: object(Object.fromEntries(["content", "unitId", ...Object.keys(contact)].map(key => [key, nullable(str)])), []),
  DnsHistoryEvent: object({ id: str, createdAt: dateTime, operation: enumeration("CREATE", "UPDATE", "DELETE", "OWNERSHIP", "ASSIGNMENT", "INSPECTION", "SYNC"), recordName: str, recordType: str, before: nullable(ref("RRSet")), after: nullable(ref("RRSet")), ownership: nullable(object({ before: nullable(ref("OwnershipSnapshot")), after: nullable(ref("OwnershipSnapshot")) })), zone: str, legacyScope: bool, userName: nullable(str), userEmail: str }, ["id", "createdAt", "operation", "recordName", "recordType"]),
  SessionActivity: object({ expiresAt: { type: "number", description: "閒置登入到期時間，Unix epoch 毫秒。" } }, []),
  SystemHealth: object({ powerdns: object({ status: { const: "online" }, latency: { type: "integer", description: "毫秒" }, mode: enumeration("mock", "live") }), database: object({ status: enumeration("configured", "mock") }), zones: integer, records: integer, checkedAt: dateTime }),
  OpenApiDocument: object({ openapi: str, info: { type: "object" }, paths: { type: "object" }, components: { type: "object" } }),
};

const paths: Record<string, Record<string, Operation>> = {};
const query = (name: string, schema: Schema = str, description = "", required = false): Parameter => ({ name, in: "query", required, description, schema });
const jsonResponse = (schema: Schema, description = "成功"): Schema => ({ description, content: { "application/json": { schema } } });
const errorResponse = (description: string): Schema => jsonResponse(ref("Error"), description);
type Options = { body?: Schema; query?: Parameter[]; status?: number; description?: string; public?: boolean; responses?: Record<string, Schema> };
function add(path: string, method: string, summary: string, access: string, response: Schema, options: Options = {}) {
  const parameters: Parameter[] = [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({ name, in: "path", required: true, description: name === "zone" ? "URL 編碼的完整網域名稱（可含結尾句點）。" : "資源識別碼。", schema: str }));
  const operation: Operation = {
    operationId: `${method}_${path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
    summary, description: options.description ?? summary, tags: [path === "/healthz" ? "system" : path.split("/")[2]],
    "x-access": access, parameters: [...parameters, ...options.query ?? []],
    responses: {
      [options.status ?? 200]: options.status === 204 ? { description: "成功，無回應本文。" } : jsonResponse(response),
      ...(!options.public ? { "401": errorResponse("登入無效、閒置逾時或帳號不可用。"), "403": errorResponse("權限不足或跨來源寫入被拒絕。") } : {}),
      default: errorResponse("其他失敗；400 資料驗證、404 資源不存在或隱藏、409 並行衝突、429 頻率／額度限制、500 系統或上游錯誤、503 操作紀錄或服務不可用。requestId／fields 視錯誤來源提供。"),
      ...options.responses,
    },
  };
  if (options.public) operation.security = [];
  if (options.body) operation.requestBody = { required: true, content: { "application/json": { schema: options.body } } };
  (paths[path] ??= {})[method] = operation;
}

add("/api/units", "get", "列出可存取單位", "登入者；系統管理員可列全部，其餘限自己的單位。", object({ units: array(ref("UnitSummary")) }));
add("/api/units", "post", "建立單位", "系統管理員。", object({ unit: ref("Unit") }), { body: ref("UnitCreate"), status: 201 });
add("/api/units/{id}", "get", "讀取單位、成員及 DNS", "單位成員或系統管理員；manage 檢視限單位管理員或系統管理員。", ref("UnitDetail"), { query: [query("view", enumeration("dns", "manage"), "預設 dns。manage 模式下，非系統管理員不載入 DNS。")], description: "只返回此單位的紀錄；recordsError 不為空時表示上游部分失敗，HTTP 200 仍可能是不完整清單。" });
add("/api/units/{id}", "patch", "更新單位或管理成員", "profile：單位管理員或系統管理員；name／department、rename／department／delete／assign-manager：系統管理員；allowlist／member：單位管理員或系統管理員。", ref("Saved"), { body: ref("UnitUpdate"), description: "由 action 選擇操作。不得移除最後一位管理員；未啟用單位的管理操作受限。delete 需無成員、DNS 歸屬及待審申請。" });
add("/api/units/{id}/changes", "post", "提出既有 DNS 變更或刪除申請", "已啟用單位內具有申請權限的成員；系統管理員也必須具備該單位成員身份。", ref("Id"), { body: ref("UnitChange"), status: 201, description: "只建立待審申請，核准後生效。expectedHash 與可選 ownership.expectedUpdatedAt 必須符合最新資料；TTL 會影響整組 RRset。" });
add("/api/units/{id}/inspections", "post", "記錄單位 DNS 清查", "已啟用單位的實際成員。", ref("Id"), { body: ref("UnitInspection"), status: 201, description: "更新聯絡／用途及清查狀態，新增清查歷史；不改派單位或直接修改 DNS。expectedHash 及 ownership.expectedUpdatedAt 用於並行檢查。" });
add("/api/dns-requests", "get", "搜尋申請與審核佇列", "登入者；依本人、單位與可審核網域的實際權限過濾。", object({ scope: enumeration("ADMIN", "USER"), requests: array(ref("DnsRequest")), total: integer, counts: { type: "object", additionalProperties: integer }, nextCursor: nullable(str) }), { query: [query("q", { type: "string", maxLength: 200, default: "" }), query("status", { ...enumeration("ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"), default: "ALL" }), query("scope", { ...enumeration("ALL", "MINE", "SHARED", "REVIEWABLE"), default: "ALL" }), query("unitId", { type: "string", maxLength: 100 }), query("cursor", { type: "string", maxLength: 500 }, "上一頁回傳的 nextCursor，不透明字串。")], description: "每頁 100 筆，依 createdAt、id 由新到舊排序。total 為目前條件總數；counts 為未套用 status 的筆數。scope 不會授予額外權限。" });
add("/api/dns-requests", "post", "提交批次 DNS 或歸屬申請", "已啟用單位成員，並符合申請類型政策。", object({ applicationId: str, count: integer }), { body: ref("DnsApplication"), status: 201 });
add("/api/dns-requests/zones", "get", "列出可申請的網域名稱", "登入者。", object({ zones: array(object({ name: str })) }));
add("/api/dns-requests/{id}", "patch", "核准或拒絕待審申請", "可審核此申請的管理員；單位申請須符合系統審核規則。", object({ request: { anyOf: [ref("DnsRequest"), object({ id: str, status: enumeration("APPROVED", "REJECTED") })] } }), { body: ref("DnsDecision"), description: "僅處理 PENDING；核准會發布 DNS。涉及移除解析值時須提供刪除保護密碼。重試仍受發布狀態與最新資料檢查。" });
add("/api/zones", "get", "列出可管理網域", "具有網域管理存取權；結果受網域及紀錄範圍限制。", object({ zones: array(ref("ZoneSummary")) }));
add("/api/zones", "post", "網站禁止建立網域", "登入者；此操作永遠不建立網域。", ref("Error"), { status: 405, responses: { "405": { ...errorResponse("請由 DNS 維運端管理；Allow: GET。"), headers: { Allow: { schema: { const: "GET" } } } } } });
add("/api/zones/{zone}", "get", "讀取網域與授權範圍內 RRsets", "可管理該網域。", object({ zone: ref("Zone"), permission: zoneRole }));
add("/api/zones/{zone}", "delete", "刪除整個網域", "具有刪除網域權限，並通過刪除保護。", {}, { status: 204, body: object({ deletionPassword: secret }), query: [query("confirm", str, "必須等於不含結尾句點的完整網域名稱。", true)] });
add("/api/zones/{zone}/records", "get", "讀取 RRsets、雜湊及歸屬資料", "可管理該網域；結果按紀錄權限過濾。", object({ rrsets: array(ref("RRSet")), permission: zoneRole }));
for (const [method, title, body] of [["post", "新增解析值", "RecordCreate"], ["patch", "替換整組 RRset", "RecordReplace"], ["delete", "刪除解析值或整組 RRset", "RecordDelete"]]) {
  add("/api/zones/{zone}/records", method, title, "具有該名稱及紀錄類型的管理／編輯或刪除權限。", object({ rrset: nullable(ref("RRSet")), hash: str }), { body: ref(body), description: "expectedHash 為 GET 回傳的 RRset hash，過期回傳 409。PATCH／DELETE 必填，POST 可選。DELETE 未提供 content 時刪除整組。刪除或替換時移除既有值須通過刪除保護；所有操作保留審計與歸屬一致性檢查。" });
}
add("/api/zones/{zone}/permissions", "get", "列出網域授權", "可查看該網域並具有管理授權權限。", object({ permissions: array(ref("Permission")) }));
add("/api/zones/{zone}/permissions", "post", "建立或更新使用者網域授權", "可管理該網域授權；最高管理員帳號受保護。", object({ permission: ref("Permission") }), { status: 201, body: ref("PermissionInput"), description: "至少指定 userId 或 userEmail。resourcePattern 可為網域內完整名稱或 *.子網域。" });
add("/api/zones/{zone}/permissions/{id}", "delete", "移除網域授權", "可管理該網域授權；最高管理員帳號受保護。", {}, { status: 204 });
add("/api/inventory", "get", "列出可管理的 DNS 清查資料", "具有網域管理存取權；依紀錄授權過濾。", object({ records: array(ref("InventoryRecord")) }));
add("/api/inventory", "put", "儲存歸屬資料或清查紀錄", "具有該 DNS 紀錄的管理權限。", ref("Success"), { body: ref("InventoryUpdate"), description: "mode 決定是否更新 metadata、記錄 inspect 或同時執行。expectedUpdatedAt 是最新歸屬版本，尚未保存時為 null；不相符回傳 409。" });
add("/api/inventory/assignment", "put", "指派 DNS 所屬單位", "系統管理員。", ref("Success"), { body: ref("InventoryAssignment") });
add("/api/inventory/inspections/{id}", "delete", "刪除一筆清查歷史", "最高管理員。", ref("Success"), { body: ref("InspectionDelete") });
add("/api/admin/inspection-events", "get", "列出清查活動", "系統管理員。", object({ events: array(ref("InspectionEvent")), today: { type: "string", format: "date" } }));
add("/api/admin/inspection-events", "post", "建立清查活動", "系統管理員。", object({ event: ref("InspectionEvent") }), { status: 201, body: ref("EventFields"), description: "起訖日期以台北日期計算，開始不得晚於結束；活動期間不得重疊。依已儲存郵件設定，可能排入活動通知。" });
add("/api/admin/inspection-events", "patch", "更新清查活動", "系統管理員。", object({ event: ref("InspectionEvent") }), { body: ref("EventUpdate"), description: "expectedRevision 須符合最新版本；日期不得與其他活動重疊。" });
add("/api/admin/inspection-events", "delete", "刪除清查活動", "系統管理員。", object({ event: { type: "null" } }), { body: ref("EventDelete") });
add("/api/inspection-events/current", "get", "讀取目前清查活動", "登入者。", object({ event: nullable(ref("EventFields")) }));
add("/api/application-policy", "get", "讀取申請政策", "登入者。", object({ policy: ref("Policy"), admin: bool }));
add("/api/application-policy", "put", "更新申請政策", "系統管理員。", object({ policy: ref("Policy") }), { body: ref("PolicyUpdate"), description: "expectedUpdatedAt 用於並行檢查；adminOnlyTypes 不得重複，ownership 固定 UNIT_ONLY。" });
add("/api/admin/deletion-protection", "get", "讀取刪除保護狀態", "具有網域管理存取權。", ref("DeletionProtection"));
add("/api/admin/deletion-protection", "put", "設定刪除保護密碼", "最高管理員。", ref("DeletionProtection"), { body: ref("DeletionSettings"), description: "僅回傳設定狀態，不回傳密碼或雜湊。每次破壞性操作皆需重新提供密碼；五次錯誤後限制 15 分鐘。" });
add("/api/admin/dns-export", "post", "匯出全部 DNS CSV", "系統管理員。", {}, { responses: { "200": { description: "UTF-8 BOM CSV；包含全部網域類別，失敗時不回傳部分成功檔案。", headers: { "Content-Disposition": { schema: str, description: "attachment; filename=dns-records-時間戳.csv" } }, content: { "text/csv": { schema: str } } } } });
add("/api/admin/mail", "get", "讀取郵件設定及最近寄送紀錄", "系統管理員。", object({ settings: ref("MailSettings"), deliveries: array(ref("MailDelivery")), units: array(object({ id: str, name: str, admins: array(object({ name: str, email: nullable(str) })) }, ["id", "name"])) }));
add("/api/admin/mail", "put", "儲存郵件設定", "系統管理員。", ref("MailSettings"), { body: ref("MailSave"), description: "以 expectedRevision 防止覆寫；設定本身不寄信。Relay 固定 smtp-relay.gmail.com，465 或 587。" });
add("/api/admin/mail", "post", "排入測試、單位郵件或重試", "系統管理員。", object({ queued: integer }), { body: ref("MailAction"), description: "此操作會排入外寄郵件，非預覽。郵件服務須啟用；每位使用者每分鐘最多 5 次操作。send 主旨最多 300 字、本文最多 20000 字，僅接受支援的模板變數。test 的 expectedRevision 必須符合設定版本；retry 僅限 FAILED。" });
add("/api/users", "get", "列出帳號及管理能力", "系統管理員。", object({ users: array(ref("User")), canAssignAdmin: bool, canRemoveUsers: bool }));
add("/api/users", "post", "建立資料帳號", "系統管理員。", object({ user: ref("User") }), { status: 201, body: ref("UserCreate"), description: "建立無登入能力的資料帳號，可選擇加入單位。" });
add("/api/users/{id}", "patch", "更新帳號備註、停用狀態或角色", "系統管理員，並受目標帳號保護限制。", object({ user: ref("User") }), { body: ref("UserUpdate"), description: "不得啟用資料帳號登入或授予其管理角色；最高管理員受保護，僅允許符合條件的備註更新。" });
add("/api/users/{id}", "delete", "移除帳號", "最高管理員，並受目標帳號保護限制。", object({ removed: { const: true } }), { body: object({ confirmId: { ...str, minLength: 1 } }), description: "confirmId 必須等於路徑 id。移除帳號不應用作修改 SSO 身份對應。" });
add("/api/users/contacts", "get", "列出可用的資料帳號聯絡資訊", "登入者；系統管理員可看全部，其餘限共同單位。", object({ contacts: array(object({ id: str, name: str, email: str, units: array(str) })) }));
const pageQuery = query("page", { type: "integer", minimum: 1, maximum: 10000, default: 1 }, "每頁 50 筆。從 1 開始。");
add("/api/audit", "get", "搜尋系統操作紀錄", "系統管理員。", object({ events: array(ref("AuditEvent")), total: integer, page: integer }), { query: [query("q", { type: "string", maxLength: 200, default: "" }), query("action", { type: "string", maxLength: 100, default: "" }), query("status", { ...enumeration("all", "success", "failed"), default: "all" }), pageQuery] });
add("/api/dns-history", "get", "搜尋網域 DNS 歷程", "可管理該網域，並依紀錄範圍過濾。", object({ events: array(ref("DnsHistoryEvent")), total: integer, page: integer, syncError: str }), { query: [query("zone", { type: "string", minLength: 1, maxLength: 255 }, "完整網域名稱。", true), query("name", { type: "string", maxLength: 255, default: "" }), query("type", { type: "string", maxLength: 30, default: "" }), query("q", { type: "string", maxLength: 200, default: "" }), pageQuery], description: "PowerDNS 無法同步時仍回傳已保存歷程，syncError 說明限制；HTTP 200 不表示同步成功。" });
for (const method of ["get", "post"]) add("/api/session/activity", method, method === "get" ? "讀取閒置登入到期時間" : "延長有效的閒置登入", "登入者；不可恢復已過期登入。", ref("SessionActivity"));
add("/api/system/health", "get", "檢查 PowerDNS 與資料庫設定狀態", "SUPER_ADMIN。", ref("SystemHealth"), { description: "PowerDNS 會實際讀取網域；database.status 只反映 DATABASE_URL 是否設定，不是資料庫連線測試。" });
add("/healthz", "get", "容器健康檢查", "公開。", object({ status: { const: "ok" } }), { public: true, responses: { "503": jsonResponse(object({ status: { const: "unavailable" } }), "資料庫探測失敗，或正式環境未設定資料庫。") } });
add("/api/openapi", "get", "下載此 OpenAPI 規格", "登入者。", ref("OpenApiDocument"));

for (const [path, methods, message] of [
  ["/api/admin/allowlist", ["get", "post", "delete"], "登入白名單功能已移除。"],
  ["/api/admin/powerdns", ["get", "post", "put"], "PowerDNS 連線僅能由伺服器環境變數設定。"],
  ["/api/contact", ["get", "post", "patch"], "使用者訊息功能已移除。"],
  ["/api/inspection-tasks", ["get", "post", "patch", "delete"], "清查通知與回覆管理功能已移除。"],
  ["/api/dns-changes", ["get"], "DNS 變更紀錄功能已移除。"],
  ["/api/dns-changes/{id}/restore", ["post"], "DNS 變更紀錄功能已移除。"],
] as const) {
  for (const method of methods) {
    add(path, method, "已停用", "Proxy 仍要求有效登入，寫入仍檢查同源；不讀寫舊資料。", ref("Error"), { status: 410, description: message });
    paths[path][method].deprecated = true;
  }
}

// Auth.js owns the catch-all protocol; document its concrete actions, not an invalid multi-segment path parameter.
const authSource = "app/api/auth/[...nextauth]/route.ts";
for (const [path, methods, summary] of [
  ["/api/auth/providers", ["get"], "列出環境已啟用的登入供應者"],
  ["/api/auth/csrf", ["get"], "取得 Auth.js CSRF token 與對應 Cookie"],
  ["/api/auth/session", ["get", "post"], "讀取或更新 Auth.js session"],
  ["/api/auth/signin", ["get"], "前往登入頁"],
  ["/api/auth/signin/{provider}", ["get", "post"], "啟動指定供應者登入"],
  ["/api/auth/callback/{provider}", ["get", "post"], "登入供應者回呼"],
  ["/api/auth/signout", ["get", "post"], "登出確認或清除 session"],
  ["/api/auth/error", ["get"], "登入錯誤頁"],
  ["/api/auth/verify-request", ["get"], "Auth.js 驗證請求頁"],
  ["/api/auth/webauthn-options", ["get"], "Auth.js WebAuthn 選項（目前未設定此供應者）"],
] as const) {
  for (const method of methods) {
    const response = path.endsWith("csrf") ? object({ csrfToken: str }) : path.endsWith("providers") ? { type: "object", additionalProperties: object({ id: str, name: str, type: str, signinUrl: str, callbackUrl: str }) } : path.endsWith("session") ? object({ user: object({ id: str, name: nullable(str), email: nullable(str), image: nullable(str) }, []), expires: dateTime, idleExpiresAt: { type: "number" } }, []) : object({ url: str }, []);
    const parameters = path.includes("/callback/") ? [query("code", str, "OAuth/OIDC 授權碼。"), query("state", str, "供應者回傳的 OAuth state；由 Auth.js 驗證。"), query("error", str, "供應者錯誤代碼。")]
      : path.includes("/signin") || path.includes("/signout") ? [query("callbackUrl", str, "登入／登出後的返回 URL，仍受 Auth.js 重導向規則限制。")]
        : path.endsWith("/error") ? [query("error", str, "Auth.js 錯誤代碼。")]: [];
    add(path, method, summary, "Auth.js 協定；供應者依部署設定啟用。登入前可存取。", response, { public: true, query: parameters, description: "由 Auth.js 處理。POST 使用 CSRF token 與對應 Cookie（OAuth 回呼另依供應者 state／PKCE 驗證）；支援表單或 JSON。Portal 使用 logto，密碼登入僅在部署明確啟用時提供 credentials。成功可能回傳 JSON、HTML 或重新導向；未設定的供應者不代表可使用。" });
    const operation = paths[path][method];
    operation["x-source-route"] = authSource;
    operation.responses["200"] = { description: "Auth.js 回應；session 未登入時為 null。", content: { "application/json": { schema: path.endsWith("/session") ? nullable(response) : response }, "text/html": { schema: str } } };
    operation.responses.default = { description: "Auth.js 協定錯誤，可能回傳 JSON、HTML 或重導向至登入錯誤頁。", content: { "application/json": { schema: object({ error: str, message: str, url: str }, []) }, "text/html": { schema: str } } };
    operation.responses["302"] = { description: "前往登入供應者、登入頁或 callbackUrl。", headers: { Location: { schema: str } } };
    operation.responses["303"] = { description: "登入／登出後重新導向。", headers: { Location: { schema: str } } };
    if (path.includes("{provider}")) operation.parameters.find(p => p.name === "provider")!.description = "依 /api/auth/providers 列表，常見為 logto 或 credentials；不可自行指定 SSO 身份。";
    if (method === "post") {
      const schema = object({ csrfToken: str, callbackUrl: str, data: { type: "object" }, email: str, password: { ...str, writeOnly: true }, code: str, state: str }, []);
      operation.requestBody = { description: "欄位依 Auth.js action 與供應者而異。credentials callback 使用 email／password；OAuth callback 使用 code／state。", content: { "application/json": { schema }, "application/x-www-form-urlencoded": { schema } } };
    }
  }
}

export const openApiDocument = {
  openapi: "3.1.1",
  info: {
    title: "DNS Manager API", version: "1.0.0",
    description: "現有 HTTP API 規格。業務 API 使用 Auth.js HttpOnly session Cookie；不支援 Bearer API key。HTTPS Cookie 名稱為 __Secure-authjs.session-token，本機 HTTP 為 authjs.session-token，可能分段。登入另受 15 分鐘閒置期限約束。所有非 Auth.js 的寫入必須同源（若帶 Origin，須符合 AUTH_URL／NEXTAUTH_URL 或請求來源；無 Origin 依目前規則允許）；應用不提供跨來源 CORS 存取。除 /healthz、Auth.js 協定外，均須登入。無權限資源可能以 404 隱藏。所有回應可能含 X-Request-ID；經 auditMutation 的寫入可能含 X-Audit-Warning: completion-unavailable，表示操作已完成但完成審計寫入失敗。文件僅描述介面，不提供自動執行正式 DNS、寄信或資料刪除的功能。",
  },
  servers: [{ url: "/", description: "目前部署的同源站點" }],
  security: [{ secureSession: [] }, { localSession: [] }],
  tags: [...new Set(Object.values(paths).flatMap(methods => Object.values(methods).flatMap(operation => operation.tags)))].map(name => ({ name })),
  paths,
  components: {
    securitySchemes: {
      secureSession: { type: "apiKey", in: "cookie", name: "__Secure-authjs.session-token", description: "HTTPS 登入後由 Auth.js 管理的 HttpOnly session Cookie。" },
      localSession: { type: "apiKey", in: "cookie", name: "authjs.session-token", description: "本機 HTTP 登入 Cookie；正式環境應使用 HTTPS。" },
    },
    schemas,
  },
};
