import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/client/use-resource", () => ({ useResource: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not-found"); } }));
import { useResource } from "@/lib/client/use-resource";
import { requireActor } from "@/lib/auth/session";
import { DnsManagementWorkbench } from "@/components/admin/dns-management-workbench";
import ZonesPage from "@/app/(workspace)/zones/page";
import InventoryPage from "@/app/(workspace)/inventory/page";
import ZonePage from "@/app/(workspace)/zones/[zone]/page";
import type { HashedRRSet } from "@/components/records/model";

const zoneNames = ["empty.example.", "2.0.192.in-addr.arpa.", "ce.ncu.edu.tw.", "ee.ncu.edu.tw."];
const zones = zoneNames.map((name) => ({ id: name, name, kind: "Native", serial: 123, dnssec: false, recordCount: 2, permission: "ADMIN" }));
let permission: string, recordError: string, listError: string;
function rrsets(zone: string): HashedRRSet[] {
  if (zone === "empty.example.") return [];
  return [{ name: `host.${zone}`, type: zone.includes("arpa") ? "PTR" : "A", ttl: 300, hash: "full-rrset-hash", records: ["192.0.2.1", "192.0.2.2"].map((content) => ({ content, disabled: false, ownership: { id: zone + content, applicantName: "管理人", applicantEmail: "", applicantUnit: "所屬單位", applicantExtension: "123", purpose: "研究用途", updatedAt: null, updatedBy: "", inspections: [] } })) }, { name: zone, type: "SOA", ttl: 300, hash: "apex-hash", records: [{ content: "ns.example. hostmaster.example. 1 3600 600 86400 300", disabled: false, ownership: { id: zone + "soa", applicantName: "", applicantEmail: "", applicantUnit: "", applicantExtension: "", purpose: "", updatedAt: null, updatedBy: "", inspections: [] } }] }];
}
const render = (initialDomain?: string) => renderToStaticMarkup(createElement(DnsManagementWorkbench, { initialDomain, systemAdmin: true, canDeleteInspections: false }));
beforeEach(() => {
  permission = "ADMIN"; recordError = ""; listError = "";
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
  vi.mocked(useResource).mockImplementation((url) => {
    const zone = decodeURIComponent(url.split("/")[3] ?? "");
    return { data: url === "/api/zones" ? { zones } : { rrsets: rrsets(zone), permission }, loading: false, error: url === "/api/zones" ? listError : recordError, reload: vi.fn() } as never;
  });
});
it("combines domain tabs, inspection, metadata and record controls without view modes", () => {
  const html = render();
  const labels = [...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);
  expect(labels).toEqual(["ee.ncu.edu.tw.", "ce.ncu.edu.tw.", "2.0.192.in-addr.arpa.", "empty.example."]);
  expect(html).toContain("研究用途"); expect(html).toContain("所屬單位"); expect(html).toContain("TTL 300s");
  expect(html).toContain("新增紀錄"); expect(html).toContain("篩選紀錄類型"); expect(html).toContain("清查顯示篩選");
  for (const value of ["192.0.2.1", "192.0.2.2"]) {
    expect(html).toContain(`aria-label="清查 host.ee.ncu.edu.tw. ${value}"`);
    expect(html).toContain(`aria-label="刪除 host.ee.ncu.edu.tw. ${value}"`);
  }
  expect(html).toContain("編輯紀錄組"); expect(html).not.toContain("檢視模式");
  expect(html).not.toContain('aria-label="刪除 ee.ncu.edu.tw. ns.example.');
});
it("keeps reverse and empty domains accessible, with add available in an empty domain", () => {
  const reverse = render("2.0.192.in-addr.arpa");
  expect(reverse).toContain('aria-label="清查 host.2.0.192.in-addr.arpa. 192.0.2.1"');
  expect(reverse).toContain("編輯紀錄組");
  const empty = render("empty.example.");
  expect(empty).toContain("這個網域尚無 DNS 紀錄"); expect(empty).toContain("新增紀錄");
  expect(empty).not.toContain('aria-label="清查 host.ee.ncu');
});
it("requires a loaded management role and preserves error recovery without mutation controls", () => {
  permission = "VIEWER";
  expect(render()).not.toContain("新增紀錄"); expect(render()).not.toContain("編輯紀錄組");
  permission = "SUPER_ADMIN";
  expect(render()).toContain('aria-label="刪除 ee.ncu.edu.tw. ns.example.');
  recordError = "網域暫時離線";
  const html = render();
  expect(html).toContain("網域暫時離線"); expect(html).toContain("ce.ncu.edu.tw."); expect(html).not.toContain("新增紀錄");
  listError = "無法取得網域";
  expect(render()).toContain("無法取得網域");
});
it("routes old inspection and zone URLs to the unified page while preserving authorization", async () => {
  await expect(InventoryPage()).rejects.toThrow("redirect:/zones");
  await expect(ZonePage({ params: Promise.resolve({ zone: "CE.NCU.EDU.TW" }), searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/zones?domain=ce.ncu.edu.tw.");
  const page = await ZonesPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ domain: "ce.ncu.edu.tw." }) });
  expect(renderToStaticMarkup(page)).toContain("DNS 管理");
  expect(renderToStaticMarkup(page)).toContain('aria-label="清查 host.ce.ncu.edu.tw. 192.0.2.1"');
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles: {} });
  await expect(InventoryPage()).rejects.toThrow("redirect:/requests");
  await expect(ZonesPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/requests");
  await expect(ZonePage({ params: Promise.resolve({ zone: "ce.ncu.edu.tw." }), searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
});
it("allows delegated admins only to their authorized domain deep links", async () => {
  vi.mocked(requireActor).mockResolvedValue({ id: "delegate", email: "delegate@example.com", globalRole: "USER", zoneRoles: { "ce.ncu.edu.tw.": "ADMIN" } });
  await expect(ZonePage({ params: Promise.resolve({ zone: "ee.ncu.edu.tw." }), searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
  await expect(ZonePage({ params: Promise.resolve({ zone: "ce.ncu.edu.tw." }), searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/zones?domain=ce.ncu.edu.tw.");
});
it("offers per-record history and keeps deleted-record history accessible in empty zones", () => {
  const populated = render("ce.ncu.edu.tw.");
  expect(populated).toContain('aria-label="歷程 host.ce.ncu.edu.tw. A"');
  expect(populated).toContain("DNS 歷程（含已刪除）");
  expect(render("empty.example.")).toContain("DNS 歷程（含已刪除）");
});
