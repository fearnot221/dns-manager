import { afterEach, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: (fn: unknown) => fn }));
import { useFormDraft as draftLifecycle, type FormDrafts } from "@/lib/client/form-draft";

class Field { constructor(public value: string) {} }
function form(values: Record<string, string>) {
  const fields = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, new Field(value)]));
  return { fields, elements: { namedItem: (name: string) => fields[name] } };
}
afterEach(() => vi.unstubAllGlobals());
it("restores all unfinished fields after closing and reopening, isolating records and versions", () => {
  vi.stubGlobal("HTMLInputElement", Field);
  vi.stubGlobal("HTMLTextAreaElement", Field);
  vi.stubGlobal("FormData", class {
    constructor(private source: ReturnType<typeof form>) {}
    *[Symbol.iterator]() { for (const [name, field] of Object.entries(this.source.fields)) yield [name, field.value]; }
  });
  const drafts: FormDrafts = new Map();
  const values = { applicantName: "王小明", applicantEmail: "incomplete@", applicantUnit: "系所", applicantExtension: "1234", purpose: "尚未完成用途", note: "清查中" };
  const editing = form(values);
  draftLifecycle(drafts, "record-1-version-1").onChange({ currentTarget: editing } as never);
  const reopened = form(Object.fromEntries(Object.keys(values).map((key) => [key, ""])));
  const remounted = draftLifecycle(drafts, "record-1-version-1");
  remounted.attachForm(reopened as never);
  expect(Object.fromEntries(Object.entries(reopened.fields).map(([key, value]) => [key, value.value]))).toEqual(values);
  for (const key of ["record-2-version-1", "record-1-version-2"]) {
    const other = form({ purpose: "最新資料" });
    draftLifecycle(drafts, key).attachForm(other as never);
    expect(other.fields.purpose.value).toBe("最新資料");
  }
  remounted.clear();
  expect(drafts.has("record-1-version-1")).toBe(false);
});
it("does not share drafts with a new page instance", () => {
  const page: FormDrafts = new Map([["record", { purpose: "草稿" }]]);
  const nextPage: FormDrafts = new Map();
  draftLifecycle(nextPage, "record").clear();
  expect(page.get("record")).toEqual({ purpose: "草稿" });
  expect(nextPage.size).toBe(0);
});
