import { expect, it, vi } from "vitest";
const databaseAccess = vi.hoisted(() => vi.fn(() => { throw new Error("Retired APIs must not access the database"); }));
vi.mock("@/lib/db/client", () => ({ db: new Proxy({}, { get: databaseAccess }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
import * as contact from "@/app/api/contact/route";
import * as inspections from "@/app/api/inspection-tasks/route";
import ContactPage from "@/app/(workspace)/contact/page";
import InspectionsPage from "@/app/(workspace)/inspections/page";

it.each([
  ["contact GET", contact.GET], ["contact POST", contact.POST], ["contact PATCH", contact.PATCH],
  ["inspections GET", inspections.GET], ["inspections POST", inspections.POST], ["inspections PATCH", inspections.PATCH], ["inspections DELETE", inspections.DELETE],
] as const)("retires %s without reading or changing historical data", async (_name, handler) => {
  const response = handler();
  expect(response.status).toBe(410);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: expect.stringContaining("已移除") });
  expect(databaseAccess).not.toHaveBeenCalled();
});
it.each([["contact", ContactPage], ["inspections", InspectionsPage]] as const)("does not serve the retired %s page", (_name, page) => {
  expect(() => page()).toThrow("NEXT_NOT_FOUND");
});
