import { expect, it } from "vitest";
import { matchesDnsRecord } from "@/lib/dns/search";

it.each([
  ["example.com.", "example.com."],
  ["EXAMPLE.COM", "example.com."],
  ["@", "example.com."],
  ["2.0.192.in-addr.arpa.", "2.0.192.in-addr.arpa."],
])("finds apex %s using @", (name, zone) => {
  expect(matchesDnsRecord(" @ ", name, zone, ["SOA"])).toBe(true);
});
it("does not match subdomains because their content or contact contains @", () => {
  expect(matchesDnsRecord("@", "www.example.com.", "example.com.", ["contact@example.com"])).toBe(false);
});
it("preserves full names, relative names, content, type and empty searches", () => {
  for (const query of ["", " WWW ", "WWW.EXAMPLE.COM.", " aaaa ", "2001:db8::1", "contact@example.com"]) {
    expect(matchesDnsRecord(query, "www.example.com.", "example.com.", ["AAAA", "2001:db8::1", "contact@example.com"])).toBe(true);
  }
  expect(matchesDnsRecord("missing", "www.example.com.", "example.com.", [])).toBe(false);
});
