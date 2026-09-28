import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RobotState, TaskType } from "../integration/protocol";
import { TaskPayload, PAYLOAD_REST_Y } from "./TaskPayload";

type Vec2 = [number, number];
type Vec3 = [number, number, number];

export type JCBModelProps = {
  state: RobotState;
  phaseProgress: number;
  sourceXZ: Vec2;
  targetXZ: Vec2;
  taskType: TaskType;
};

// ---------------------------------------------------------------------------
// Layout constants. The drive path is derived per-job from the actual
// source/target vector (see bodyTargetPos below), so the machine turns to
// face whichever direction that job's line actually runs in, rather than
// assuming every job lies on the same fixed line.
// ---------------------------------------------------------------------------

const PARK_DISTANCE = 2.2; // how far behind the source the machine idles
const APPROACH_OFFSET = 1.55; // how short of the object/target the chassis parks so the arm can reach it

const JCB_YELLOW = "#F5A623";
const JCB_YELLOW_DARK = "#C97F12";
const STEEL = "#2B3038";
const STEEL_LIGHT = "#454C57";
const STEEL_DARK = "#1B1F26";
const GLASS = "#8FD8E8";

// Arm joint layout, all in the PARENT's local space at rotation = 0. Because
// every segment is drawn as a Beam from (0,0,0) to the next joint's position,
// and every child pivot group is placed at that exact same point, the arm can
// never visually separate from its own joints no matter how it's posed.
const SHOULDER_LOCAL: Vec3 = [-0.9, 0.95, 0]; // where the boom mounts on the chassis
const ELBOW_LOCAL: Vec3 = [-1.15, 0.35, 0]; // elbow position, relative to the shoulder
const WRIST_LOCAL: Vec3 = [-0.95, -0.55, 0]; // wrist (bucket pivot), relative to the elbow
const BUCKET_CENTER_LOCAL: Vec3 = [-0.24, -0.13, 0]; // bucket body, relative to the wrist

// ---------------------------------------------------------------------------
// Per-task arm motion. All 4 task types share the same RobotState sequence
// (see robotStateMachine.ts), but the actual boom/dipper/bucket angles used
// while picking up, carrying, and dropping differ per task so a LOAD_AND_DUMP
// job visibly *scoops* material and *tilts the bucket to dump it*, rather
// than performing the same generic pick-and-release as every other job.
// ---------------------------------------------------------------------------
type ArmPose = { boom: number; dipper: number; bucket: number };
type ArmProfile = {
  /** Pose at p=0.5 of PICKING_OBJECT — the deepest reach into the object/pile. */
  pickMid: ArmPose;
  /** Pose at p=1 of PICKING_OBJECT, also used as the steady OBJECT_PICKED /
   * MOVING_TO_TARGET carry pose. */
  carry: ArmPose;
  /** Pose at p=0.5 of DROPPING_OBJECT — arm positioned over the target,
   * bucket about to open/tilt. */
  dropMid: ArmPose;
  /** Bucket angle at p=1 of DROPPING_OBJECT (boom/dipper hold at dropMid
   * while only the bucket keeps rotating) — this is the release/dump tilt. */
  dropEndBucket: number;
};

const DEFAULT_ARM_PROFILE: ArmProfile = {
  pickMid: { boom: 0.5, dipper: 0.75, bucket: -0.45 },
  carry: { boom: -0.25, dipper: 0.15, bucket: -1.0 },
  dropMid: { boom: 0.45, dipper: 0.7, bucket: -0.5 },
  dropEndBucket: 0.25,
};

