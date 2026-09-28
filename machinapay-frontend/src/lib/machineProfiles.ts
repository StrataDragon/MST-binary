export interface MachineProfile {
  name: string;
  type: string;
  capability: string;
  jobType: "PACKAGE_TRANSPORT" | "COLOR_SORTING" | string;
  description: string;
  mission: string;
  tags: string[];
}

export const MACHINE_PROFILES: Record<string, MachineProfile> = {
  "M-042": {
    name: "Autonomous Transport Robot",
    type: "Ground Logistics AMR",
    capability: "Package Transportation",
    jobType: "PACKAGE_TRANSPORT",
    description: "Move packages autonomously from source to destination.",
    mission: "Move package from Point A → Point B",
    tags: ["Autonomous", "EIP-712 Proof", "GPS Telemetry"],
  },
  "M-051": {
    name: "Robotic Pick-and-Place Arm",
    type: "6-Axis Manipulator",
    capability: "Pick-and-Place Color Sorting",
    jobType: "COLOR_SORTING",
    description: "Pick objects and sort them into dedicated color bins.",
    mission: "Sort objects into color bins",
    tags: ["Optical Sensor", "Multi-Bin Sorting", "Telemetry Proof"],
  },
};

export function getMachineProfile(machineId: string): MachineProfile {
  return (
    MACHINE_PROFILES[machineId] || {
      name: machineId,
      type: "Autonomous Machine",
      capability: "Autonomous Task Execution",
      jobType: "GENERAL",
      description: `Registered autonomous hardware node ${machineId}.`,
      mission: `Execute verifiable work for ${machineId}`,
      tags: ["Autonomous", "On-Chain Staked"],
    }
  );
}
