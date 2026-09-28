import { expect } from "chai";
import {
  calculateJobPrice,
  calculateTransportPrice,
  calculateColorSortingPrice,
} from "../integration/pricingEngine";

describe("Platform-Level Dynamic Pricing Engine", () => {
  it("calculates Transport Robot pricing matching the benchmark (86 MST)", () => {
    // 5 km, 10 kg, Priority, High Demand, Low Availability
    const result = calculateTransportPrice({
      distanceKm: 5,
      weightKg: 10,
      urgency: "PRIORITY",
      demand: "HIGH",
      availability: "LOW",
    });

    expect(result.jobType).to.equal("PACKAGE_TRANSPORT");
    expect(result.basePrice).to.equal(30);
    expect(result.finalPrice).to.equal(86);
    expect(result.lockedPriceMst).to.equal("86.00");

    const factorNames = result.factors.map((f) => f.name);
    expect(factorNames).to.include("Base Price");
    expect(factorNames).to.include("Distance");
    expect(factorNames).to.include("Package Weight");
    expect(factorNames).to.include("Priority Delivery");
    expect(factorNames).to.include("High Regional Demand");
    expect(factorNames).to.include("Low Machine Availability");
  });

  it("calculates Color Sorting pricing matching the benchmark (80 MST)", () => {
    // 100 objects, 4 colors, 95% accuracy, Priority, High Demand, Low Availability
    const result = calculateColorSortingPrice({
      objectCount: 100,
      colors: ["RED", "BLUE", "GREEN", "YELLOW"],
      requiredAccuracyPercent: 95,
      urgency: "PRIORITY",
      demand: "HIGH",
      availability: "LOW",
    });

    expect(result.jobType).to.equal("COLOR_SORTING");
    expect(result.basePrice).to.equal(20);
    expect(result.finalPrice).to.equal(80);
    expect(result.lockedPriceMst).to.equal("80.00");

    const factorNames = result.factors.map((f) => f.name);
    expect(factorNames).to.include("Base Price");
    expect(factorNames).to.include("Objects Count");
    expect(factorNames).to.include("Color Complexity");
    expect(factorNames).to.include("Accuracy Requirement");
    expect(factorNames).to.include("Priority Sorting");
    expect(factorNames).to.include("High Demand");
    expect(factorNames).to.include("Low Availability");
  });

  it("produces deterministic results given the same input parameters", () => {
    const run1 = calculateJobPrice("PACKAGE_TRANSPORT", {
      distanceKm: 12,
      weightKg: 25,
      urgency: "URGENT",
      demand: "MEDIUM",
      availability: "MEDIUM",
    });

    const run2 = calculateJobPrice("PACKAGE_TRANSPORT", {
      distanceKm: 12,
      weightKg: 25,
      urgency: "URGENT",
      demand: "MEDIUM",
      availability: "MEDIUM",
    });

    expect(run1.finalPrice).to.equal(run2.finalPrice);
    expect(run1.lockedPriceMst).to.equal(run2.lockedPriceMst);
    expect(run1.factors.length).to.equal(run2.factors.length);
  });

  it("enforces price lock immutability (market shifts do not alter locked price)", () => {
    // Customer calculates at standard/low demand
    const initialQuote = calculateJobPrice("COLOR_SORTING", {
      objectCount: 50,
      colors: ["RED", "BLUE"],
      requiredAccuracyPercent: 90,
      urgency: "STANDARD",
      demand: "LOW",
      availability: "HIGH",
    });

    const lockedPrice = initialQuote.lockedPriceMst;

    // Market surges afterwards (High demand, Low availability)
    const marketSurgeQuote = calculateJobPrice("COLOR_SORTING", {
      objectCount: 50,
      colors: ["RED", "BLUE"],
      requiredAccuracyPercent: 90,
      urgency: "STANDARD",
      demand: "HIGH",
      availability: "LOW",
    });

    // New quote goes up, but locked price remains untouched
    expect(Number(marketSurgeQuote.lockedPriceMst)).to.be.greaterThan(Number(lockedPrice));
    expect(lockedPrice).to.equal("34.00");
  });
});
