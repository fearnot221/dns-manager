import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatTimestamp, tutorials } from "@/lib/guide/tutorials";

describe("usage guide tutorials", () => {
  it("ships every video and poster it references", () => {
    for (const tutorial of tutorials) for (const file of [tutorial.src, tutorial.poster, tutorial.captions]) expect(existsSync(`public${file}`), file).toBe(true);
  });
  it("keeps chapters ordered inside the video", () => {
    for (const tutorial of tutorials) {
      const [minutes, seconds] = tutorial.duration.split(":").map(Number);
      const starts = tutorial.chapters.map((chapter) => chapter.at);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(starts.at(-1)!).toBeLessThan(minutes * 60 + seconds);
    }
  });
  it("shows the administrator video only to administrators", () => {
    expect(tutorials.filter((tutorial) => !tutorial.adminOnly).map((tutorial) => tutorial.id)).toEqual(["unit"]);
  });
  it("formats chapter timestamps", () => {
    expect(formatTimestamp(7)).toBe("0:07");
    expect(formatTimestamp(326)).toBe("5:26");
  });
});