const ARM_PROFILES: Record<TaskType, ArmProfile> = {
  MOVE_OBJECT: DEFAULT_ARM_PROFILE,
  // A careful clamp-and-place: barely opens the bucket at the end instead of
  // rolling it fully open, so the object reads as "set down", not "dropped".
  PICK_AND_PLACE: {
    ...DEFAULT_ARM_PROFILE,
    dropMid: { boom: 0.4, dipper: 0.78, bucket: -0.55 },
    dropEndBucket: 0.05,
  },
  // A gentler release than MOVE_OBJECT, befitting a package being placed at
  // a delivery point rather than tipped out.
  DELIVERY: { ...DEFAULT_ARM_PROFILE, dropEndBucket: 0.15 },
  // Scoops low and hard into the pile (deep dipper curl), carries with the
  // bucket held less tucked-in (a fuller load), then swings the bucket
  // through a large forward tilt to actually dump the material.
  LOAD_AND_DUMP: {
    pickMid: { boom: 0.3, dipper: 0.95, bucket: -0.85 },
    carry: { boom: -0.1, dipper: 0.3, bucket: -1.15 },
    dropMid: { boom: 0.62, dipper: 0.85, bucket: -0.55 },
    dropEndBucket: 1.0,
  },
};

function getArmProfile(taskType: TaskType): ArmProfile {
  return ARM_PROFILES[taskType] ?? DEFAULT_ARM_PROFILE;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}
function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

/**
 * The chassis' forward/arm side is local -X (see SHOULDER/ELBOW/WRIST above).
 * `unitDir` is the real, normalized source->target direction for this job.
 * The machine drives along that exact line and is yawed so its -X side
 * always faces forward along it — so the arm genuinely reaches toward
 * whatever the job is currently working on, in any direction.
 */
function bodyTargetPos(state: RobotState, progress: number, sourceXZ: Vec2, targetXZ: Vec2, unitDir: Vec2): Vec2 {
  const back = (p: Vec2, dist: number): Vec2 => [p[0] - unitDir[0] * dist, p[1] - unitDir[1] * dist];

  const parkPoint = back(sourceXZ, APPROACH_OFFSET + PARK_DISTANCE);
  const sourceApproach = back(sourceXZ, APPROACH_OFFSET);
  const targetApproach = back(targetXZ, APPROACH_OFFSET);

  switch (state) {
    case "IDLE":
    case "JOB_RECEIVED":
      return parkPoint;
    case "MOVING_TO_OBJECT":
      return lerpVec2(parkPoint, sourceApproach, progress);
    case "PICKING_OBJECT":
    case "OBJECT_PICKED":
      return sourceApproach;
    case "MOVING_TO_TARGET":
      return lerpVec2(sourceApproach, targetApproach, progress);
    case "DROPPING_OBJECT":
    case "COMPLETED":
      return targetApproach;
    case "FAILED":
      return lerpVec2(sourceApproach, targetApproach, progress);
    default:
      return parkPoint;
  }
}

