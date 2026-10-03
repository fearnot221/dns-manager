import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eventFields, eventStatus, inspectionEventLabel, taipeiDate } from "@/lib/inspection-events/model";
import { CurrentEventSummary } from "@/components/inspection-events/current-event";

const event = { name: "年度 DNS 清查", startsOn: "2026-10-04", endsOn: "2026-10-31" };

describe("inspection event dates and display", () => {
  it("validates calendar dates, trims names and rejects inverted ranges or extra fields", () => {
    expect(eventFields.parse({ ...event, name: "  年度清查  " }).name).toBe("年度清查");
    for (const invalid of [{ name: " " }, { startsOn: "2026-02-30" }, { startsOn: "2026-11-01" }, { endsOn: "2026-10-03" }, { createdBy: "forged" }]) {
      expect(eventFields.safeParse({ ...event, ...invalid }).success).toBe(false);
    }
    expect(eventFields.safeParse({ ...event, endsOn: event.startsOn }).success).toBe(true);
  });
  it("uses Taipei midnight with inclusive start/end dates", () => {
    expect(taipeiDate(new Date("2026-10-03T15:59:59.999Z"))).toBe("2026-10-03");
    expect(taipeiDate(new Date("2026-10-03T16:00:00Z"))).toBe("2026-10-04");
    expect(eventStatus(event, "2026-10-03")).toBe("尚未開始");
    expect(eventStatus(event, "2026-10-04")).toBe("進行中");
    expect(eventStatus(event, "2026-10-31")).toBe("進行中");
    expect(eventStatus(event, "2026-11-01")).toBe("已結束");
  });
  it("shows users only the current name/dates, with no management controls", () => {
    const html = renderToStaticMarkup(<CurrentEventSummary event={event} />);
    expect(html).toContain(event.name); expect(html).toContain(event.startsOn); expect(html).toContain(event.endsOn);
    expect(html).not.toContain("<button"); expect(html).not.toContain("<input");
    expect(renderToStaticMarkup(<CurrentEventSummary event={null} />)).toContain("目前沒有進行中的清查活動");
  });
  it("distinguishes event inspections, other times and unclassified legacy history", () => {
    expect(inspectionEventLabel({ eventName: event.name, eventClassified: true })).toBe(`活動期間清查：${event.name}`);
    expect(inspectionEventLabel({ eventName: null, eventClassified: true })).toBe("非活動期間清查");
    expect(inspectionEventLabel({})).toBe("舊紀錄（未標記活動）");
  });
});
