/**
 * MachinaPay — Pure Dynamic Pricing Engine
 * ----------------------------------------
 * Protocol fact: The smart contracts have NO pricing logic.
 * Pricing is computed in the frontend and becomes msg.value in JobEscrow.createJob().
 */

// Named thresholds & rate constants (scaled for realistic testnet balances)
export const TRANSPORT_BASE_PRICE = 1.0;
export const TRANSPORT_KM_RATE = 0.05;
export const TRANSPORT_KG_RATE = 0.02;

export const SORTING_BASE_PRICE = 1.0;
export const SORTING_PER_OBJECT_RATE = 0.005;
export const SORTING_PER_COLOR_RATE = 0.05;
export const SORTING_ACCURACY_THRESHOLD = 95;
export const SORTING_ACCURACY_SURCHARGE = 0.1;

export const URGENCY_STANDARD_FEE = 0;
export const URGENCY_PRIORITY_FEE = 0.1;
export const URGENCY_URGENT_FEE = 0.2;

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
  const demandCost =
    inputs.openJobsCount !== undefined ? Math.round(inputs.openJobsCount * 0.01 * 100) / 100 : 0.05;

  // Availability surcharge = based on active, non-busy machines
  let availabilityCost = 0.05;
  if (inputs.availableMachinesCount !== undefined) {
    if (inputs.availableMachinesCount >= 3) availabilityCost = 0;
    else if (inputs.availableMachinesCount === 2) availabilityCost = 0.02;
    else availabilityCost = 0.05;
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

  // Demand surcharge = number of open jobs
  const demandCost =
    inputs.openJobsCount !== undefined ? Math.round(inputs.openJobsCount * 0.01 * 100) / 100 : 0.05;

  // Availability surcharge
  let availabilityCost = 0.05;
  if (inputs.availableMachinesCount !== undefined) {
    if (inputs.availableMachinesCount >= 3) availabilityCost = 0;
    else if (inputs.availableMachinesCount === 2) availabilityCost = 0.02;
    else availabilityCost = 0.05;
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
