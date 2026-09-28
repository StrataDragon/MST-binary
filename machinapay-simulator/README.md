# MachinaPay — Remote Machine Simulator (Member 2)

This is the **robot/JCB simulator** for the MachinaPay Machine Job Marketplace
hackathon project. It is a standalone React + TypeScript + Three.js app that
runs on its **own laptop ("Laptop 2")**, connects to the backend over
WebSocket, and automatically executes `MOVE_OBJECT` jobs with no manual
interaction — proving the "action on Laptop 1 → automatic result on Laptop 2 →
automatic update back on Laptop 1" chain that the whole demo depends on.

It does **not** contain any blockchain, wallet, or payment logic. Its only job
is: **receive a job → execute it → produce a result → send the result.**

---

## 1. What's inside

- Full-bleed 3D scene (React Three Fiber + drei + postprocessing): a JCB-style
  excavator that drives to an object, picks it up, carries it to a green
  target zone, drops it, and reports success — or fails on command for
  testing the refund path.
- A clear state machine: `IDLE → JOB_RECEIVED → MOVING_TO_OBJECT →
  PICKING_OBJECT → OBJECT_PICKED → MOVING_TO_TARGET → DROPPING_OBJECT →
  COMPLETED` (or `FAILED`), each state visible in the HUD.
- A WebSocket client with **automatic reconnect** and a **mock mode** so you
  can build/demo this before Member 3's backend exists.
- `src/integration/protocol.ts` — the typed message contract Member 3 and
  Member 4 build against.

---

## 2. Running it on Laptop 2

```bash
npm install
cp .env.example .env
# edit .env — set VITE_SIMULATOR_WS_URL to the backend's LAN IP (see §4)
npm run dev
```

This starts a Vite dev server bound to `0.0.0.0:5174`, so it's reachable at
`http://<laptop-2-ip>:5174` from other machines on the same network — not just
`localhost`.

To test purely offline first (no backend needed at all), leave
`VITE_MOCK_MODE=true` in `.env`. Two buttons appear at the bottom of the
screen — **SEND TEST JOB** and **SEND FAILING JOB** — that simulate the
backend dispatching a job. These are dev-only affordances; when
`VITE_MOCK_MODE=false` they disappear entirely and the robot only reacts to
real WebSocket messages, exactly as the "no click on Laptop 2" requirement
demands.

## 3. Connecting Laptop 2 to the real backend

1. Find Laptop 2's IP address (`ipconfig` on Windows, `ifconfig` / `ip a` on
   macOS/Linux) — you'll want this so Laptop 1 / the backend can send events
   here if needed.
2. Find the **backend's** (Laptop 1 or wherever Member 3's server runs) IP
   address the same way.
3. In `.env` on Laptop 2, set:
   ```
   VITE_SIMULATOR_WS_URL=ws://<backend-ip>:<port>/ws
   VITE_MOCK_MODE=false
   ```
4. Make sure both laptops are on the **same Wi-Fi / hotspot**, and that the
   backend's port is not blocked by a firewall.
5. Restart `npm run dev` after editing `.env` (Vite only reads env files on
   startup).

You should see the header flip from `MOCK MODE` to `CONNECTING…` and then
`CONNECTED` once the backend accepts the socket. If it shows
`DISCONNECTED — RETRYING`, the simulator is auto-retrying every 2 seconds —
check the IP, port, and that the backend is actually listening.

## 4. Environment variables

See `.env.example` for the full list:

| Variable | Purpose |
|---|---|
| `VITE_MACHINE_ID` | This machine's identity (assigned by Member 1's registry), e.g. `M-042`. |
| `VITE_SIMULATOR_WS_URL` | WebSocket URL of the backend, e.g. `ws://192.168.1.10:3000/ws`. |
| `VITE_MOCK_MODE` | `true` to run fully offline with on-screen test buttons; `false` for the real backend. |
| `VITE_AUTO_RESET_DELAY_MS` | How long the COMPLETED/FAILED banner stays up before returning to IDLE. |
| `VITE_HEARTBEAT_INTERVAL_MS` | How often a `HEARTBEAT` message is sent while online. |

## 5. Protocol — what Member 3 needs to know

Full types live in `src/integration/protocol.ts`. Summary:

**Incoming (backend → simulator)**
- `START_JOB` — `{ type, jobId, machineId, taskType: "MOVE_OBJECT", reward?, source: {x,y}, target: {x,y}, simulateFailure? }`
- `CANCEL_JOB` — `{ type, jobId, machineId }`
- `RESET_MACHINE` — `{ type, machineId }`
- `PING` — `{ type }`

**Outgoing (simulator → backend)**
- `MACHINE_ONLINE` — sent once on connect
- `JOB_ACCEPTED` — sent immediately on receiving `START_JOB`
- `JOB_STARTED` — sent right after acceptance
- `ROBOT_STATE_CHANGED` — sent on every state transition, `{ jobId, machineId, state, timestamp }`
- `JOB_COMPLETED` — `{ jobId, machineId, status: "SUCCESS", taskType, sourcePosition, targetPosition, finalPosition, objectDelivered: true, completedAt }`
- `JOB_FAILED` — `{ jobId, machineId, status: "FAILED", reason, failedAt }`
- `HEARTBEAT` — sent every `VITE_HEARTBEAT_INTERVAL_MS`, `{ machineId, state, timestamp }`

To test the failure/refund path, send a `START_JOB` with
`"simulateFailure": true`. The robot will visibly start moving toward the
target, then stop and emit `JOB_FAILED` with `reason: "TARGET_NOT_REACHED"`.

Example real `START_JOB` frame the backend would send:

```json
{
  "type": "START_JOB",
  "jobId": "JOB-001",
  "machineId": "M-042",
  "taskType": "MOVE_OBJECT",
  "reward": "100",
  "source": { "x": 100, "y": 300 },
  "target": { "x": 600, "y": 300 }
}
```

## 6. Demo checklist

- [ ] `VITE_MOCK_MODE=false`, `.env` points at the real backend IP
- [ ] Both laptops on the same network, backend port reachable
- [ ] Header shows `CONNECTED`
- [ ] Laptop 1: create + fund a job → confirm the header here flips to
      `JOB RECEIVED` automatically, with no one touching this laptop
- [ ] Robot completes the full pick → move → drop sequence unattended
- [ ] `JOB_COMPLETED` appears in the backend logs / Laptop 1 UI
- [ ] Run one `simulateFailure` job beforehand to confirm the refund path
      works, then reset before the real demo run

## 7. Project structure

```
src/
  integration/
    protocol.ts       # shared message contract (read this first)
    mockBackend.ts     # offline stand-in used only when VITE_MOCK_MODE=true
  state/
    robotStateMachine.ts  # phase order, durations, the job "player"
  hooks/
    useMachineConnection.ts  # WebSocket/mock wiring + job lifecycle
  components/
    Scene3D.tsx        # environment, lighting, camera, zones, effects
    JCBModel.tsx        # the excavator rig + pick/drop/drive animation
    StatusHeader.tsx, JobPanel.tsx, TimelinePanel.tsx, ResultToast.tsx, MockControls.tsx
  App.tsx
```
