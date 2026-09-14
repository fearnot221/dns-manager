import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error { status = 401; } }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/db/client", () => ({ db: { contactMessage: { findMany: vi.fn(async () => []) }, inspectionTask: { findMany: vi.fn(async () => []) } } }));
vi.mock("@/lib/workflows/service", () => ({ requireWorkflowDatabase: vi.fn(), publicContact: vi.fn(), publicUserSelect: { id: true }, sendContact: vi.fn(), replyContact: vi.fn(), assignInspection: vi.fn(), respondInspection: vi.fn(), cancelInspection: vi.fn() }));
vi.mock("@/lib/requests/policy", () => ({ readApplicationPolicy: vi.fn(), saveApplicationPolicy: vi.fn() }));
import { requireActor, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { GET as contactGet, POST as contactPost } from "@/app/api/contact/route";
import { GET as inspectionGet, PATCH as inspectionPatch } from "@/app/api/inspection-tasks/route";
import { PUT as policyPut } from "@/app/api/application-policy/route";
import { sendContact, respondInspection } from "@/lib/workflows/service";
import { saveApplicationPolicy } from "@/lib/requests/policy";
const user = { id: "user-one", email: "one@example.com", globalRole: "USER" as const, zoneRoles: {} };
const request = (path: string, method: string, body: unknown, origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireActor).mockResolvedValue(user); });
it("scopes both inboxes to the authenticated user", async () => {
 expect((await contactGet()).status).toBe(200);
 expect(db.contactMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: user.id } }));
 expect((await inspectionGet()).status).toBe(200);
 expect(db.inspectionTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: user.id } }));
});
it("allows system admins to see all inbox entries", async () => {
 vi.mocked(requireActor).mockResolvedValue({ ...user, globalRole: "ADMIN" });
 await contactGet(); await inspectionGet();
 expect(db.contactMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
 expect(db.inspectionTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
});
it("rejects unauthenticated reads", async () => {
 vi.mocked(requireActor).mockRejectedValue(new AuthError());
 expect((await contactGet()).status).toBe(401); expect((await inspectionGet()).status).toBe(401);
 expect(db.contactMessage.findMany).not.toHaveBeenCalled();
});
it("rejects cross-origin writes and sender impersonation", async () => {
 expect((await contactPost(request("contact", "POST", { subject: "a", body: "b" }, "https://attacker.example"))).status).toBe(403);
 expect((await contactPost(request("contact", "POST", { subject: "a", body: "b", userId: "someone-else" }))).status).toBe(400);
 expect(sendContact).not.toHaveBeenCalled();
});
it("requires an issue description and rejects forged inspection dates", async () => {
 expect((await inspectionPatch(request("inspection-tasks", "PATCH", { id: "task", status: "ISSUE", response: "" }))).status).toBe(400);
 expect((await inspectionPatch(request("inspection-tasks", "PATCH", { id: "task", status: "CONFIRMED", response: "", respondedAt: "2020-01-01" }))).status).toBe(400);
 expect(respondInspection).not.toHaveBeenCalled();
});
it("restricts policy writes to system admins and accepts the UI payload", async () => {
 const body = { policy: { allowedTypes: ["A"], ownership: "UNIT_ONLY" }, expectedUpdatedAt: null };
 expect((await policyPut(request("application-policy", "PUT", body))).status).toBe(403);
 expect(saveApplicationPolicy).not.toHaveBeenCalled();
 vi.mocked(requireActor).mockResolvedValue({ ...user, globalRole: "ADMIN" });
 vi.mocked(saveApplicationPolicy).mockResolvedValue({ before: { allowedTypes: [], ownership: "ANY", updatedAt: null }, after: { allowedTypes: ["A"], ownership: "UNIT_ONLY", updatedAt: null } });
 expect((await policyPut(request("application-policy", "PUT", body))).status).toBe(200);
 expect(saveApplicationPolicy).toHaveBeenCalledWith(body.policy, null);
});
