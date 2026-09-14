import { expect, it } from "vitest";
import { filterRequests, scopeRequests, statuses, type DnsRequest } from "@/components/requests/model";

const item: DnsRequest = { id: "one", zoneName: "example.com.", recordName: "Lab.example.com.", recordType: "TXT", content: "test", ttl: 300, status: "PENDING", createdAt: "2026-09-14T00:00:00Z", canReview: false, user: { id: "u", email: "student@example.com", name: "王小明" }, applicantUnit: "實驗室", applicantExtension: "1234", purpose: "研究服務", reviewNote: "請補說明" };
it("searches visible identity, contact and purpose fields ignoring whitespace and case", () => {
  for (const query of [" LAB ", "STUDENT@example.com", "王小明", "實驗室", "1234", "研究服務", "請補說明"]) expect(filterRequests([item], query, "ALL")).toEqual([item]);
});
it("combines status with search and supports cancelled records", () => {
  const cancelled = { ...item, id: "two", status: "CANCELLED" as const };
  expect(statuses.some((entry) => entry.key === "CANCELLED")).toBe(true);
  expect(filterRequests([item, cancelled], "lab", "CANCELLED")).toEqual([cancelled]);
  expect(filterRequests([item], "lab", "APPROVED")).toEqual([]);
});
it("handles empty results and missing optional fields without matching undefined", () => {
  expect(filterRequests([], "", "ALL")).toEqual([]);
  expect(filterRequests([{ ...item, user: { id: "u", email: "" }, purpose: null }], "undefined", "ALL")).toEqual([]);
});
it("separates own, shared and actionable requests without granting permission", () => {
  const shared = { ...item, id: "shared", unitId: "unit", user: { id: "other", email: "other@example.com" } };
  const reviewable = { ...shared, id: "reviewable", canReview: true };
  const rows = [item, shared, reviewable];
  expect(scopeRequests(rows, "MINE", "u")).toEqual([item]);
  expect(scopeRequests(rows, "SHARED", "u")).toEqual([shared, reviewable]);
  expect(scopeRequests(rows, "REVIEWABLE", "u")).toEqual([reviewable]);
  expect(shared.canReview).toBe(false);
});