/** A tread-lugged track: a beam plus a row of small cross-lugs for a convincing silhouette. */
function Track({ z }: { z: number }) {
  const lugCount = 9;
  const lugs = useMemo(() => Array.from({ length: lugCount }, (_, i) => i), []);
  return (
    <group position={[0, 0.22, z]}>
      <mesh castShadow>
        <boxGeometry args={[1.9, 0.34, 0.4]} />
        <meshStandardMaterial color={STEEL_DARK} roughness={0.7} />
      </mesh>
      {lugs.map((i) => (
        <mesh key={i} position={[-0.85 + (i * 1.9) / (lugCount - 1), -0.16, 0]} castShadow>
          <boxGeometry args={[0.14, 0.1, 0.44]} />
          <meshStandardMaterial color={STEEL} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A structural beam that always spans exactly from `from` to `to` in its
 * parent's local space. Used for every arm segment and hydraulic ram so a
 * segment can never visually drift away from the joint it's supposed to
 * connect to — the geometry is derived from the two points, not hand-tuned.
 */
function Beam({
  from,
  to,
  thickness = 0.22,
  color,
  metalness = 0.2,
  roughness = 0.4,
}: {
  from: Vec3;
  to: Vec3;
  thickness?: number;
  color: string;
  metalness?: number;
  roughness?: number;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { position: mid, quaternion: quat, length: len };
  }, [from, to]);

  return (
    <mesh position={position} quaternion={quaternion} castShadow>
      <boxGeometry args={[thickness, length, thickness * 0.85]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

/** Thin hydraulic ram: a cylinder body + a slightly recessed rod. Purely cosmetic. */
function HydraulicRam({ from, to, radius = 0.045 }: { from: Vec3; to: Vec3; radius?: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { position: mid, quaternion: quat, length: len };
  }, [from, to]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh castShadow>
        <cylinderGeometry args={[radius, radius, length, 10]} />
        <meshStandardMaterial color={STEEL_LIGHT} roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[radius * 0.55, radius * 0.55, length * 0.6, 8]} />
        <meshStandardMaterial color="#D8DCE2" roughness={0.2} metalness={0.8} />
      </mesh>
    </group>
  );
}

export function JCBModel({ state, phaseProgress, sourceXZ, targetXZ, taskType }: JCBModelProps) {
  const bodyGroup = useRef<THREE.Group>(null);
  const boomPivot = useRef<THREE.Group>(null);
  const dipperPivot = useRef<THREE.Group>(null);
  const bucketPivot = useRef<THREE.Group>(null);
  const objectRef = useRef<THREE.Group>(null);
  const carriedObjectRef = useRef<THREE.Group>(null);
  const cabRef = useRef<THREE.Group>(null);
  const headlightL = useRef<THREE.Mesh>(null);
  const headlightR = useRef<THREE.Mesh>(null);
  const ramBoomL = useRef<THREE.Group>(null);
  const ramBoomR = useRef<THREE.Group>(null);
  const ramDipper = useRef<THREE.Group>(null);

  // Smoothed values chased every frame, so animation stays buttery even if
  // React state updates arrive at an irregular cadence.
  const smoothed = useRef({ x: 0, z: 0, heading: 0, boom: 0, dipper: 0, bucket: 0, tilt: 0, initialized: false });

  useFrame((_, delta) => {
    const dampFast = 1 - Math.pow(0.0001, delta);
    const dampSlow = 1 - Math.pow(0.02, delta);

    const dx = targetXZ[0] - sourceXZ[0];
    const dz = targetXZ[1] - sourceXZ[1];
    const dist = Math.hypot(dx, dz);
    const unitDir: Vec2 = dist > 0.0001 ? [dx / dist, dz / dist] : [1, 0];
    // The chassis' forward/arm side is local -X, so to face `unitDir` in
    // world space the yaw is atan2(uz, -ux) — see bodyTargetPos's comment.
    const heading = Math.atan2(unitDir[1], -unitDir[0]);

    const [targetX, targetZ] = bodyTargetPos(state, phaseProgress, sourceXZ, targetXZ, unitDir);

    // Arm pose per state — these are ADDITIVE rotations applied on top of the
    // resting geometry defined by SHOULDER/ELBOW/WRIST_LOCAL above.
    let boomTarget = -0.1; // neutral, slightly raised while driving
    let dipperTarget = 0.15;
    let bucketTarget = 0.1;
    let tiltTarget = 0;

    const profile = getArmProfile(taskType);

    if (state === "PICKING_OBJECT") {
      const p = phaseProgress;
      if (p < 0.5) {
        boomTarget = lerp(-0.1, profile.pickMid.boom, clamp01(p / 0.5));
        dipperTarget = lerp(0.15, profile.pickMid.dipper, clamp01(p / 0.5));
        bucketTarget = lerp(0.1, profile.pickMid.bucket, clamp01(p / 0.5));
      } else {
        boomTarget = lerp(profile.pickMid.boom, profile.carry.boom, clamp01((p - 0.5) / 0.5));
        dipperTarget = lerp(profile.pickMid.dipper, profile.carry.dipper, clamp01((p - 0.5) / 0.5));
        bucketTarget = lerp(profile.pickMid.bucket, profile.carry.bucket, clamp01((p - 0.5) / 0.5));
      }
    } else if (state === "OBJECT_PICKED") {
      boomTarget = profile.carry.boom;
      dipperTarget = profile.carry.dipper;
      bucketTarget = profile.carry.bucket;
    } else if (state === "MOVING_TO_TARGET") {
      boomTarget = profile.carry.boom;
      dipperTarget = profile.carry.dipper;
      bucketTarget = profile.carry.bucket;
      tiltTarget = Math.sin(phaseProgress * Math.PI * 6) * 0.015;
    } else if (state === "DROPPING_OBJECT") {
      const p = phaseProgress;
      if (p < 0.5) {
        boomTarget = lerp(profile.carry.boom, profile.dropMid.boom, clamp01(p / 0.5));
        dipperTarget = lerp(profile.carry.dipper, profile.dropMid.dipper, clamp01(p / 0.5));
        bucketTarget = lerp(profile.carry.bucket, profile.dropMid.bucket, clamp01(p / 0.5));
      } else {
        boomTarget = profile.dropMid.boom;
        dipperTarget = profile.dropMid.dipper;
        bucketTarget = lerp(profile.dropMid.bucket, profile.dropEndBucket, clamp01((p - 0.5) / 0.5));
      }
    } else if (state === "FAILED") {
      boomTarget = 0.05;
      dipperTarget = 0.45;
      bucketTarget = -0.5;
    } else if (state === "MOVING_TO_OBJECT") {
      tiltTarget = Math.sin(phaseProgress * Math.PI * 8) * 0.02;
    }

    const s = smoothed.current;
    if (!s.initialized) {
      // Snap on the very first frame so the machine doesn't visibly slide in
      // from the world origin before settling into its real park position.
      s.x = targetX;
      s.z = targetZ;
      s.heading = heading;
      s.initialized = true;
    }
    s.x = lerp(s.x, targetX, dampSlow);
    s.z = lerp(s.z, targetZ, dampSlow);
    s.heading = lerp(s.heading, heading, dampSlow);
    s.boom = lerp(s.boom, boomTarget, dampFast);
    s.dipper = lerp(s.dipper, dipperTarget, dampFast);
    s.bucket = lerp(s.bucket, bucketTarget, dampFast);
    s.tilt = lerp(s.tilt, tiltTarget, dampFast);

    if (bodyGroup.current) {
      bodyGroup.current.position.x = s.x;
      bodyGroup.current.position.z = s.z;
      bodyGroup.current.rotation.y = s.heading;
      bodyGroup.current.rotation.z = s.tilt;
    }
    if (boomPivot.current) boomPivot.current.rotation.z = s.boom;
    if (dipperPivot.current) dipperPivot.current.rotation.z = s.dipper;
    if (bucketPivot.current) bucketPivot.current.rotation.z = s.bucket;

    const driving = state === "MOVING_TO_OBJECT" || state === "MOVING_TO_TARGET";

    // Headlights come on while driving.
    const lightOn = driving ? 1.6 : 0.05;
    if (headlightL.current) (headlightL.current.material as THREE.MeshStandardMaterial).emissiveIntensity = lightOn;
    if (headlightR.current) (headlightR.current.material as THREE.MeshStandardMaterial).emissiveIntensity = lightOn;

    // Cab bob for a touch of life when idle/receiving a job.
    if (cabRef.current) {
      const bob = state === "IDLE" ? 0 : Math.sin(performance.now() * 0.004) * 0.01;
      cabRef.current.position.y = 0.72 + bob;
    }

    // Hydraulic ram visual follow (rough kinematic approximation for looks only).
    if (ramBoomL.current) ramBoomL.current.rotation.z = -s.boom * 0.4;
    if (ramBoomR.current) ramBoomR.current.rotation.z = -s.boom * 0.4;
    if (ramDipper.current) ramDipper.current.rotation.z = -s.dipper * 0.25;

    // Object handling: while "attached", the package is a literal child of the
    // bucket group (see JSX below), so it is guaranteed to sit exactly inside
    // the bucket at all times, however the arm is currently posed. While not
    // attached, it's a free mesh resting at the source or target zone.
    const attached =
      (state === "PICKING_OBJECT" && phaseProgress >= 0.5) ||
      state === "OBJECT_PICKED" ||
      state === "MOVING_TO_TARGET" ||
      (state === "DROPPING_OBJECT" && phaseProgress < 0.55) ||
      state === "FAILED";

    if (carriedObjectRef.current) carriedObjectRef.current.visible = attached;

    if (objectRef.current) {
      objectRef.current.visible = !attached;
      if (!attached) {
        const restY = PAYLOAD_REST_Y[taskType];
        if (state === "DROPPING_OBJECT" || state === "COMPLETED") {
          let y = restY;
          if (taskType === "LOAD_AND_DUMP") {
            // Material visibly falls into the dump zone the moment it
            // leaves the bucket, rather than simply appearing at rest.
            const fallProgress =
              state === "COMPLETED" ? 1 : clamp01((phaseProgress - 0.55) / (0.82 - 0.55));
            const eased = 1 - (1 - fallProgress) * (1 - fallProgress); // ease-out
            y = lerp(restY + 0.5, restY, eased);
          }
          objectRef.current.position.set(targetXZ[0], y, targetXZ[1]);
        } else {
          objectRef.current.position.set(sourceXZ[0], restY, sourceXZ[1]);
        }
      }
    }
  });

  const teeth = useMemo(() => Array.from({ length: 4 }, (_, i) => i), []);

  return (
    <>
      <group ref={bodyGroup}>
        {/* Undercarriage / tracks */}
        <Track z={0.55} />
        <Track z={-0.55} />

        {/* Chassis */}
        <mesh castShadow position={[0, 0.55, 0]}>
          <boxGeometry args={[1.7, 0.32, 1.15]} />
          <meshStandardMaterial color={JCB_YELLOW_DARK} roughness={0.45} metalness={0.15} />
        </mesh>

        {/* Headlights */}
        <mesh ref={headlightL} position={[-1.55, 0.55, 0.42]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color="#FFF4D6" emissive="#FFF4D6" emissiveIntensity={0.05} />
        </mesh>
        <mesh ref={headlightR} position={[-1.55, 0.55, -0.42]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color="#FFF4D6" emissive="#FFF4D6" emissiveIntensity={0.05} />
        </mesh>

        {/* Cab */}
        <group ref={cabRef} position={[-0.25, 0.72, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.95, 0.62, 1.0]} />
            <meshStandardMaterial color={JCB_YELLOW} roughness={0.4} metalness={0.2} />
          </mesh>
          <mesh position={[0.02, 0.06, 0]}>
            <boxGeometry args={[0.8, 0.4, 0.86]} />
            <meshStandardMaterial color={GLASS} roughness={0.1} metalness={0.3} opacity={0.75} transparent />
          </mesh>
          {/* Wing mirrors */}
          <mesh position={[0.35, 0.15, 0.53]}>
            <boxGeometry args={[0.05, 0.12, 0.03]} />
            <meshStandardMaterial color={STEEL} />
          </mesh>
          <mesh position={[0.35, 0.15, -0.53]}>
            <boxGeometry args={[0.05, 0.12, 0.03]} />
            <meshStandardMaterial color={STEEL} />
          </mesh>
          {/* Beacon */}
          <mesh position={[-0.25, 0.42, 0]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial
              color="#FF7A33"
              emissive="#FF7A33"
              emissiveIntensity={state === "IDLE" ? 0.15 : 1.8}
            />
          </mesh>
        </group>

        {/* Exhaust stack */}
        <mesh castShadow position={[0.55, 0.92, 0.35]}>
          <cylinderGeometry args={[0.045, 0.055, 0.28, 10]} />
          <meshStandardMaterial color={STEEL} roughness={0.5} metalness={0.4} />
        </mesh>

        {/* Counterweight */}
        <mesh castShadow position={[0.85, 0.6, 0]}>
          <boxGeometry args={[0.32, 0.5, 1.05]} />
          <meshStandardMaterial color={STEEL_LIGHT} roughness={0.5} metalness={0.3} />
        </mesh>

        {/* ================================================================
            ARM: chassis -> shoulder(boom) -> elbow(dipper) -> wrist(bucket)
            Every segment is a Beam from (0,0,0) to the next joint's local
            position, and every child pivot is placed at that exact same
            point — so the arm is a real physically-connected kinematic
            chain, not independently positioned pieces.
        ================================================================= */}
        <group position={SHOULDER_LOCAL}>
          {/* Boom rams, anchored to the chassis, purely cosmetic */}
          <group ref={ramBoomL} position={[0.1, -0.2, 0.3]}>
            <HydraulicRam from={[0, 0, 0]} to={[ELBOW_LOCAL[0] * 0.55, ELBOW_LOCAL[1] * 0.55 + 0.1, 0]} />
          </group>
          <group ref={ramBoomR} position={[0.1, -0.2, -0.3]}>
            <HydraulicRam from={[0, 0, 0]} to={[ELBOW_LOCAL[0] * 0.55, ELBOW_LOCAL[1] * 0.55 + 0.1, 0]} />
          </group>

          <group ref={boomPivot}>
            {/* Boom: shoulder -> elbow */}
            <Beam from={[0, 0, 0]} to={ELBOW_LOCAL} thickness={0.24} color={JCB_YELLOW} />

            <group ref={ramDipper} position={[ELBOW_LOCAL[0] * 0.5, ELBOW_LOCAL[1] * 0.5 + 0.12, 0]}>
              <HydraulicRam from={[0, 0, 0]} to={[WRIST_LOCAL[0] * 0.5, WRIST_LOCAL[1] * 0.5, 0]} radius={0.04} />
            </group>

            <group ref={dipperPivot} position={ELBOW_LOCAL}>
              {/* Dipper (forearm): elbow -> wrist */}
              <Beam from={[0, 0, 0]} to={WRIST_LOCAL} thickness={0.19} color={JCB_YELLOW} />

              <group ref={bucketPivot} position={WRIST_LOCAL}>
                {/* Bucket, mounted directly at the wrist joint */}
                <mesh castShadow position={BUCKET_CENTER_LOCAL}>
                  <boxGeometry args={[0.4, 0.3, 0.55]} />
                  <meshStandardMaterial color={STEEL} roughness={0.6} metalness={0.4} />
                </mesh>
                {/* Bucket teeth */}
                {teeth.map((i) => (
                  <mesh
                    key={i}
                    position={[
                      BUCKET_CENTER_LOCAL[0] - 0.18,
                      BUCKET_CENTER_LOCAL[1] - 0.14,
                      -0.2 + i * (0.4 / (teeth.length - 1)),
                    ]}
                    castShadow
                  >
                    <coneGeometry args={[0.045, 0.14, 6]} />
                    <meshStandardMaterial color={STEEL_DARK} roughness={0.5} metalness={0.5} />
                  </mesh>
                ))}
                {/* Carried payload — a literal child of the bucket, so it is
                    physically guaranteed to sit exactly inside it no matter
                    how the arm is currently posed. Visibility toggled in
                    useFrame based on job phase. Geometry is task-specific
                    (see TaskPayload) so a LOAD_AND_DUMP job visibly carries
                    a pile of material rather than the same box every job. */}
                <group
                  ref={carriedObjectRef}
                  position={[BUCKET_CENTER_LOCAL[0], BUCKET_CENTER_LOCAL[1] + 0.2, BUCKET_CENTER_LOCAL[2]]}
                  visible={false}
                >
                  <TaskPayload taskType={taskType} />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* Resting payload on the ground — hidden while attached to the bucket. */}
      <group ref={objectRef} position={[sourceXZ[0], PAYLOAD_REST_Y[taskType], sourceXZ[1]]}>
        <TaskPayload taskType={taskType} />
      </group>
    </>
  );
}
