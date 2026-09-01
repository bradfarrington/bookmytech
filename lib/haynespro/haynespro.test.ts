import { describe, expect, it } from "vitest";
import { affinityFor, matchRank, toCatalogueNode } from "./catalogue";
import { extractStatusCode, isAuthFailure } from "./client";
import { excludedRepairNodeIdsForLabel, normaliseLabel } from "./exclusions";
import {
  buildModelCandidates,
  deriveModelLabel,
  pickBestCandidate,
  scoreCandidate,
} from "./vehicle";
import {
  flattenFuelType,
  kwToBhp,
  makesMatch,
  toPickerMake,
  toPickerModel,
  toPickerType,
} from "./vehicle-picker";
import type { HpCarType } from "./types";

describe("extractStatusCode", () => {
  it("reads the auth envelope ({statusCode})", () => {
    expect(extractStatusCode({ vrid: "ABC", statusCode: 0 })).toBe(0);
    expect(extractStatusCode({ statusCode: 2 })).toBe(2);
  });

  it("reads a per-item status inside arrays (verified live shape for a bad vrid)", () => {
    const payload = [
      {
        make: null,
        repairtimeTypeId: null,
        status: { statusCode: 5, confirmationLink: "incorrect vrid: DEAD" },
      },
    ];
    expect(extractStatusCode(payload)).toBe(5);
    expect(isAuthFailure(extractStatusCode(payload))).toBe(true);
  });

  it("treats status-0 items and missing statuses as OK", () => {
    expect(extractStatusCode([{ status: { statusCode: 0 } }, { status: null }])).toBeNull();
    expect(extractStatusCode([{ description: "x", value: 70 }])).toBeNull();
    expect(extractStatusCode(null)).toBeNull();
  });
});

