import { expect, it } from "vitest";
import { reverseExample, reverseNameIp, reverseZoneInfo } from "@/lib/dns/reverse";
it("explains which part of the IP a reverse record name holds", () => {
  expect(reverseZoneInfo("2.0.192.in-addr.arpa.")).toEqual({ family: "ipv4", prefix: ["192", "0", "2"], remaining: 1 });
  expect(reverseZoneInfo("example.com.")).toBeNull();
  expect(reverseExample("2.0.192.in-addr.arpa.")).toEqual({ ip: "192.0.2.10", name: "10" });
  expect(reverseExample("115.140.in-addr.arpa.")).toEqual({ ip: "140.115.2.10", name: "10.2" });
  expect(reverseExample("8.b.d.0.1.0.0.2.ip6.arpa.")).toEqual({ ip: "2001:db8::1", name: ["1", ...Array(23).fill("0")].join(".") });
});
it("previews the IP a reverse name points at", () => {
  expect(reverseNameIp("10.2.0.192.in-addr.arpa.")).toEqual({ ip: "192.0.2.10" });
  expect(reverseNameIp("2.0.192.in-addr.arpa.")).toEqual({ missing: 1 });
  expect(reverseNameIp("1.0.0.10.2.0.192.in-addr.arpa.")).toEqual({ missing: -3 });
  expect(reverseNameIp("www.2.0.192.in-addr.arpa.")).toBeNull();
  expect(reverseNameIp([...["1", ...Array(23).fill("0")], "8.b.d.0.1.0.0.2.ip6.arpa."].join("."))).toEqual({ ip: "2001:db8::1" });
});
