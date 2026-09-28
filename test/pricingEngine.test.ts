import { expect } from "chai";
import {
  calculateJobPrice,
  calculateTransportPrice,
  calculateColorSortingPrice,
  calculateScaledTransportQuote,
  calculateScaledSortingQuote,
  parseNaturalLanguageJobRequest,
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

  describe("Section 6 Scaled Reference Benchmarks (Faucet Sizing)", () => {
    it("calculates Scaled Transport quote matching Section 6 reference (22 units -> 2.2 MSTC)", () => {
      // 10 + 4 + 2 + 3 + 1 + 2 = 22 units
      const quote = calculateScaledTransportQuote({
        distanceKm: 2,
        weightKg: 2,
        urgency: "URGENT",
        demandUnits: 1,
        availabilityUnits: 2,
      }, 0.1);

      expect(quote.totalUnits).to.equal(22);
      expect(quote.totalMst).to.equal("2.20");
      expect(quote.totalWei).to.equal(2200000000000000000n); // 2.2 ether in wei
      expect(Object.isFrozen(quote)).to.be.true;
    });

    it("calculates Scaled Sorting quote matching Section 6 reference (35 units -> 3.5 MSTC)", () => {
      // 20 + 8 + 4 + 1 + 0 + 1 + 1 = 35 units
      const quote = calculateScaledSortingQuote({
        objectCount: 100,
        colorCount: 4,
        accuracyPercent: 95,
        urgency: "STANDARD",
        demandUnits: 1,
        availabilityUnits: 1,
      }, 0.1);

      expect(quote.totalUnits).to.equal(35);
      expect(quote.totalMst).to.equal("3.50");
      expect(quote.totalWei).to.equal(3500000000000000000n); // 3.5 ether in wei
      expect(Object.isFrozen(quote)).to.be.true;
    });

    it("parses natural language requests deterministically into structured params", () => {
      const sortingReq = parseNaturalLanguageJobRequest("Sort 100 objects by color");
      expect(sortingReq).to.not.be.null;
      expect(sortingReq?.jobType).to.equal("COLOR_SORTING");
      expect(sortingReq?.params.objectCount).to.equal(100);

      const transportReq = parseNaturalLanguageJobRequest("Transport a 5kg package from Warehouse A to Warehouse B urgently");
      expect(transportReq).to.not.be.null;
      expect(transportReq?.jobType).to.equal("PACKAGE_TRANSPORT");
      expect(transportReq?.params.weightKg).to.equal(5);
      expect(transportReq?.params.urgency).to.equal("URGENT");
      expect(transportReq?.params.pickupLocation).to.equal("Warehouse A");
      expect(transportReq?.params.destination).to.equal("Warehouse B");
    });
  });
});
