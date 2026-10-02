import { expect, it } from "vitest";
import { groupAccounts } from "@/lib/users/grouping";
it("groups all global admins together, repeats multi-unit users, and retains unassigned contacts", () => {
  const lab = { id: "lab", name: "Lab" }, office = { id: "office", name: "Office" };
  const users = [{ id: "admin", globalRole: "ADMIN", units: [lab] }, { id: "owner", globalRole: "SUPER_ADMIN", units: [] }, { id: "member", globalRole: "USER", units: [lab, office] }, { id: "contact", globalRole: "USER", units: [] }];
  const groups = groupAccounts(users);
  expect(groups.map((group) => group.id)).toEqual(["system-admins", "lab", "office", "unassigned"]);
  expect(groups[0].users.map((user) => user.id)).toEqual(["admin", "owner"]);
  expect(groups[1].users.map((user) => user.id)).toEqual(["member"]);
  expect(groups[2].users.map((user) => user.id)).toEqual(["member"]);
  expect(groups[3].users.map((user) => user.id)).toEqual(["contact"]);
});
