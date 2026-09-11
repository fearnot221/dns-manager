import { describe,expect,it } from "vitest";
import { displayDnsName, normalizeDnsName, normalizeRecordContent, normalizeZoneName, validateTtl } from "@/lib/dns/names";

describe("DNS name normalization",()=>{
  it("normalizes zones and relative names",()=>{expect(normalizeZoneName("Example.COM")).toBe("example.com.");expect(normalizeDnsName("www","example.com")).toBe("www.example.com.");expect(normalizeDnsName("@","example.com.")).toBe("example.com.");});
  it("does not append a zone twice",()=>expect(normalizeDnsName("www.example.com.","example.com.")).toBe("www.example.com."));
  it("renders names for the UI",()=>{expect(displayDnsName("example.com.","example.com.")).toBe("@");expect(displayDnsName("_sip._tcp.example.com.","example.com.")).toBe("_sip._tcp");});
  it("rejects out-of-range TTL",()=>expect(()=>validateTtl(29)).toThrow());
});

describe("record content",()=>{
  it("validates IP addresses",()=>{expect(normalizeRecordContent("A","192.0.2.1")).toBe("192.0.2.1");expect(()=>normalizeRecordContent("A","999.2.1.1")).toThrow("IPv4");});
  it("normalizes targets and structured records",()=>{expect(normalizeRecordContent("CNAME","Target.Example.net")).toBe("target.example.net.");expect(normalizeRecordContent("MX","10 mail.example.net")).toBe("10 mail.example.net.");expect(normalizeRecordContent("SRV","10 5 443 sip.example.net")).toBe("10 5 443 sip.example.net.");});
  it("quotes TXT and CAA values",()=>{expect(normalizeRecordContent("TXT","hello world")).toBe('"hello world"');expect(normalizeRecordContent("CAA","0 issue letsencrypt.org")).toBe('0 issue "letsencrypt.org"');});
});
