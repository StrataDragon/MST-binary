import { Edges } from "@react-three/drei";
import type { TaskType } from "../integration/protocol";

/**
 * Task-specific payload geometry, used for BOTH the resting object (on the
 * ground at the source/target zone) and the carried object (parented inside
 * the bucket — see JCBModel). Every variant is centered on its own local
 * origin so the caller can re-parent it anywhere without per-task position
 * math living here.
 *
 * Each task gets a genuinely different low-poly shape — not the same box
 * recolored — so "MOVE_OBJECT vs PICK_AND_PLACE vs LOAD_AND_DUMP vs
 * DELIVERY" reads as four different kinds of job:
 *   MOVE_OBJECT     — wooden pallet crate (slats + corner brackets)
 *   PICK_AND_PLACE  — cylindrical steel drum/barrel (rim + bands)
 *   LOAD_AND_DUMP   — loose mound of rock/gravel pieces
 *   DELIVERY        — taped cardboard parcel with a shipping label
 */
export function TaskPayload({ taskType }: { taskType: TaskType }) {
  switch (taskType) {
    case "PICK_AND_PLACE":
      return <SteelBarrelPayload />;
    case "LOAD_AND_DUMP":
      return <PilePayload />;
    case "DELIVERY":
      return <PackagePayload />;
    case "MOVE_OBJECT":
    default:
      return <WoodenCratePayload />;
  }
}

/** Ground clearance for the RESTING copy of each payload — tuned per shape
 * so nothing floats or sinks into the floor despite differing sizes. */
export const PAYLOAD_REST_Y: Record<TaskType, number> = {
  MOVE_OBJECT: 0.21,
  PICK_AND_PLACE: 0.22,
  LOAD_AND_DUMP: 0.15,
  DELIVERY: 0.21,
};

const OUTLINE = "#FFF4D6";

/** MOVE_OBJECT — a wooden pallet crate: visible slats with darker gaps
 * between them, plus small metal corner brackets for an industrial feel. */
function WoodenCratePayload() {
  const plankY = [-0.13, -0.02, 0.09, 0.2];
  return (
    <group>
      {/* Darker inner carcass, visible through the gaps between slats */}
      <mesh castShadow>
        <boxGeometry args={[0.38, 0.42, 0.38]} />
        <meshStandardMaterial color="#3E2A18" roughness={0.9} />
        <Edges color={OUTLINE} />
      </mesh>
      {/* Horizontal slats on the front and back faces */}
      {plankY.map((y, i) => (
        <group key={i}>
          <mesh castShadow position={[0, y, 0.192]}>
            <boxGeometry args={[0.4, 0.075, 0.02]} />
            <meshStandardMaterial color="#B5793A" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, y, -0.192]}>
            <boxGeometry args={[0.4, 0.075, 0.02]} />
            <meshStandardMaterial color="#B5793A" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* Metal corner brackets, top of the crate */}
      {[
        [0.185, 0.185],
        [0.185, -0.185],
        [-0.185, 0.185],
        [-0.185, -0.185],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.2, z]}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshStandardMaterial color="#9AA3AD" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** PICK_AND_PLACE — a cylindrical steel drum: rolled-edge rim at the top
 * and 2 raised bands around the body, distinctly not a box. */
function SteelBarrelPayload() {
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[0.16, 0.165, 0.42, 24]} />
        <meshStandardMaterial color="#7C8794" metalness={0.75} roughness={0.35} />
        <Edges color={OUTLINE} threshold={25} />
      </mesh>
      {/* Rim at the top */}
      <mesh castShadow position={[0, 0.205, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.162, 0.014, 8, 24]} />
        <meshStandardMaterial color="#AEB7C2" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Two structural bands around the body */}
      <mesh castShadow position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.163, 0.012, 8, 24]} />
        <meshStandardMaterial color="#5C646E" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.163, 0.012, 8, 24]} />
        <meshStandardMaterial color="#5C646E" metalness={0.7} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** LOAD_AND_DUMP — a small mound of loose material, so the pile / dump
 * zones read as bulk material rather than a single carried package. */
function PilePayload() {
  const pieces: { pos: [number, number, number]; scale: number }[] = [
    { pos: [0, 0.02, 0], scale: 1.0 },
    { pos: [0.14, -0.02, 0.08], scale: 0.72 },
    { pos: [-0.13, -0.02, 0.07], scale: 0.68 },
    { pos: [0.03, -0.01, -0.15], scale: 0.78 },
    { pos: [-0.11, 0.05, -0.05], scale: 0.58 },
    { pos: [0.11, 0.06, 0.01], scale: 0.52 },
  ];
  return (
    <group>
      {pieces.map((p, i) => (
        <mesh key={i} castShadow position={p.pos} scale={p.scale}>
          <icosahedronGeometry args={[0.14, 0]} />
          <meshStandardMaterial color="#8B7355" roughness={0.95} emissive="#8B7355" emissiveIntensity={0.06} />
          <Edges color={OUTLINE} threshold={20} />
        </mesh>
      ))}
    </group>
  );
}

/** DELIVERY — a taped parcel with a shipping label and a small barcode, so
 * it reads as "package to deliver" rather than "construction material". */
function PackagePayload() {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.38, 0.34, 0.38]} />
        <meshStandardMaterial color="#D2B48C" roughness={0.7} emissive="#D2B48C" emissiveIntensity={0.08} />
        <Edges color={OUTLINE} />
      </mesh>
      {/* Tape strip crossing the top */}
      <mesh position={[0, 0.171, 0]}>
        <boxGeometry args={[0.4, 0.01, 0.09]} />
        <meshStandardMaterial color="#F0EAD6" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.171, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.36, 0.01, 0.09]} />
        <meshStandardMaterial color="#F0EAD6" roughness={0.5} />
      </mesh>
      {/* Shipping label */}
      <mesh position={[0, 0.03, 0.191]}>
        <planeGeometry args={[0.16, 0.12]} />
        <meshStandardMaterial color="#F5F0E6" roughness={0.6} />
      </mesh>
      {/* Small barcode on the label */}
      {[-0.05, -0.03, -0.005, 0.015, 0.045, 0.06].map((x, i) => (
        <mesh key={i} position={[x, -0.005, 0.1925]}>
          <planeGeometry args={[i % 2 === 0 ? 0.008 : 0.004, 0.045]} />
          <meshStandardMaterial color="#2A2A2A" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}
