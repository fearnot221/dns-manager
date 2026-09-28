import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RequestCard } from "@/components/requests/request-card";
import { ReviewDialog } from "@/components/requests/request-dialogs";
import type { DnsRequest } from "@/components/requests/model";
const item: DnsRequest = { id: "r", unitId: "unit", operation: "DELETE", sourceRecordId: "record", originalContent: "192.0.2.1", zoneName: "example.com.", recordName: "host.example.com.", recordType: "A", content: "192.0.2.1", ttl: 300, purpose: "服務退役", status: "PENDING", canReview: true, createdAt: "2026-09-29T00:00:00Z", user: { id: "u", name: "使用者", email: null } };
it("identifies deletion in the request summary and detail", () => {
  const html = renderToStaticMarkup(createElement(RequestCard, { item, admin: true, onReview: () => {} }));
  expect(html).toContain("刪除申請"); expect(html).toContain("刪除內容"); expect(html).toContain("服務退役");
  expect(html).not.toContain("變更既有 DNS"); expect(html).not.toContain("新增 DNS");
});
it("makes deletion explicit at approval instead of describing it as a replacement", () => {
  const html = renderToStaticMarkup(createElement(ReviewDialog, { review: { item, decision: "APPROVE" }, onClose: () => {}, onSaved: async () => {} }));
  expect(html).toContain("核准並刪除"); expect(html).toContain("刪除內容："); expect(html).toContain("服務退役");
  expect(html).not.toContain("新內容："); expect(html).not.toContain("只替換");
});