describe("scoreCandidate / pickBestCandidate", () => {
  const details = {
    make: "VOLKSWAGEN",
    model: "GOLF",
    engineCapacity: 1390,
    fuelType: "PETROL",
    yearOfManufacture: 1999,
  };

  const golf14: HpCarType = {
    id: 26650,
    fullName: "VOLKSWAGEN Golf IV (1J) 1.4",
    capacity: 1390,
    fuelType: ["PETROL"],
    madeFrom: "1998",
    madeUntil: "2001",
  };
  const golf19tdi: HpCarType = {
    id: 26800,
    fullName: "VOLKSWAGEN Golf IV (1J) 1.9 TDi",
    capacity: 1896,
    fuelType: ["DIESEL"],
    madeFrom: "1998",
    madeUntil: "2003",
  };
  const golf16: HpCarType = {
    id: 26700,
    fullName: "VOLKSWAGEN Golf IV (1J) 1.6",
    capacity: 1595,
    fuelType: ["PETROL"],
    madeFrom: "1998",
    madeUntil: "2003",
  };

  it("rejects wrong engine sizes and wrong fuels outright", () => {
    expect(scoreCandidate(golf19tdi, details)).toBe(-1);
    expect(scoreCandidate(golf16, details)).toBe(-1); // 1595 vs 1390 > 100cc
  });

  it("prefers the exact-capacity, in-production-window candidate", () => {
    expect(pickBestCandidate([golf19tdi, golf16, golf14], details)).toBe(golf14);
  });

  it("out-of-range year loses points but is not disqualifying", () => {
    const outOfRange = { ...golf14, madeFrom: "1998", madeUntil: "1998" };
    expect(scoreCandidate(outOfRange, details)).toBeGreaterThan(0);
    expect(
      scoreCandidate(outOfRange, details) < scoreCandidate(golf14, details),
    ).toBe(true);
  });

  it("returns null when every candidate is rejected", () => {
    expect(pickBestCandidate([golf19tdi], details)).toBeNull();
    expect(pickBestCandidate([], details)).toBeNull();
  });

  it("tolerates missing details (fuel/capacity unknown → no filter applied)", () => {
    expect(
      pickBestCandidate([golf14, golf16], { make: "VOLKSWAGEN", model: "GOLF" }),
    ).toBe(golf14); // tie on 0 → first wins
  });

  // Live Cayenne shapes (2026-07-10): HaynesPro tags hybrids as PETROL with
  // "Hybrid" only in the type name; DVLA says "HYBRID ELECTRIC".
  describe("hybrids and EVs", () => {
    const hybridDetails = {
      make: "PORSCHE",
      model: "CAYENNE",
      engineCapacity: 2995,
      fuelType: "HYBRID ELECTRIC",
      yearOfManufacture: 2023,
    };
    const cayennePetrol: HpCarType = {
      id: 619009373,
      fullName: "PORSCHE Cayenne (9YA) 3.0",
      capacity: 2995,
      fuelType: "PETROL",
      madeFrom: "2018",
      madeUntil: null,
    };
    const cayenneEHybrid: HpCarType = {
      id: 619013069,
      fullName: "PORSCHE Cayenne (9YA) 3.0 E-Hybrid",
      capacity: 2995,
      fuelType: "PETROL",
      madeFrom: "2018",
      madeUntil: null,
    };
    const cayenneDiesel: HpCarType = {
      id: 102001922,
      fullName: "PORSCHE Cayenne (92A) 3.0 Diesel",
      capacity: 2967,
      fuelType: "DIESEL",
      madeFrom: "2011",
      madeUntil: "2013",
    };

    it("a petrol hybrid is NOT disqualified by HaynesPro's PETROL tag", () => {
      expect(scoreCandidate(cayennePetrol, hybridDetails)).toBeGreaterThan(0);
    });

    it("prefers the hybrid-named variant for an electrified vehicle", () => {
      expect(
        pickBestCandidate([cayennePetrol, cayenneEHybrid], hybridDetails),
      ).toBe(cayenneEHybrid);
    });

    it("diesel candidates still disqualify against a petrol hybrid", () => {
      expect(scoreCandidate(cayenneDiesel, hybridDetails)).toBe(-1);
    });

    it("diesel hybrids ('ELECTRIC DIESEL') accept DIESEL candidates", () => {
      expect(
        scoreCandidate(cayenneDiesel, {
          engineCapacity: 2967,
          fuelType: "ELECTRIC DIESEL",
          yearOfManufacture: 2012,
        }),
      ).toBeGreaterThan(0);
    });

    it("pure EVs ('ELECTRICITY') reject combustion candidates", () => {
      expect(
        scoreCandidate(cayennePetrol, { fuelType: "ELECTRICITY" }),
      ).toBe(-1);
    });
  });
});

describe("deriveModelLabel", () => {
  it("strips the type-name suffix off the full name", () => {
    expect(deriveModelLabel("VOLKSWAGEN Golf IV (1J) 1.4", "1.4")).toBe(
      "VOLKSWAGEN Golf IV (1J)",
    );
    expect(deriveModelLabel("AUDI Q3 (8U) 1.4 TSI", "1.4 TSI")).toBe("AUDI Q3 (8U)");
  });

  it("suffix match is case-insensitive", () => {
    expect(deriveModelLabel("FORD Focus II 1.6 TDCi", "1.6 tdci")).toBe("FORD Focus II");
  });

  it("keeps the full name when the type name is missing or not a suffix", () => {
    expect(deriveModelLabel("VOLKSWAGEN Golf IV (1J) 1.4", null)).toBe(
      "VOLKSWAGEN Golf IV (1J) 1.4",
    );
    expect(deriveModelLabel("VOLKSWAGEN Golf IV (1J) 1.4", "2.0 GTI")).toBe(
      "VOLKSWAGEN Golf IV (1J) 1.4",
    );
  });

  it("never returns an empty label", () => {
    expect(deriveModelLabel(null, "1.4")).toBeNull();
    expect(deriveModelLabel("  ", "1.4")).toBeNull();
    // pathological: full name IS the type name — keep it rather than empty
    expect(deriveModelLabel("1.4", "1.4")).toBe("1.4");
  });
});

