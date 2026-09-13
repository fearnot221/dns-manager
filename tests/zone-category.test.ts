import { expect, it } from "vitest";
import { filterZones, zoneCategory } from "@/lib/dns/zone-category";
it("classifies reverse zones with case and trailing-dot normalization", () => {
  for (const name of ["10.in-addr.arpa.", " IN-ADDR.ARPA ", "0/25.40.213.10.in-addr.arpa."]) expect(zoneCategory(name)).toBe("ipv4");
  for (const name of ["8.b.d.0.1.0.0.2.ip6.arpa.", "IP6.ARPA."]) expect(zoneCategory(name)).toBe("ipv6");
  for (const name of ["example.com.", "notin-addr.arpa", "ip6.arpa.example.com", "myip6.arpa"]) expect(zoneCategory(name)).toBe("forward");
});
it("searches only the selected category and naturally sorts without mutation", () => {
  const zones = [{ name: "10.in-addr.arpa." }, { name: "example.com." }, { name: "2.in-addr.arpa." }, { name: "1.ip6.arpa." }];
  expect(filterZones(zones, "ipv4", " ARPA ").map((zone) => zone.name)).toEqual(["2.in-addr.arpa.", "10.in-addr.arpa."]);
  expect(filterZones(zones, "forward", "arpa")).toEqual([]);
  expect(filterZones(zones, "ipv6", "IP6")).toEqual([zones[3]]);
  expect(zones[0].name).toBe("10.in-addr.arpa.");
});
