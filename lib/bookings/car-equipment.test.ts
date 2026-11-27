import { describe, expect, it } from "vitest";

import {
  answerOf,
  bookingEquipmentColumns,
  equipmentFromBody,
  equipmentFromParams,
  equipmentQuestionsForApp,
  mergeEquipment,
  readEquipmentAnswer,
} from "./car-equipment";
import { stepQuery } from "./step-params";
import { customerSaid, fitOptionsFooter, fitOptionsHeading, fitOptionsNote, readFitOptions } from "@/lib/parts/fit-options";

describe("air-con and stop-start answers (Task 87)", () => {
  it("reads funnel URL answers, Not sure included", () => {
    expect(readEquipmentAnswer("y")).toBe("y");
    expect(readEquipmentAnswer(" N ")).toBe("n");
    expect(readEquipmentAnswer("u")).toBe("u");
    expect(readEquipmentAnswer("yes")).toBeNull();
    expect(equipmentFromParams({ ac: "y", ss: "u" })).toEqual({ airCon: true, stopStart: null });
    expect(equipmentFromParams({})).toEqual({});
    expect(answerOf(true)).toBe("y");
    expect(answerOf(null)).toBe("u");
  });

  it("reads an app body, ignoring anything that isn't an answer", () => {
    expect(equipmentFromBody({ airCon: false, stopStart: null })).toEqual({ airCon: false, stopStart: null });
    expect(equipmentFromBody({ airCon: "yes", stopStart: 1 })).toEqual({});
    expect(equipmentFromBody(undefined)).toEqual({});
    expect(equipmentFromBody("air")).toEqual({});
  });

  it("lets an answer given now win over the saved car's, Not sure included", () => {
    const saved = { airCon: true, stopStart: false };
    expect(mergeEquipment({}, saved)).toEqual({ airCon: true, stopStart: false, electricHandbrake: null });
    expect(mergeEquipment({ airCon: null }, saved)).toEqual({ airCon: null, stopStart: false, electricHandbrake: null });
    expect(mergeEquipment({ electricHandbrake: false }, null)).toEqual({ airCon: null, stopStart: null, electricHandbrake: false });
  });

  it("writes only answered columns on the booking", () => {
    expect(bookingEquipmentColumns({ airCon: true, stopStart: null })).toEqual({ car_air_con: true });
    expect(bookingEquipmentColumns(undefined)).toEqual({});
  });

  it("carries the answers through the funnel's steps", () => {
    expect(stepQuery({ reg: "SW16PFD", repairs: ["a"], ac: "y", ss: "u", eh: "n" })).toBe("reg=SW16PFD&repairs=a&ac=y&ss=u&eh=n");
    expect(equipmentFromParams({ eh: "y" })).toEqual({ electricHandbrake: true });
    expect(equipmentFromBody({ electricHandbrake: null })).toEqual({ electricHandbrake: null });
    expect(bookingEquipmentColumns({ electricHandbrake: false })).toEqual({ car_electric_handbrake: false });
    expect(stepQuery({ reg: "SW16PFD", repairs: ["a"] })).toBe("reg=SW16PFD&repairs=a");
  });

  it("words the questions for the app", () => {
    expect(equipmentQuestionsForApp(["air_con"])).toEqual([
      {
        key: "air_con",
        question: "Does your car have air conditioning?",
        why: "It changes which part your car needs. If you're not sure, your mechanic will check.",
      },
    ]);
  });
});

describe("the mechanic's view of a part's versions (Task 87)", () => {
  const stored = {
    dependsOn: ["air_con"],
    options: [
      { supplier: "aag", partNumber: "GAT5PK1680", brand: "GATES", description: "BELT", for: { air_con: true }, label: "With air-con" },
      { supplier: "aag", partNumber: "GAT5PK1650", brand: "GATES", description: "BELT", for: { air_con: false }, label: "Without air-con" },
    ],
  };

  it("reads what booking_parts stores, and nothing else", () => {
    expect(readFitOptions(stored)?.options.map((o) => o.partNumber)).toEqual(["GAT5PK1680", "GAT5PK1650"]);
    expect(readFitOptions(null)).toBeNull();
    expect(readFitOptions({ dependsOn: ["colour"], options: stored.options })).toBeNull();
    expect(readFitOptions({ ...stored, options: [stored.options[0]] })).toBeNull();
  });

  it("says what to check, or what the customer said", () => {
    const unknown = readFitOptions(stored)!;
    expect(fitOptionsHeading(unknown)).toBe("Check air-con before buying: we don't know which this car has.");
    expect(customerSaid(unknown)).toBeNull();
    const answered = readFitOptions({ ...stored, answered: { air_con: false } })!;
    expect(fitOptionsHeading(answered)).toBe("The customer said the car doesn't have air-con. If not, buy the other version.");
    expect(fitOptionsNote(unknown)).toBe("check air-con: With air-con GAT5PK1680 / Without air-con GAT5PK1650");
    expect(fitOptionsFooter(unknown)).toBe("Ask the customer in the chat, or check on arrival.");
    expect(fitOptionsFooter(answered)).toBeNull();
  });

  it("reads a car-detail split, for the mechanic to check at the car", () => {
    const car = readFitOptions({
      dependsOn: ["car"],
      options: [
        { supplier: "aag", partNumber: "BREP30051", brand: "BREMBO", description: "PAD", for: {}, label: "Without Elec. H/B" },
        { supplier: "aag", partNumber: "BREP30067", brand: "BREMBO", description: "PAD", for: {}, label: "With Elec. H/B" },
      ],
    })!;
    expect(fitOptionsHeading(car)).toBe("Check which version fits this car before buying: NAPA lists more than one.");
    expect(fitOptionsFooter(car)).toBe("Check the car on arrival before fitting.");
    expect(fitOptionsNote(car)).toBe("check which fits: Without Elec. H/B BREP30051 / With Elec. H/B BREP30067");
  });
});
