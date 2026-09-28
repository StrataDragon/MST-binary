import React, { useState } from "react";
import { Download, Star, AlertCircle, ShieldCheck, CheckCircle2 } from "lucide-react";

interface SettlementStrategy {
  title: string;
  badge?: { text: string; type: "best" | "worst" };
  values: number[]; // 6 values between 0.3 and 1.0 for the 6 axes
  metrics: { label: string; val: string }[];
  efficacy: number;
  color: string;
  accentClass: string;
}

export function SettlementTestingView() {
  const axes = [
    "Speed",
    "Gas Efficiency",
    "Dispute Resistance",
    "Trust Score",
    "Cost",
    "Reliability",
  ];

  const strategies: SettlementStrategy[] = [
    {
      title: "INSTANT RELEASE",
      badge: { text: "Best", type: "best" },
      values: [0.95, 0.92, 0.88, 0.96, 0.9, 0.94],
      metrics: [
        { label: "Avg Time", val: "1.2s" },
        { label: "Gas Used", val: "21k" },
        { label: "Success Rate", val: "99.8%" },
        { label: "Dispute Rate", val: "0.2%" },
      ],
      efficacy: 98,
      color: "#22C55E", // green
      accentClass: "bg-accent-green",
    },
    {
      title: "MILESTONE HOLD",
      values: [0.75, 0.82, 0.95, 0.88, 0.7, 0.92],
      metrics: [
        { label: "Avg Time", val: "8.5s" },
        { label: "Gas Used", val: "48k" },
        { label: "Success Rate", val: "99.1%" },
        { label: "Dispute Rate", val: "0.4%" },
      ],
      efficacy: 91,
      color: "#3B82F6", // blue
      accentClass: "bg-accent-blue",
    },
    {
      title: "DISPUTE ESCROW",
      values: [0.6, 0.7, 0.98, 0.85, 0.65, 0.88],
      metrics: [
        { label: "Avg Time", val: "45.0s" },
        { label: "Gas Used", val: "72k" },
        { label: "Success Rate", val: "98.5%" },
        { label: "Dispute Rate", val: "0.8%" },
      ],
      efficacy: 91,
      color: "#F59E0B", // amber
      accentClass: "bg-accent-amber",
    },
    {
      title: "CUSTOM RETRY",
      badge: { text: "Worst", type: "worst" },
      values: [0.45, 0.5, 0.6, 0.55, 0.45, 0.52],
      metrics: [
        { label: "Avg Time", val: "120s" },
        { label: "Gas Used", val: "105k" },
        { label: "Success Rate", val: "89.2%" },
        { label: "Dispute Rate", val: "4.8%" },
      ],
      efficacy: 82,
      color: "#EF4444", // red
      accentClass: "bg-accent-red",
    },
  ];

  // Helper to compute polygon points for a 6-axis radar
  function getRadarPoints(values: number[], radius: number, cx: number, cy: number): string {
    return values
      .map((val, i) => {
        const angle = (i * 60 - 90) * (Math.PI / 180);
        const r = val * radius;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  }

  // Trajectory hover state
  const [hoverDay, setHoverDay] = useState<number>(27);
  const days = Array.from({ length: 31 }, (_, i) => i);

  const instantCurve = days.map((d) => 98 - Math.sin(d / 6) * 1.5);
  const milestoneCurve = days.map((d) => 91 + Math.cos(d / 5) * 2);
  const disputeCurve = days.map((d) => 90 - d * 0.15 + Math.sin(d / 4) * 2);
  const customCurve = days.map((d) => 82 - d * 0.35 + Math.cos(d / 4) * 3);

  // SVG chart sizing
  const width = 680;
  const height = 160;
  const pL = 35;
  const pR = 15;
  const pT = 15;
  const pB = 25;
  const cW = width - pL - pR;
  const cH = height - pT - pB;

  function toSvgCoords(d: number, v: number) {
    const x = pL + (d / 30) * cW;
    const y = pT + cH - ((v - 70) / (100 - 70)) * cH;
    return { x, y };
  }

  function getPath(data: number[]) {
    return data
      .map((val, d) => {
        const pt = toSvgCoords(d, val);
        return `${d === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      })
      .join(" ");
  }

  const hoverX = pL + (hoverDay / 30) * cW;

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-primary tracking-tight">Settlement Testing Engine</h2>
          <p className="text-xs text-secondary">
            Comparative analysis of machine escrow settlement strategies · 30-day simulation horizon
          </p>
        </div>
        <button
          onClick={() => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(strategies, null, 2));
            const dl = document.createElement("a");
            dl.setAttribute("href", dataStr);
            dl.setAttribute("download", "settlement-testing-report.json");
            dl.click();
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-blue hover:bg-blue-600 text-white font-semibold text-xs transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Comparison</span>
        </button>
      </div>

      {/* 4 Radar Cards in a Row (Matching SENTINEL Screenshot 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {strategies.map((strat, idx) => {
          const cx = 95;
          const cy = 72;
          const maxR = 46;

          return (
            <div
              key={idx}
              className="bg-card border border-border rounded-lg shadow-sm p-4 flex flex-col justify-between relative overflow-hidden"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-primary uppercase tracking-wider font-mono">
                  {strat.title}
                </span>
                {strat.badge && (
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border ${
                      strat.badge.type === "best"
                        ? "bg-green-50 text-accent-green border-green-200"
                        : "bg-red-50 text-accent-red border-red-200"
                    }`}
                  >
                    {strat.badge.type === "best" ? (
                      <Star className="w-2.5 h-2.5 fill-accent-green" />
                    ) : (
                      <AlertCircle className="w-2.5 h-2.5" />
                    )}
                    {strat.badge.text}
                  </span>
                )}
              </div>

              {/* Hexagonal Radar Spider Chart */}
              <div className="flex items-center justify-center my-2">
                <svg width="190" height="144" className="overflow-visible select-none">
                  {/* Concentric rings */}
                  {[0.33, 0.66, 1.0].map((ringLevel, rIdx) => {
                    const ringPoints = [0, 1, 2, 3, 4, 5]
                      .map((i) => {
                        const angle = (i * 60 - 90) * (Math.PI / 180);
                        const r = ringLevel * maxR;
                        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
                      })
                      .join(" ");
                    return (
                      <polygon key={rIdx} points={ringPoints} fill="none" stroke="#E5E7EB" strokeWidth="1" />
                    );
                  })}

                  {/* 6 radial axis lines */}
                  {[0, 1, 2, 3, 4, 5].map((i) => {
                    const angle = (i * 60 - 90) * (Math.PI / 180);
                    return (
                      <line
                        key={i}
                        x1={cx}
                        y1={cy}
                        x2={cx + maxR * Math.cos(angle)}
                        y2={cy + maxR * Math.sin(angle)}
                        stroke="#E5E7EB"
                        strokeWidth="1"
                      />
                    );
                  })}

                  {/* Labels */}
                  {axes.map((axis, i) => {
                    const angle = (i * 60 - 90) * (Math.PI / 180);
                    const labelR = maxR + 13;
                    const x = cx + labelR * Math.cos(angle);
                    const y = cy + labelR * Math.sin(angle) + 3;
                    return (
                      <text
                        key={i}
                        x={x}
                        y={y}
                        textAnchor="middle"
                        fill="#6B7280"
                        fontSize="6.5"
                        fontFamily="ui-sans-serif, system-ui"
                      >
                        {axis}
                      </text>
                    );
                  })}

                  {/* Polygon Data Fill */}
                  <polygon
                    points={getRadarPoints(strat.values, maxR, cx, cy)}
                    fill={strat.color}
                    fillOpacity="0.15"
                    stroke={strat.color}
                    strokeWidth="1.8"
                  />
                </svg>
              </div>

              {/* 2x2 Metric Grid */}
              <div className="grid grid-cols-2 gap-2 my-2 pt-2 border-t border-border text-[10px] font-mono">
                {strat.metrics.map((m, mIdx) => (
                  <div key={mIdx}>
                    <span className="text-secondary block">{m.label}</span>
                    <span className="text-primary font-bold">{m.val}</span>
                  </div>
                ))}
              </div>

              {/* Efficacy Progress */}
              <div className="pt-2 border-t border-border space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-secondary">Efficacy</span>
                  <span className="font-bold text-primary">{strat.efficacy}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-page overflow-hidden">
                  <div className={`h-full rounded-full ${strat.accentClass}`} style={{ width: `${strat.efficacy}%` }} />
                </div>
              </div>

              {/* Bottom solid colored accent underline */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ backgroundColor: strat.color }} />
            </div>
          );
        })}
      </div>

      {/* Trajectory Chart (SENTINEL Style) */}
      <div className="bg-card border border-border rounded-lg shadow-sm p-5 space-y-3 relative">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-bold text-primary tracking-wide">
              Settlement Reliability Comparison — 30-Day Trajectory
            </h3>
            <p className="text-xs text-secondary">
              Success and completion fidelity across simulated escrow policies.
            </p>
          </div>
        </div>

        {/* SVG Multi-Line Chart Canvas */}
        <div className="relative overflow-x-auto select-none pt-2">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-40 overflow-visible"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = e.clientX - rect.left;
              const ratio = (relX - (pL / width) * rect.width) / ((cW / width) * rect.width);
              const d = Math.max(0, Math.min(30, Math.round(ratio * 30)));
              setHoverDay(d);
            }}
          >
            {/* Horizontal grid lines */}
            {[70, 80, 90, 100].map((v) => {
              const y = pT + cH - ((v - 70) / (100 - 70)) * cH;
              return (
                <g key={v}>
                  <line x1={pL} y1={y} x2={pL + cW} y2={y} stroke="#E5E7EB" strokeWidth="1" />
                  <text x={pL - 8} y={y + 3} textAnchor="end" fill="#9CA3AF" fontSize="9" fontFamily="monospace">
                    {v}%
                  </text>
                </g>
              );
            })}

            {/* Day ticks */}
            {[0, 5, 10, 15, 20, 25, 30].map((d) => {
              const x = pL + (d / 30) * cW;
              return (
                <text key={d} x={x} y={height - 5} textAnchor="middle" fill="#9CA3AF" fontSize="9" fontFamily="monospace">
                  Day {d}
                </text>
              );
            })}

            {/* Trajectory Lines */}
            <path d={getPath(instantCurve)} fill="none" stroke="#22C55E" strokeWidth="2.2" />
            <path d={getPath(milestoneCurve)} fill="none" stroke="#3B82F6" strokeWidth="2" />
            <path d={getPath(disputeCurve)} fill="none" stroke="#F59E0B" strokeWidth="2" />
            <path d={getPath(customCurve)} fill="none" stroke="#EF4444" strokeWidth="2" />

            {/* Hover vertical line */}
            <line x1={hoverX} y1={pT} x2={hoverX} y2={pT + cH} stroke="#9CA3AF" strokeWidth="1" strokeDasharray="3 3" />

            {/* Hover points */}
            {[
              { val: instantCurve[hoverDay], color: "#22C55E" },
              { val: milestoneCurve[hoverDay], color: "#3B82F6" },
              { val: disputeCurve[hoverDay], color: "#F59E0B" },
              { val: customCurve[hoverDay], color: "#EF4444" },
            ].map((pt, i) => (
              <circle
                key={i}
                cx={hoverX}
                cy={toSvgCoords(hoverDay, pt.val).y}
                r="3.5"
                fill={pt.color}
                stroke="#FFFFFF"
                strokeWidth="1.5"
              />
            ))}
          </svg>

          {/* Floating Tooltip */}
          <div
            className="absolute z-20 pointer-events-none p-2.5 rounded-lg bg-[#111827] text-white text-[11px] font-mono shadow-xl space-y-1"
            style={{
              left: Math.min(Math.max(hoverX - 45, 15), cW - 75),
              top: 15,
            }}
          >
            <div className="font-bold border-b border-gray-700 pb-0.5 text-gray-300">Day {hoverDay}</div>
            <div className="flex justify-between gap-3 text-accent-green">
              <span>INSTANT:</span>
              <span className="font-bold">{instantCurve[hoverDay]?.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-3 text-accent-blue">
              <span>MILESTONE:</span>
              <span>{milestoneCurve[hoverDay]?.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-3 text-accent-amber">
              <span>DISPUTE:</span>
              <span>{disputeCurve[hoverDay]?.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-3 text-accent-red">
              <span>CUSTOM:</span>
              <span>{customCurve[hoverDay]?.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 pt-2 border-t border-border text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-accent-green font-semibold">
            <span className="w-2 h-2 rounded-full bg-accent-green" /> INSTANT RELEASE
          </span>
          <span className="flex items-center gap-1.5 text-accent-blue font-semibold">
            <span className="w-2 h-2 rounded-full bg-accent-blue" /> MILESTONE
          </span>
          <span className="flex items-center gap-1.5 text-accent-amber font-semibold">
            <span className="w-2 h-2 rounded-full bg-accent-amber" /> DISPUTE ESCROW
          </span>
          <span className="flex items-center gap-1.5 text-accent-red font-semibold">
            <span className="w-2 h-2 rounded-full bg-accent-red" /> CUSTOM RETRY
          </span>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-card border border-border rounded-lg shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-bold text-primary uppercase tracking-wider font-mono">
          Settlement Strategy Comparison Matrix
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-[11px] text-secondary uppercase">
                <th className="py-2.5 px-3">Strategy</th>
                <th className="py-2.5 px-3">Avg Settlement Time</th>
                <th className="py-2.5 px-3">Gas Used</th>
                <th className="py-2.5 px-3">Success Rate</th>
                <th className="py-2.5 px-3">Dispute Rate</th>
                <th className="py-2.5 px-3">Cost / Job</th>
                <th className="py-2.5 px-3 text-right">Robustness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr className="hover:bg-page transition-colors">
                <td className="py-3 px-3 font-bold text-accent-green">INSTANT RELEASE</td>
                <td className="py-3 px-3">1.2s</td>
                <td className="py-3 px-3">21,000 gas</td>
                <td className="py-3 px-3 font-semibold text-accent-green">99.8%</td>
                <td className="py-3 px-3 text-secondary">0.2%</td>
                <td className="py-3 px-3">0.0004 ETH</td>
                <td className="py-3 px-3 text-right">
                  <span className="pill-confirmed text-[10px] font-bold px-2 py-0.5 rounded-full">Best</span>
                </td>
              </tr>
              <tr className="hover:bg-page transition-colors">
                <td className="py-3 px-3 font-bold text-accent-blue">MILESTONE HOLD</td>
                <td className="py-3 px-3">8.5s</td>
                <td className="py-3 px-3">48,000 gas</td>
                <td className="py-3 px-3">99.1%</td>
                <td className="py-3 px-3 text-secondary">0.4%</td>
                <td className="py-3 px-3">0.0009 ETH</td>
                <td className="py-3 px-3 text-right text-secondary font-mono">#2</td>
              </tr>
              <tr className="hover:bg-page transition-colors">
                <td className="py-3 px-3 font-bold text-accent-amber">DISPUTE ESCROW</td>
                <td className="py-3 px-3">45.0s</td>
                <td className="py-3 px-3">72,000 gas</td>
                <td className="py-3 px-3">98.5%</td>
                <td className="py-3 px-3 text-secondary">0.8%</td>
                <td className="py-3 px-3">0.0014 ETH</td>
                <td className="py-3 px-3 text-right text-secondary font-mono">#3</td>
              </tr>
              <tr className="hover:bg-page transition-colors">
                <td className="py-3 px-3 font-bold text-accent-red">CUSTOM RETRY</td>
                <td className="py-3 px-3">120.0s</td>
                <td className="py-3 px-3">105,000 gas</td>
                <td className="py-3 px-3 text-accent-red">89.2%</td>
                <td className="py-3 px-3 text-accent-red font-semibold">4.8%</td>
                <td className="py-3 px-3">0.0021 ETH</td>
                <td className="py-3 px-3 text-right">
                  <span className="pill-failed text-[10px] font-bold px-2 py-0.5 rounded-full">Worst</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Sentinel-style Green Advisory Banner */}
        <div className="p-3 rounded-lg border border-green-200 bg-green-50 flex items-start gap-2.5 text-xs text-green-900 font-sans leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-accent-green flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold text-green-950">Recommended Strategy: INSTANT RELEASE</strong> — Dual EIP-712 cryptographic proofs eliminate dispute windows while reducing gas consumption by 62% compared to multi-milestone escrow holds.
          </div>
        </div>
      </div>
    </div>
  );
}
