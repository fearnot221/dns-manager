import { Children, isValidElement, useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...await importOriginal<typeof import("react")>(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/units/unit-workspace", () => ({ useUnitWorkspace: () => ({}) }));
vi.mock("@/lib/client/use-resource", () => ({ useResource: () => ({ data: { units: ["one", "two"].map(id => ({ id, role: "ADMIN" })) } }) }));

import { UnitsWorkbench } from "@/components/units/units-workbench";

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

it.each([[72, 728], [-120, 920], [900, 0]])("reserves the viewport before replacing unit details (layout top: %s)", (top, expectedHeight) => {
  const setters = [vi.fn(), vi.fn(), vi.fn()];
  let stateIndex = 0;
  vi.mocked(useState).mockImplementation((...args: unknown[]) => [args[0], setters[stateIndex++]] as never);
  vi.mocked(useRef).mockReturnValue({ current: { getBoundingClientRect: () => ({ top }) } } as never);
  vi.stubGlobal("window", { innerHeight: 800 });

  const view = UnitsWorkbench({ systemAdmin: true });
  const layout = Children.toArray(view.props.children).find(child => isValidElement<{ className?: string }>(child) && child.props.className === "unit-layout");
  if (!isValidElement<{ children: React.ReactElement<{ onSelect: (id: string) => void }>[] }>(layout)) throw new Error("Unit layout missing");
  layout.props.children[0].props.onSelect("two");

  expect(setters[1]).toHaveBeenCalledWith(expectedHeight);
  expect(setters[0]).toHaveBeenCalledWith("two");
  expect(setters[1].mock.invocationCallOrder[0]).toBeLessThan(setters[0].mock.invocationCallOrder[0]);
});
