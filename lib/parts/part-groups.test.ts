import { describe, expect, it } from "vitest";

import { partGroupsOnNodes } from "./part-groups";

describe("partGroupsOnNodes", () => {
  it("lists each part group once, with the first repair that uses it", () => {
    const groups = partGroupsOnNodes([
      {
        id: "1M01510000WV0",
        description: "Renew the front brake pads",
        genarts: [
          { id: 402, description: "Brake Pad Set, disc brake" },
          { id: 2746, description: " Accessory Kit, disc brake pads " },
        ],
      },
      {
        id: "1M01534000WV0",
        description: "Renew the rear brake pads",
        genarts: [{ id: 402, description: "Brake Pad Set, disc brake" }],
      },
    ]);
    expect(groups).toEqual([
      { genartId: 402, description: "Brake Pad Set, disc brake", sampleRepair: "Renew the front brake pads" },
      { genartId: 2746, description: "Accessory Kit, disc brake pads", sampleRepair: "Renew the front brake pads" },
    ]);
  });

  it("ignores labour-only repairs and malformed ids", () => {
    expect(
      partGroupsOnNodes([
        { id: "a", description: "Check the brake fluid", genarts: null },
        { id: "b", description: "Adjust the handbrake", genarts: [{ id: 0 }, { id: null }, { id: -3 }] },
      ]),
    ).toEqual([]);
  });
});
