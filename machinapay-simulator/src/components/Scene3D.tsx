import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Grid, MeshReflectorMaterial, Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Position, RobotState, TaskType } from "../integration/protocol";
import { JCBModel } from "./JCBModel";
import { mapJobToWorld } from "../state/sceneMapping";
import { getTaskConfig } from "../state/taskConfig";

function ZoneMarker({
  position,
  color,
  label,
  pulse,
  scale = 1,
}: {
  position: [number, number];
  color: string;
  label: string;
  pulse?: boolean;
  scale?: number;
}) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ring.current && pulse) {
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.08;
      ring.current.scale.set(s, s, 1);
    }
  });
  return (
    <group position={[position[0], 0.02, position[1]]} scale={scale}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.3, 1.3]} />
        <meshStandardMaterial color={color} transparent opacity={0.18} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.62, 0.7, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} transparent opacity={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.86, 0.88, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} transparent opacity={0.35} />
      </mesh>
      <Suspense fallback={null}>
        <TextLabel text={label} color={color} />
      </Suspense>
    </group>
  );
}

// Lightweight canvas-texture label so we avoid pulling in an extra font-loading dependency.
function TextLabel({ text, color }: { text: string; color: string }) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  // Longer zone labels (e.g. "MATERIAL PILE") need a smaller size to stay
  // inside the canvas without clipping — shorter ones (e.g. "TARGET") keep
  // the original larger size for legibility.
  const fontSize = text.length > 9 ? 22 : text.length > 6 ? 26 : 30;
  ctx.font = `600 ${fontSize}px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  return (
    <sprite position={[0, 0.02, 0.95]} scale={[1.4, 0.35, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function RewardPopup({ visible, reward, position }: { visible: boolean; reward: string; position: [number, number] }) {
  const group = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);

  const texture = useRef<THREE.CanvasTexture | null>(null);
  if (!texture.current) {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 90;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "700 46px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "#3adb76";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`+${reward} MST`, 160, 45);
    texture.current = new THREE.CanvasTexture(canvas);
  }

  useFrame(() => {
    if (!group.current) return;
    if (visible && startedAt.current === null) startedAt.current = performance.now();
    if (!visible) {
      startedAt.current = null;
      group.current.visible = false;
      return;
    }
    const elapsed = (performance.now() - (startedAt.current ?? performance.now())) / 1000;
    group.current.visible = elapsed < 2.4;
    group.current.position.set(position[0], 1.1 + elapsed * 0.5, position[1]);
    const sprite = group.current.children[0] as THREE.Sprite | undefined;
    const mat = sprite?.material as THREE.SpriteMaterial | undefined;
    if (mat) mat.opacity = Math.max(0, 1 - elapsed / 2.4);
  });

  return (
    <group ref={group} visible={false}>
      <sprite scale={[1.8, 0.5, 1]}>
        <spriteMaterial map={texture.current} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

function Barrier({ position }: { position: [number, number, number] }) {
  return (
    <mesh castShadow position={position}>
      <coneGeometry args={[0.14, 0.34, 8]} />
      <meshStandardMaterial color="#FF6A2B" roughness={0.5} />
    </mesh>
  );
}

function CinematicRig() {
  // Auto-rotate is permanently off — it must never move the camera out from
  // under the judge, during a job or at IDLE. Mouse/touch mapping is spelled
  // out explicitly rather than relying on OrbitControls' defaults.
  return (
    <OrbitControls
      enableRotate
      enablePan
      enableZoom
      enableDamping
      autoRotate={false}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      minDistance={11}
      maxDistance={24}
      maxPolarAngle={Math.PI / 2.15}
      target={[0, 0.6, 0]}
    />
  );
}

export function Scene3D({
  state,
  phaseProgress,
  reward,
  source,
  target,
  taskType,
  isPaid,
}: {
  state: RobotState;
  phaseProgress: number;
  reward: string;
  source?: Position;
  target?: Position;
  taskType?: TaskType | null;
  isPaid?: boolean;
}) {
  const driving = state === "MOVING_TO_OBJECT" || state === "MOVING_TO_TARGET";
  const { sourceWorld, targetWorld } = mapJobToWorld(source, target);
  const { sourceZoneLabel, targetZoneLabel } = getTaskConfig(taskType ?? undefined);

  return (
    <Canvas shadows camera={{ position: [2, 7.5, 13], fov: 50 }}>
      <color attach="background" args={["#0B0D11"]} />
      <fog attach="fog" args={["#0B0D11", 17, 36]} />

      <ambientLight intensity={0.5} />
      <directionalLight
        castShadow
        position={[6, 8, 3]}
        intensity={1.5}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <directionalLight position={[-6, 4, -4]} intensity={0.3} color="#3DDC97" />
      <pointLight position={[0, 3, 0]} intensity={0.4} color="#F5A623" distance={9} />

      {/* Reflective ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <MeshReflectorMaterial
          blur={[300, 80]}
          resolution={1024}
          mixBlur={1}
          mixStrength={22}
          roughness={0.92}
          depthScale={1}
          minDepthThreshold={0.85}
          color="#14171d"
          metalness={0.35}
          mirror={0}
        />
      </mesh>

      <Grid
        position={[0, 0.006, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#262B33"
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor="#3a4250"
        fadeDistance={22}
        infiniteGrid
      />

      <ZoneMarker position={sourceWorld} color="#F5A623" label={sourceZoneLabel} />
      <ZoneMarker
        position={targetWorld}
        color="#3ADB76"
        label={targetZoneLabel}
        pulse={state === "COMPLETED" || state === "MOVING_TO_TARGET"}
        scale={taskType === "LOAD_AND_DUMP" ? 1.4 : 1}
      />

      <RewardPopup visible={isPaid ?? (state === "COMPLETED")} reward={reward} position={targetWorld} />

      <Barrier position={[-4.9, 0.17, 2.4]} />
      <Barrier position={[-4.9, 0.17, -2.4]} />
      <Barrier position={[5.0, 0.17, 2.6]} />

      <JCBModel
        state={state}
        phaseProgress={phaseProgress}
        sourceXZ={sourceWorld}
        targetXZ={targetWorld}
        taskType={taskType ?? "MOVE_OBJECT"}
      />

      {driving && (
        <Sparkles count={40} scale={[3, 0.6, 3]} size={2} speed={0.4} opacity={0.35} color="#8a8f99" position={[0, 0.1, 0]} />
      )}

      <ContactShadows position={[0, 0.01, 0]} opacity={0.6} scale={20} blur={1.6} far={4} />

      <CinematicRig />

      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.25} intensity={0.65} mipmapBlur />
        <Vignette eskil={false} offset={0.15} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}