describe("buildModelCandidates", () => {
  it("walks trim-noisy DVLA model strings down to the bare model name", () => {
    // Real case (2026-07-10): a 2024 Ranger's DVLA/MOT model string.
    expect(buildModelCandidates("RANGER WILDTRAK ECOBLUE 4X4 A")).toEqual([
      "RANGER WILDTRAK ECOBLUE 4X4 A",
      "RANGER WILDTRAK ECOBLUE 4X4",
      "RANGER WILDTRAK ECOBLUE",
      "RANGER WILDTRAK",
      "RANGER",
    ]);
  });

  it("single-word models yield a single candidate", () => {
    expect(buildModelCandidates("GOLF")).toEqual(["GOLF"]);
  });

  it("collapses odd whitespace and handles empty input", () => {
    expect(buildModelCandidates("  GRAND   CHEROKEE ")).toEqual([
      "GRAND CHEROKEE",
      "GRAND",
    ]);
    expect(buildModelCandidates("")).toEqual([]);
  });

  // HaynesPro names these series "3 (F30…)", "C (W205)", "3 (BM, BN)" —
  // verified live 2026-07-10. The derived candidates are LAST resorts.
  it("derives the series from BMW-style badges", () => {
    expect(buildModelCandidates("320D M SPORT")).toEqual([
      "320D M SPORT",
      "320D M",
      "320D",
      "3",
    ]);
    expect(buildModelCandidates("118I SPORT").at(-1)).toBe("1");
  });

  it("derives the class from Mercedes-style badges", () => {
    expect(buildModelCandidates("C220 D AMG LINE AUTO").at(-1)).toBe("C");
    expect(buildModelCandidates("GLC250 4MATIC").at(-1)).toBe("GLC");
    expect(buildModelCandidates("A180 SPORT CDI").at(-1)).toBe("A");
  });

  it("strips a leading make prefix off the model (MAZDA3 → 3)", () => {
    expect(buildModelCandidates("MAZDA3 SE-L NAV D", "MAZDA")).toContain("3");
  });

  it("plain models gain no derived candidates", () => {
    expect(buildModelCandidates("FIESTA ZETEC")).toEqual([
      "FIESTA ZETEC",
      "FIESTA",
    ]);
  });
});

describe("normaliseLabel", () => {
  it("collapses whitespace and uppercases", () => {
    expect(normaliseLabel("  Volkswagen   Golf IV  (1J) ")).toBe(
      "VOLKSWAGEN GOLF IV (1J)",
    );
    expect(normaliseLabel(null)).toBe("");
  });
});

describe("repair node exclusions", () => {
  const rows = [
    { node_id: "1F11100000GCJ", make_name: "FORD", model_name: "Ranger" }, // group
    { node_id: "1F11101000WV0", make_name: "FORD", model_name: "Ranger" }, // leaf
    { node_id: "1F11101000WV0", make_name: "VOLKSWAGEN", model_name: "Golf IV (1J1, 1J5, 9B1)" },
  ];

  it("matches groups and leaves for the vehicle's model label", () => {
    expect(excludedRepairNodeIdsForLabel("FORD Ranger", rows)).toEqual(
      new Set(["1F11100000GCJ", "1F11101000WV0"]),
    );
    expect(
      excludedRepairNodeIdsForLabel("VOLKSWAGEN Golf IV (1J1, 1J5, 9B1)", rows),
    ).toEqual(new Set(["1F11101000WV0"]));
  });

  it("unresolved vehicles and other models match nothing (default ON)", () => {
    expect(excludedRepairNodeIdsForLabel(null, rows).size).toBe(0);
    expect(excludedRepairNodeIdsForLabel("FORD Focus II", rows).size).toBe(0);
  });
});

