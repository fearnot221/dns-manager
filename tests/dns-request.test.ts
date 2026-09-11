import { describe, expect, it } from "vitest";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { dnsRequestDecisionSchema, dnsRequestSchema } from "@/lib/validation/api";
import type { Actor } from "@/lib/dns/types";

function actor(role?: "VIEWER" | "EDITOR" | "ADMIN"): Actor {
  return {
    id: "user-1",
    email: "user@example.com",
    globalRole: "USER",
    zoneRoles: role ? { "example.com.": role } : {},
  };
}

describe("DNS request access", () => {
  it("keeps zone management hidden from regular users and editors", () => {
    expect(canAccessZoneManagement(actor())).toBe(false);
    expect(canAccessZoneManagement(actor("EDITOR"))).toBe(false);
  });

  it("allows zone admins and super admins into zone management", () => {
    expect(canAccessZoneManagement(actor("ADMIN"))).toBe(true);
    expect(canAccessZoneManagement({ ...actor(), globalRole: "SUPER_ADMIN" })).toBe(true);
  });
});

describe("DNS request validation", () => {
  it("accepts a valid request", () => {
    expect(dnsRequestSchema.parse({
      zoneName: "example.com",
      name: "www",
      type: "A",
      ttl: 300,
      content: "192.0.2.10",
      purpose: "Website",
    }).type).toBe("A");
  });

  it("rejects protected record types and invalid decisions", () => {
    expect(dnsRequestSchema.safeParse({ zoneName: "example.com", name: "@", type: "SOA", ttl: 300, content: "value" }).success).toBe(false);
    expect(dnsRequestDecisionSchema.safeParse({ decision: "DELETE" }).success).toBe(false);
  });
});
