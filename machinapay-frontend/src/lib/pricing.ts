/**
 * MachinaPay — Pure Dynamic Pricing Engine
 * ----------------------------------------
 * Protocol fact: The smart contracts have NO pricing logic.
 * Pricing is computed in the frontend and becomes msg.value in JobEscrow.createJob().
 */

// Named thresholds & rate constants
export const TRANSPORT_BASE_PRICE = 30;
export const TRANSPORT_KM_RATE = 3;
export const TRANSPORT_KG_RATE = 1;

export const SORTING_BASE_PRICE = 20;
export const SORTING_PER_OBJECT_RATE = 0.20;
export const SORTING_PER_COLOR_RATE = 2;
export const SORTING_ACCURACY_THRESHOLD = 95;
export const SORTING_ACCURACY_SURCHARGE = 5;

export const URGENCY_STANDARD_FEE = 0;
export const URGENCY_PRIORITY_FEE = 10;
export const URGENCY_URGENT_FEE = 20;

export interface PriceFactor {
  label: string;
  amount: number;
}

export interface QuoteResult {
  total: number;
  factors: PriceFactor[];
}

export interface TransportInputs {
  distanceKm: number;
  weightKg: number;
  urgency: "STANDARD" | "PRIORITY" | "URGENT";
  openJobsCount?: number;
  availableMachinesCount?: number;
}

export interface SortingInputs {
  objectCount: number;
  colorCount: number;
  accuracyThreshold: number;
  urgency: "STANDARD" | "PRIORITY" | "URGENT";
  openJobsCount?: number;
  availableMachinesCount?: number;
}

/**
 * Pure function: calculates transport quote for M-042 (or any transport AMR).
 */
export function quoteTransport(inputs: TransportInputs): QuoteResult {
  const distanceKm = Math.max(0.1, Number(inputs.distanceKm) || 0);
  const weightKg = Math.max(0.1, Number(inputs.weightKg) || 0);

  const distanceCost = Math.round(distanceKm * TRANSPORT_KM_RATE * 100) / 100;
  const weightCost = Math.round(weightKg * TRANSPORT_KG_RATE * 100) / 100;

  const urgencyFee =
    inputs.urgency === "URGENT"
      ? URGENCY_URGENT_FEE
      : inputs.urgency === "PRIORITY"
      ? URGENCY_PRIORITY_FEE
      : URGENCY_STANDARD_FEE;

  // Demand surcharge = number of jobs currently FUNDED (open).
  // Default to 11 if not provided
  const demandCost =
    inputs.openJobsCount !== undefined ? Math.max(0, inputs.openJobsCount) : 11;

  // Availability surcharge = based on active, non-busy machines
  // Default to 10 if not provided (representing high fleet utilization)
  let availabilityCost = 10;
  if (inputs.availableMachinesCount !== undefined) {
    if (inputs.availableMachinesCount >= 3) availabilityCost = 0;
    else if (inputs.availableMachinesCount === 2) availabilityCost = 5;
    else availabilityCost = 10;
  }

  const factors: PriceFactor[] = [
    { label: "Base Mobilization", amount: TRANSPORT_BASE_PRICE },
    { label: `Distance (${distanceKm} km × ${TRANSPORT_KM_RATE})`, amount: distanceCost },
    { label: `Weight (${weightKg} kg × ${TRANSPORT_KG_RATE})`, amount: weightCost },
  ];

  if (urgencyFee > 0) {
    factors.push({ label: `${inputs.urgency} Urgency Fee`, amount: urgencyFee });
  }

  factors.push({ label: `Market Demand Surcharge (${demandCost} open jobs)`, amount: demandCost });
  factors.push({ label: "Fleet Availability Adjustment", amount: availabilityCost });

  const total = Math.round((TRANSPORT_BASE_PRICE + distanceCost + weightCost + urgencyFee + demandCost + availabilityCost) * 100) / 100;

  return { total, factors };
}

/**
 * Pure function: calculates color sorting quote for M-051 (or any sorting arm).
 */
export function quoteSorting(inputs: SortingInputs): QuoteResult {
  const objectCount = Math.max(1, Number(inputs.objectCount) || 0);
  const colorCount = Math.max(1, Number(inputs.colorCount) || 1);
  const accuracyThreshold = Number(inputs.accuracyThreshold) || 90;

  const objectCost = Math.round(objectCount * SORTING_PER_OBJECT_RATE * 100) / 100;
  const colorCost = Math.round(colorCount * SORTING_PER_COLOR_RATE * 100) / 100;

  const accuracySurcharge =
    accuracyThreshold >= SORTING_ACCURACY_THRESHOLD ? SORTING_ACCURACY_SURCHARGE : 0;

  const urgencyFee =
    inputs.urgency === "URGENT"
      ? URGENCY_URGENT_FEE
      : inputs.urgency === "PRIORITY"
      ? URGENCY_PRIORITY_FEE
      : URGENCY_STANDARD_FEE;

  // Demand surcharge = number of open jobs (defaults to 12)
  const demandCost =
    inputs.openJobsCount !== undefined ? Math.max(0, inputs.openJobsCount) : 12;

  // Availability surcharge (defaults to 5)
  let availabilityCost = 5;
  if (inputs.availableMachinesCount !== undefined) {
    if (inputs.availableMachinesCount >= 3) availabilityCost = 0;
    else if (inputs.availableMachinesCount === 2) availabilityCost = 3;
    else availabilityCost = 5;
  }

  const factors: PriceFactor[] = [
    { label: "Base Optical Setup", amount: SORTING_BASE_PRICE },
    { label: `Object Count (${objectCount} × ${SORTING_PER_OBJECT_RATE})`, amount: objectCost },
    { label: `Color Complexity (${colorCount} bins × ${SORTING_PER_COLOR_RATE})`, amount: colorCost },
  ];

  if (accuracySurcharge > 0) {
    factors.push({ label: `Accuracy SLA (≥${SORTING_ACCURACY_THRESHOLD}%)`, amount: accuracySurcharge });
  }

  if (urgencyFee > 0) {
    factors.push({ label: `${inputs.urgency} Urgency Fee`, amount: urgencyFee });
  }

  factors.push({ label: `Queue Demand Surcharge (${demandCost} open jobs)`, amount: demandCost });
  factors.push({ label: "Arm Availability Adjustment", amount: availabilityCost });

  const total = Math.round((SORTING_BASE_PRICE + objectCost + colorCost + accuracySurcharge + urgencyFee + demandCost + availabilityCost) * 100) / 100;

  return { total, factors };
}