describe("toCatalogueNode", () => {
  it("prices a timed leaf from its book time (min 1h) × the hourly rate", () => {
    expect(
      toCatalogueNode(
        { id: "1M01534000WV0", description: "Renew the rear brake pads", value: 110 },
        6000,
      ),
    ).toEqual({
      id: "1M01534000WV0",
      description: "Renew the rear brake pads",
      kind: "repair",
      billedHours: 1.1,
      pricePence: 6600,
    });
  });

  it("carries no price on a group", () => {
    expect(
      toCatalogueNode({ id: "0CJ0", description: "Common jobs", hasSubnodes: true }, 6000),
    ).toEqual({
      id: "0CJ0",
      description: "Common jobs",
      kind: "group",
      billedHours: null,
      pricePence: null,
    });
  });

  it("drops what can't be presented: no id, and untimed leaves", () => {
    // An untimed leaf can't be priced, so it can't be booked — showing it
    // would be a dead end in both the website and the app.
    expect(toCatalogueNode({ id: "X", description: "Untimed", value: null }, 6000)).toBeNull();
    expect(toCatalogueNode({ id: "X", description: "Zero", value: 0 }, 6000)).toBeNull();
    expect(toCatalogueNode({ id: null, description: "No id" }, 6000)).toBeNull();
  });
});

describe("repair search ranking", () => {
  // matchRank takes an already-lowercased query — searchRepairCatalogue does
  // that once per search rather than once per node.
  const rank = (description: string, query: string) => {
    const needle = query.toLowerCase();
    return matchRank(description, needle, needle.split(/\s+/).filter(Boolean));
  };

  it("promotes whole-name and prefix matches above scattered tokens", () => {
    expect(rank("Brake pads", "brake pads")).toBe(0); // starts with
    expect(rank("Renew the front brake pads", "brake pads")).toBe(1); // contains
    expect(rank("Renew the brake caliper and pads", "brake pads")).toBe(2); // all tokens
  });

  it("requires every token, in any order, and ignores case on both sides", () => {
    expect(rank("Renew the brake caliper and pads", "PADS Brake")).toBe(2);
    expect(rank("Renew the front brake discs", "brake pads")).toBeNull();
    expect(rank("Renew the air filter", "brake")).toBeNull();
  });

  it("scores group affinity by how many tokens the group name carries", () => {
    // This is what makes the walk best-first rather than breadth-first: the
    // path to a matching leaf is itself named for the query.
    expect(affinityFor("Brake pads", ["brake", "pads"])).toBe(2);
    expect(affinityFor("Brakes (Mechanical)", ["brake", "pads"])).toBe(1);
    expect(affinityFor("Cooling system", ["brake", "pads"])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Manual vehicle selection (Task 20). Node shapes below are copied verbatim
// from live replies captured on 2026-09-01.
// ---------------------------------------------------------------------------

describe("picker node flattening", () => {
  it("keeps a make to id + name", () => {
    expect(toPickerMake({ id: 270, level: "MAKE", name: "FORD", fullName: "FORD" })).toEqual({
      id: 270,
      name: "FORD",
    });
  });

  it("keeps a model's production years — customers pick by shape-and-era", () => {
    // FORD lists four vehicles called "Ranger"; the years are how they differ.
    expect(
      toPickerModel({
        id: 102000254,
        level: "MODEL",
        name: "Ranger",
        fullName: "FORD Ranger",
        madeFrom: "2011",
        madeUntil: "2023",
        image: "https://www.haynespro-assets.com/workshop/images/319045505.svgz",
      }),
    ).toEqual({
      id: 102000254,
      name: "Ranger",
      madeFrom: "2011",
      madeUntil: "2023",
      image: "https://www.haynespro-assets.com/workshop/images/319045505.svgz",
    });
  });

  it("sends a type's power as BOTH kW and bhp, never one unlabelled number", () => {
    expect(
      toPickerType({
        id: 619117140,
        level: "TYPE",
        name: "2.0 EcoBlue",
        fullName: "FORD Ranger 2.0 EcoBlue",
        madeFrom: "2023",
        madeUntil: null,
        engineCode: "YN2R",
        fuelType: ["DIESEL"],
        capacity: 1995,
        output: 155,
      }),
    ).toEqual({
      id: 619117140,
      name: "2.0 EcoBlue",
      fullName: "FORD Ranger 2.0 EcoBlue",
      engineCode: "YN2R",
      fuelType: "DIESEL",
      capacity: 1995,
      outputKw: 155,
      outputBhp: 208,
      madeFrom: "2023",
      madeUntil: null,
    });
  });

  it("reports an EV's capacity as null, not 0 cc", () => {
    const ev = toPickerType({
      id: 619017105,
      level: "TYPE",
      name: "Long Range",
      fullName: "TESLA Model 3 Long Range",
      capacity: 0,
      output: 211,
      fuelType: ["ELECTRICAL"],
    });
    expect(ev?.capacity).toBeNull();
    expect(ev?.outputKw).toBe(211);
    expect(ev?.outputBhp).toBe(283); // and NOT 211 — the kW/bhp trap
  });

  it("drops nodes with no id — including HaynesPro's 'Vehicle not found' node", () => {
    // An unknown id comes back at HTTP 200 as an all-null node with
    // status.statusCode 6, so a null id is the miss.
    expect(toPickerMake({ id: null, name: null })).toBeNull();
    expect(toPickerModel({ id: null, name: null })).toBeNull();
    expect(toPickerType({ id: null, name: null })).toBeNull();
  });

  it("flattens fuelType from either wire shape", () => {
    expect(flattenFuelType("DIESEL")).toBe("DIESEL");
    expect(flattenFuelType(["DIESEL"])).toBe("DIESEL");
    expect(flattenFuelType(["PETROL", "ELECTRIC"])).toBe("PETROL / ELECTRIC");
    expect(flattenFuelType(null)).toBeNull();
    expect(flattenFuelType([])).toBeNull();
  });

  it("treats a missing or zero output as no figure at all", () => {
    expect(kwToBhp(null)).toBeNull();
    expect(kwToBhp(0)).toBeNull();
  });
});

describe("makesMatch — the guard on a shared, unscoped price", () => {
  it("permits any variant of the make DVLA holds", () => {
    // The whole point: the variant is what's ambiguous, so a Ranger may be
    // repointed at any other Ford.
    expect(makesMatch("FORD", "FORD")).toBe(true);
    expect(makesMatch("ford", "FORD")).toBe(true);
  });

  it("refuses a different make — the attack this exists to stop", () => {
    expect(makesMatch("FORD", "PORSCHE")).toBe(false);
    expect(makesMatch("VOLKSWAGEN", "VOLVO")).toBe(false);
    expect(makesMatch("ALPINA", "ALPINE")).toBe(false);
  });

  it("survives the two sources spelling one manufacturer differently", () => {
    expect(makesMatch("MG MOTOR UK LTD", "MG")).toBe(true);
    expect(makesMatch("GREAT WALL", "GREAT WALL (GWM)")).toBe(true);
    expect(makesMatch("DS AUTOMOBILES", "DS")).toBe(true);
    expect(makesMatch("LAND ROVER", "LAND ROVER")).toBe(true);
    expect(makesMatch("CITROËN", "CITROEN")).toBe(true);
    expect(makesMatch("ŠKODA", "SKODA")).toBe(true);
    expect(makesMatch("VW", "VOLKSWAGEN")).toBe(true);
    expect(makesMatch("MERCEDES", "MERCEDES-BENZ")).toBe(true);
  });

  it("refuses when either side is missing — an unguarded write is the refusal", () => {
    expect(makesMatch(null, "FORD")).toBe(false);
    expect(makesMatch("FORD", null)).toBe(false);
    expect(makesMatch("", "")).toBe(false);
  });
});
