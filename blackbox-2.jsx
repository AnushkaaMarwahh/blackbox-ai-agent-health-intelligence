import { useState, useMemo, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const TREND_LABELS = [
  "Feb 17","Feb 24","Mar 3","Mar 10","Mar 17","Mar 24","Mar 31","Apr 7","Apr 14","Apr 21","Apr 28"
];

const WEEKS = [
  { label: "Apr 7 – 13", endIdx: 7 },
  { label: "Apr 14 – 20", endIdx: 8 },
  { label: "Apr 21 – 27", endIdx: 9 },
  { label: "Apr 28 – May 4", endIdx: 10 },
];

const COLORS = {
  bg: "#F3F4F6", surface: "#FFFFFF", border: "#E5E7EB", borderLight: "#F3F4F6",
  text: "#111827", textSecondary: "#6B7280", textTertiary: "#9CA3AF",
  accent: "#4F46E5", accentLight: "#EEF2FF", accentMid: "#C7D2FE",
  good: "#059669", goodBg: "#ECFDF5", goodBorder: "#A7F3D0",
  warn: "#D97706", warnBg: "#FFFBEB", warnBorder: "#FDE68A",
  bad: "#DC2626", badBg: "#FEF2F2", badBorder: "#FECACA",
};

const FONT = "'Outfit', system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";

// ═══════════════════════════════════════════════════════════════
// AGENT TREND DATA — dimension scores across 11 weeks
// ═══════════════════════════════════════════════════════════════

const AGENT_TRENDS = {
  "support-bot": {
    completion:   [92,91,90,88,86,84,82,78,74,70,64],
    satisfaction: [90,90,89,88,87,86,84,82,78,75,73],
    cost:         [88,88,88,87,87,86,86,86,85,84,82],
    compliance:   [91,90,89,87,85,83,80,78,73,68,65],
  },
  "knowledge": {
    completion:   [84,85,86,87,87,88,88,89,89,90,91],
    satisfaction: [82,83,84,85,85,86,86,87,88,89,90],
    cost:         [83,84,84,85,85,85,86,86,86,87,88],
    compliance:   [84,84,85,85,86,86,86,87,87,87,87],
  },
  "lead-qual": {
    completion:   [86,86,85,85,85,85,84,84,84,83,83],
    satisfaction: [82,82,82,81,80,80,79,79,78,77,76],
    cost:         [80,79,79,78,77,76,75,73,72,70,68],
    compliance:   [86,86,86,86,86,86,86,86,85,85,85],
  },
};

// ═══════════════════════════════════════════════════════════════
// AGENT META + WEEKLY DATA (issues, conversations)
// ═══════════════════════════════════════════════════════════════

const AGENTS_META = [
  {
    id: "support-bot", name: "Customer Support Bot", type: "Support",
    weekly: [
      { convTotal: 3100, convFailed: 124, costPer: 0.94, prevCostPer: 0.91,
        issues: [
          { id:"s0-1", severity:"low", title:"Average handle time increased slightly", metric:"Efficiency", impact:"+8%",
            detail:"Average conversation length increased from 4.2 to 4.5 turns. The agent is asking one additional clarifying question before routing. No impact on resolution rate.",
            affected:180, recommendation:"Monitor for one more week. If handle time continues rising without resolution improvement, review the clarifying question logic.", priority:"Low impact" }
        ]},
      { convTotal: 3200, convFailed: 192, costPer: 0.98, prevCostPer: 0.94,
        issues: [
          { id:"s1-1", severity:"medium", title:"Prompt update causing longer responses", metric:"Cost efficiency", impact:"+12%",
            detail:"The April 15 prompt update added detailed explanations to every response. While satisfaction held steady, token usage per conversation increased 12%. The agent now averages 340 tokens per response vs 290 previously.",
            affected:420, recommendation:"Trim the prompt to provide detailed explanations only when the user asks a follow-up question. Estimated token savings: 15% per conversation.", priority:"Medium impact" }
        ]},
      { convTotal: 3350, convFailed: 268, costPer: 1.08, prevCostPer: 0.98,
        issues: [
          { id:"s2-1", severity:"medium", title:"Resolution rate declining for billing topics", metric:"Resolution rate", impact:"-6%",
            detail:"Resolution rate for billing-related conversations dropped from 82% to 76%. The agent is providing outdated refund policy information in roughly 30% of billing conversations.",
            affected:134, recommendation:"Update the billing section of the knowledge base with the current refund policy. This should recover 4-5% of the resolution rate drop.", priority:"Medium impact" },
          { id:"s2-2", severity:"low", title:"Redundant API calls detected", metric:"Cost efficiency", impact:"+18%",
            detail:"The agent is calling the order lookup API twice per conversation in about 25% of cases. This appears to be a regression from the April 15 prompt update.",
            affected:210, recommendation:"Investigate the duplicate order lookup pattern. Likely fixable with a prompt adjustment or caching layer.", priority:"Low impact" }
        ]},
      { convTotal: 3420, convFailed: 312, costPer: 1.23, prevCostPer: 1.08,
        issues: [
          { id:"s3-1", severity:"high", title:"Billing dispute conversations failing at high rate", metric:"Resolution rate", impact:"-11%",
            detail:"47 failed conversations this week were about billing disputes. The agent returned incorrect refund policy information in 38 cases. Root cause: no knowledge article covers the updated billing dispute process introduced on April 28.",
            affected:47, recommendation:"Add billing dispute FAQ to the agent's knowledge base covering the updated process. Based on current failure volume, this should recover approximately 8% of the resolution rate drop.", priority:"High impact" },
          { id:"s3-2", severity:"medium", title:"Tool call count per conversation increasing", metric:"Cost efficiency", impact:"+25%",
            detail:"Average tool calls per conversation rose from 2.1 to 3.2 over the last 3 weeks. The agent is making redundant calls to the order lookup API, often querying the same order ID twice. This is inflating cost per resolution without improving outcomes.",
            affected:890, recommendation:"Investigate the prompt or logic causing duplicate order lookups. Likely a regression from the April 15 prompt update. Estimated savings: $340/week.", priority:"Medium impact" },
          { id:"s3-3", severity:"low", title:"Policy compliance violations detected", metric:"Compliance", impact:"2 violations",
            detail:"In 2 conversations, the agent recommended a competitor product when asked about unsupported features. This violates the competitive mention policy.",
            affected:2, recommendation:"Update the system prompt to prohibit competitor recommendations. Add a fallback response for unsupported features that redirects to the product roadmap.", priority:"Low impact" }
        ]},
    ]
  },
  {
    id: "knowledge", name: "Knowledge Assistant", type: "Internal",
    weekly: [
      { convTotal: 1150, convFailed: 58, costPer: 0.46, prevCostPer: 0.47, issues: [] },
      { convTotal: 1200, convFailed: 52, costPer: 0.45, prevCostPer: 0.46, issues: [] },
      { convTotal: 1240, convFailed: 48, costPer: 0.44, prevCostPer: 0.45,
        issues: [
          { id:"k2-1", severity:"low", title:"Onboarding queries slower than average", metric:"Satisfaction", impact:"-2%",
            detail:"Onboarding-related conversations take 11 seconds to resolve vs 4 seconds for other topics due to larger document retrieval set.",
            affected:28, recommendation:"Consider creating a dedicated onboarding knowledge subset for faster retrieval.", priority:"Low impact" }
        ]},
      { convTotal: 1280, convFailed: 45, costPer: 0.42, prevCostPer: 0.44,
        issues: [
          { id:"k3-1", severity:"low", title:"Onboarding-related queries have slower response times", metric:"Satisfaction", impact:"-3%",
            detail:"Conversations about employee onboarding take an average of 12 seconds to resolve vs 4 seconds for other topics. The agent retrieves from a larger document set for onboarding queries, increasing latency.",
            affected:34, recommendation:"Create a dedicated onboarding knowledge subset for faster retrieval. This would reduce response time for the 15% of conversations related to onboarding.", priority:"Low impact" }
        ]},
    ]
  },
  {
    id: "lead-qual", name: "Lead Qualifier", type: "Sales",
    weekly: [
      { convTotal: 580, convFailed: 52, costPer: 2.14, prevCostPer: 2.08, issues: [] },
      { convTotal: 600, convFailed: 66, costPer: 2.38, prevCostPer: 2.14,
        issues: [
          { id:"l1-1", severity:"low", title:"Cost per qualified lead increasing", metric:"Cost efficiency", impact:"+11%",
            detail:"Cost per qualified lead rose from $2.14 to $2.38. The agent began using the enrichment API on a broader set of leads after the April 10 deployment.",
            affected:600, recommendation:"Monitor for one more week and compare lead quality against the previous filtering approach.", priority:"Low impact" }
        ]},
      { convTotal: 610, convFailed: 79, costPer: 2.64, prevCostPer: 2.38,
        issues: [
          { id:"l2-1", severity:"medium", title:"Cost per qualified lead rising steadily", metric:"Cost efficiency", impact:"+23%",
            detail:"Cost per qualified lead rose from $2.38 to $2.64. The enrichment API is being called on all leads, including obviously unqualified ones based on initial form data.",
            affected:610, recommendation:"Restore the pre-qualification filter before API enrichment calls. Estimated savings: $280/week.", priority:"Medium impact" }
        ]},
      { convTotal: 620, convFailed: 89, costPer: 2.87, prevCostPer: 2.64,
        issues: [
          { id:"l3-1", severity:"medium", title:"Cost per qualified lead increased 34%", metric:"Cost efficiency", impact:"+34%",
            detail:"Cost per qualified lead rose from $2.14 to $2.87 over the past 4 weeks. The agent is using the enrichment API on all leads including those clearly unqualified based on initial form data. Previously, it applied basic filtering before calling the API.",
            affected:620, recommendation:"Restore the pre-qualification step before API enrichment calls. Likely removed in the April 10 deployment. Estimated savings: $420/week.", priority:"High impact" },
          { id:"l3-2", severity:"low", title:"Satisfaction declining on enterprise leads", metric:"Satisfaction", impact:"-5%",
            detail:"Enterprise-tier leads (company size 500+) report lower satisfaction. Qualification questions are calibrated for SMB use cases and feel generic to enterprise prospects. 12 negative feedback signals this week.",
            affected:12, recommendation:"Create a separate qualification flow for enterprise leads with industry-specific questions. Estimated lift: 4-6% satisfaction for enterprise segment.", priority:"Medium impact" }
        ]},
    ]
  },
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const calcHealth = (dims, w) => {
  const total = w.completion + w.satisfaction + w.cost + w.compliance;
  if (total === 0) return 0;
  return Math.round(
    (dims.completion * w.completion + dims.satisfaction * w.satisfaction +
     dims.cost * w.cost + dims.compliance * w.compliance) / total
  );
};

const getDims = (agentId, idx) => {
  const t = AGENT_TRENDS[agentId];
  return { completion: t.completion[idx], satisfaction: t.satisfaction[idx], cost: t.cost[idx], compliance: t.compliance[idx] };
};

const scoreColor = (s) => s >= 85 ? COLORS.good : s >= 75 ? COLORS.warn : COLORS.bad;
const scoreBg = (s) => s >= 85 ? COLORS.goodBg : s >= 75 ? COLORS.warnBg : COLORS.badBg;
const scoreBorder = (s) => s >= 85 ? COLORS.goodBorder : s >= 75 ? COLORS.warnBorder : COLORS.badBorder;

const statusOf = (score) => score >= 85 ? "healthy" : score >= 75 ? "watch" : "needs_attention";
const statusLabel = (s) => ({ healthy: "Healthy", watch: "Watch", needs_attention: "Needs Attention" }[s]);

const statusStyle = (s) => ({
  healthy: { bg: COLORS.goodBg, color: COLORS.good, border: COLORS.goodBorder },
  watch: { bg: COLORS.warnBg, color: COLORS.warn, border: COLORS.warnBorder },
  needs_attention: { bg: COLORS.badBg, color: COLORS.bad, border: COLORS.badBorder },
}[s]);

const sevStyle = (sev) => ({
  high: { bg: COLORS.badBg, color: COLORS.bad, border: COLORS.badBorder },
  medium: { bg: COLORS.warnBg, color: COLORS.warn, border: COLORS.warnBorder },
  low: { bg: "#F9FAFB", color: COLORS.textSecondary, border: COLORS.border },
}[sev]);

const getTrend = (agentId, weekIdx, weights) => {
  const startIdx = WEEKS[weekIdx].endIdx - 7;
  return Array.from({ length: 8 }, (_, i) => {
    const idx = startIdx + i;
    return { week: TREND_LABELS[idx], score: calcHealth(getDims(agentId, idx), weights) };
  });
};

const generateStatusLine = (name, score, prevScore, issues) => {
  const diff = score - prevScore;
  if (issues.length === 0 && diff >= 0) return "Stable performance. No issues detected.";
  if (diff <= -5 && issues.length > 0) return issues[0].title;
  if (diff > 0) return `Improving. Up ${diff} points from last week.`;
  if (diff === 0) return "Stable. No significant changes.";
  return issues.length > 0 ? issues[0].title : `Down ${Math.abs(diff)} points from last week.`;
};

// ═══════════════════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════

const ScoreRing = ({ score, size = 80, strokeWidth = 7 }) => {
  const color = scoreColor(score);
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={COLORS.borderLight} strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 700, color, fontFamily: MONO, transition: "color 0.3s ease" }}>{score}</span>
      </div>
    </div>
  );
};

const TrendArrow = ({ current, previous }) => {
  const diff = current - previous;
  if (diff > 0) return <span style={{ color: COLORS.good, fontWeight: 600, fontSize: 13, fontFamily: MONO }}>↑+{diff}</span>;
  if (diff < 0) return <span style={{ color: COLORS.bad, fontWeight: 600, fontSize: 13, fontFamily: MONO }}>↓{diff}</span>;
  return <span style={{ color: COLORS.textTertiary, fontSize: 13 }}>→ 0</span>;
};

const DimensionBar = ({ label, score, icon }) => {
  const color = scoreColor(score);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{icon}  {label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: MONO, transition: "color 0.3s" }}>{score}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: COLORS.borderLight, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, borderRadius: 3, background: color, transition: "width 0.5s ease, background 0.3s" }} />
      </div>
    </div>
  );
};

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 11, color: COLORS.textTertiary }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: scoreColor(payload[0].value), fontFamily: MONO }}>{payload[0].value}</div>
    </div>
  );
};

const Badge = ({ status }) => {
  const st = statusStyle(status);
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
      {statusLabel(status)}
    </span>
  );
};

const BackBtn = ({ onClick, label }) => (
  <button onClick={onClick} style={{ background: "none", border: "none", color: COLORS.textSecondary, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 24, fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}
    onMouseOver={e => e.target.style.color = COLORS.accent} onMouseOut={e => e.target.style.color = COLORS.textSecondary}>
    ← {label}
  </button>
);

const Card = ({ children, style, onClick, hoverable }) => {
  const base = { background: COLORS.surface, borderRadius: 14, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`, transition: "box-shadow 0.2s, border-color 0.2s", ...style };
  if (!hoverable) return <div style={base}>{children}</div>;
  return (
    <div style={{ ...base, cursor: "pointer" }} onClick={onClick}
      onMouseOver={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = COLORS.accentMid; }}
      onMouseOut={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor = COLORS.border; }}>
      {children}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// WEIGHT PANEL
// ═══════════════════════════════════════════════════════════════

const WeightPanel = ({ weights, onChange, onReset, isOpen, onToggle }) => {
  const dims = [
    { key: "completion", label: "Task Completion", icon: "✓" },
    { key: "satisfaction", label: "User Satisfaction", icon: "♥" },
    { key: "cost", label: "Cost Efficiency", icon: "$" },
    { key: "compliance", label: "Policy Compliance", icon: "⚑" },
  ];
  const isEqual = Object.values(weights).every(v => v === 25);

  return (
    <div style={{ marginBottom: 24 }}>
      <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 8, background: isOpen ? COLORS.accentLight : COLORS.surface, border: `1px solid ${isOpen ? COLORS.accentMid : COLORS.border}`, borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: isOpen ? COLORS.accent : COLORS.textSecondary, transition: "all 0.2s" }}>
        <span style={{ fontSize: 15 }}>⚙</span> Health Score Weights
        {!isEqual && <span style={{ fontSize: 10, background: COLORS.accent, color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>CUSTOM</span>}
        <span style={{ fontSize: 11, transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
      </button>
      {isOpen && (
        <Card style={{ marginTop: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: COLORS.textTertiary }}>Adjust how each dimension contributes to the overall health score. Scores recalculate in real time.</span>
            {!isEqual && (
              <button onClick={onReset} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4px 12px", fontSize: 12, color: COLORS.textSecondary, cursor: "pointer", fontFamily: FONT }}>
                Reset to Equal
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px" }}>
            {dims.map(d => {
              const pct = Math.round((weights[d.key] / Math.max(Object.values(weights).reduce((a,b)=>a+b,0), 1)) * 100);
              return (
                <div key={d.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{d.icon}  {d.label}</span>
                    <span style={{ fontSize: 13, fontFamily: MONO, color: COLORS.accent, fontWeight: 600 }}>{pct}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={weights[d.key]}
                    onChange={e => onChange({ ...weights, [d.key]: Number(e.target.value) })}
                    style={{ width: "100%", accentColor: COLORS.accent, height: 6, cursor: "pointer" }} />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// WEEK SELECTOR
// ═══════════════════════════════════════════════════════════════

const WeekSelector = ({ current, onChange }) => (
  <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
    {WEEKS.map((w, i) => (
      <button key={i} onClick={() => onChange(i)} style={{
        padding: "8px 16px", borderRadius: 8, border: `1px solid ${i === current ? COLORS.accent : COLORS.border}`,
        background: i === current ? COLORS.accent : COLORS.surface, color: i === current ? "#fff" : COLORS.textSecondary,
        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT, transition: "all 0.2s",
      }}>{w.label}</button>
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// SCREEN 1: OVERVIEW
// ═══════════════════════════════════════════════════════════════

const AgentOverview = ({ weekIdx, weights, onAgent, onReport, weightPanel }) => {
  const agents = useMemo(() => AGENTS_META.map(a => {
    const endIdx = WEEKS[weekIdx].endIdx;
    const dims = getDims(a.id, endIdx);
    const score = calcHealth(dims, weights);
    const prevDims = getDims(a.id, endIdx - 1);
    const prevScore = calcHealth(prevDims, weights);
    const wd = a.weekly[weekIdx];
    return { ...a, dims, score, prevScore, status: statusOf(score), weekData: wd, trend: getTrend(a.id, weekIdx, weights) };
  }), [weekIdx, weights]);

  const overall = Math.round(agents.reduce((s, a) => s + a.score, 0) / agents.length);
  const prevOverall = Math.round(agents.reduce((s, a) => s + a.prevScore, 0) / agents.length);
  const totalConv = agents.reduce((s, a) => s + a.weekData.convTotal, 0);
  const issueCount = agents.reduce((s, a) => s + a.weekData.issues.length, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: FONT }}>Agent Overview</h1>
          <p style={{ fontSize: 13, color: COLORS.textTertiary, margin: "4px 0 0" }}>{WEEKS[weekIdx].label}, 2026</p>
        </div>
        <button onClick={onReport} style={{ padding: "10px 20px", background: COLORS.accent, border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, boxShadow: "0 2px 8px rgba(79,70,229,0.25)", transition: "transform 0.15s" }}
          onMouseOver={e => e.target.style.transform = "translateY(-1px)"} onMouseOut={e => e.target.style.transform = "translateY(0)"}>
          View Weekly Report
        </button>
      </div>

      {weightPanel}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Overall Health", value: overall, extra: <TrendArrow current={overall} previous={prevOverall} />, color: scoreColor(overall) },
          { label: "Total Conversations", value: totalConv.toLocaleString(), color: COLORS.accent },
          { label: "Open Issues", value: issueCount, color: issueCount > 2 ? COLORS.bad : COLORS.warn },
        ].map((c, i) => (
          <Card key={i} style={{ padding: 20 }}>
            <div style={{ fontSize: 11, color: COLORS.textTertiary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{c.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: c.color, fontFamily: MONO, transition: "color 0.3s" }}>{c.value}</span>
              {c.extra}
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {agents.map(a => (
          <Card key={a.id} hoverable onClick={() => onAgent(a)} style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "64px 1fr 180px 100px", alignItems: "center", gap: 24 }}>
            <ScoreRing score={a.score} size={56} strokeWidth={5} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{a.name}</span>
                <Badge status={a.status} />
              </div>
              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{generateStatusLine(a.name, a.score, a.prevScore, a.weekData.issues)}</span>
            </div>
            <div style={{ height: 36 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.trend.slice(-6)}>
                  <Area type="monotone" dataKey="score" stroke={scoreColor(a.score)} fill={scoreColor(a.score)} fillOpacity={0.08} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ textAlign: "right" }}>
              <TrendArrow current={a.score} previous={a.prevScore} />
              <div style={{ fontSize: 11, color: COLORS.textTertiary, marginTop: 2 }}>vs last week</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SCREEN 2: AGENT DETAIL
// ═══════════════════════════════════════════════════════════════

const AgentDetail = ({ agentMeta, weekIdx, weights, onBack, onIssue }) => {
  const endIdx = WEEKS[weekIdx].endIdx;
  const dims = getDims(agentMeta.id, endIdx);
  const score = calcHealth(dims, weights);
  const prevScore = calcHealth(getDims(agentMeta.id, endIdx - 1), weights);
  const status = statusOf(score);
  const wd = agentMeta.weekly[weekIdx];
  const trend = getTrend(agentMeta.id, weekIdx, weights);

  return (
    <div>
      <BackBtn onClick={onBack} label="Back to Overview" />
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 32 }}>
        <ScoreRing score={score} size={88} strokeWidth={7} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: FONT }}>{agentMeta.name}</h1>
            <Badge status={status} />
            <TrendArrow current={score} previous={prevScore} />
          </div>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: 0 }}>
            {wd.convTotal.toLocaleString()} conversations · {wd.convFailed} failed · Cost per resolution: ${wd.costPer.toFixed(2)}
            {wd.costPer > wd.prevCostPer && <span style={{ color: COLORS.bad }}> (was ${wd.prevCostPer.toFixed(2)})</span>}
            {wd.costPer < wd.prevCostPer && <span style={{ color: COLORS.good }}> (was ${wd.prevCostPer.toFixed(2)})</span>}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 20, marginBottom: 32 }}>
        <Card>
          <h3 style={{ fontSize: 12, color: COLORS.textTertiary, margin: "0 0 20px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Health Dimensions</h3>
          <DimensionBar label="Task Completion" score={dims.completion} icon="✓" />
          <DimensionBar label="User Satisfaction" score={dims.satisfaction} icon="♥" />
          <DimensionBar label="Cost Efficiency" score={dims.cost} icon="$" />
          <DimensionBar label="Policy Compliance" score={dims.compliance} icon="⚑" />
        </Card>
        <Card>
          <h3 style={{ fontSize: 12, color: COLORS.textTertiary, margin: "0 0 20px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>8-Week Trend</h3>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={trend}>
              <CartesianGrid stroke={COLORS.borderLight} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: COLORS.textTertiary }} axisLine={false} tickLine={false} />
              <YAxis domain={[40, 100]} tick={{ fontSize: 11, fill: COLORS.textTertiary }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="score" stroke={scoreColor(score)} fill={scoreColor(score)} fillOpacity={0.06} strokeWidth={2.5}
                dot={{ r: 3, fill: scoreColor(score), stroke: COLORS.surface, strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <h3 style={{ fontSize: 12, color: COLORS.textTertiary, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
        Current Issues {wd.issues.length === 0 && <span style={{ color: COLORS.good, textTransform: "none", letterSpacing: 0 }}>— None this week</span>}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {wd.issues.map(issue => {
          const sv = sevStyle(issue.severity);
          return (
            <div key={issue.id} onClick={() => onIssue(issue)}
              style={{ background: sv.bg, border: `1px solid ${sv.border}`, borderRadius: 12, padding: "14px 20px", cursor: "pointer", transition: "all 0.2s", display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 16 }}
              onMouseOver={e => e.currentTarget.style.transform = "translateX(4px)"} onMouseOut={e => e.currentTarget.style.transform = "translateX(0)"}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 2 }}>{issue.title}</div>
                <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{issue.metric} · {issue.affected} conversations</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: sv.color, fontFamily: MONO }}>{issue.impact}</span>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: sv.bg, border: `1px solid ${sv.border}`, color: sv.color, fontWeight: 600 }}>{issue.priority}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SCREEN 3: ISSUE DRILLDOWN
// ═══════════════════════════════════════════════════════════════

const IssueDrilldown = ({ issue, agentName, onBack }) => {
  const sv = sevStyle(issue.severity);
  return (
    <div>
      <BackBtn onClick={onBack} label={`Back to ${agentName}`} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: sv.bg, border: `1px solid ${sv.border}`, color: sv.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{issue.severity} severity</span>
        <span style={{ fontSize: 12, color: COLORS.textTertiary }}>{agentName}</span>
      </div>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: COLORS.text, margin: "0 0 28px", fontFamily: FONT }}>{issue.title}</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Metric affected", value: issue.metric },
          { label: "Impact", value: issue.impact },
          { label: "Conversations affected", value: issue.affected.toString() },
        ].map((c, i) => (
          <Card key={i} style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: COLORS.textTertiary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, fontFamily: MONO }}>{c.value}</div>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 12, color: COLORS.textTertiary, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>What happened</h3>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: COLORS.text, margin: 0 }}>{issue.detail}</p>
      </Card>

      <Card style={{ background: COLORS.accentLight, borderColor: COLORS.accentMid }}>
        <h3 style={{ fontSize: 12, color: COLORS.accent, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          Recommended Action <span style={{ color: sv.color, fontSize: 11, fontWeight: 600 }}>· {issue.priority}</span>
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: "#3730A3", margin: 0 }}>{issue.recommendation}</p>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SCREEN 4: WEEKLY REPORT
// ═══════════════════════════════════════════════════════════════

const WeeklyReport = ({ weekIdx, weights, onBack }) => {
  const [copied, setCopied] = useState(false);

  const agents = useMemo(() => AGENTS_META.map(a => {
    const endIdx = WEEKS[weekIdx].endIdx;
    const dims = getDims(a.id, endIdx);
    const score = calcHealth(dims, weights);
    const prevScore = calcHealth(getDims(a.id, endIdx - 1), weights);
    const wd = a.weekly[weekIdx];
    return { name: a.name, score, prevScore, status: statusOf(score), issues: wd.issues, convTotal: wd.convTotal };
  }), [weekIdx, weights]);

  const overall = Math.round(agents.reduce((s, a) => s + a.score, 0) / agents.length);
  const prevOverall = Math.round(agents.reduce((s, a) => s + a.prevScore, 0) / agents.length);

  const allIssues = agents.flatMap(a => a.issues.map(i => ({ ...i, agent: a.name })));
  const priorities = allIssues.filter(i => i.severity !== "low").sort((a, b) => a.severity === "high" ? -1 : 1);

  const copyText = useCallback(() => {
    const diff = overall - prevOverall;
    const arrow = diff > 0 ? `↑+${diff}` : diff < 0 ? `↓${diff}` : "→0";
    let txt = `Blackbox Weekly Report — ${WEEKS[weekIdx].label}, 2026\nOverall Health: ${overall} (${arrow})\n\n`;
    agents.forEach(a => {
      const d = a.score - a.prevScore;
      const ar = d > 0 ? `↑+${d}` : d < 0 ? `↓${d}` : "→0";
      txt += `${a.name}: ${a.score} (${ar}) — ${statusLabel(a.status)}\n`;
      a.issues.forEach(i => { txt += `  • ${i.title}\n`; });
    });
    if (priorities.length > 0) {
      txt += `\nTop Priorities:\n`;
      priorities.forEach((p, i) => { txt += `${i+1}. [${p.severity.charAt(0).toUpperCase() + p.severity.slice(1)}] ${p.recommendation.split(".")[0]} (${p.agent})\n`; });
    }
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [agents, overall, prevOverall, priorities, weekIdx]);

  return (
    <div>
      <BackBtn onClick={onBack} label="Back to Overview" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: FONT }}>Weekly Report</h1>
          <p style={{ fontSize: 13, color: COLORS.textTertiary, margin: "4px 0 0" }}>{WEEKS[weekIdx].label}, 2026</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: COLORS.textTertiary, marginBottom: 2 }}>Overall Health</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: scoreColor(overall), fontFamily: MONO }}>{overall}</span>
              <TrendArrow current={overall} previous={prevOverall} />
            </div>
          </div>
          <button onClick={copyText} style={{
            padding: "10px 18px", borderRadius: 10, border: `1px solid ${copied ? COLORS.goodBorder : COLORS.border}`,
            background: copied ? COLORS.goodBg : COLORS.surface, color: copied ? COLORS.good : COLORS.textSecondary,
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, transition: "all 0.2s",
          }}>{copied ? "✓ Copied" : "Copy Summary"}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {agents.map(a => {
          const st = statusStyle(a.status);
          return (
            <Card key={a.name} style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>{a.name}</div>
                  <Badge status={a.status} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(a.score), fontFamily: MONO }}>{a.score}</div>
                  <TrendArrow current={a.score} previous={a.prevScore} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
                {a.convTotal.toLocaleString()} conversations · {a.issues.length} issue{a.issues.length !== 1 ? "s" : ""}
              </div>
            </Card>
          );
        })}
      </div>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 12, color: COLORS.textTertiary, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Key Changes This Week</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {agents.map((a, i) => {
            const diff = a.score - a.prevScore;
            const icon = diff > 0 ? "↗" : diff < -3 ? "⚠" : "→";
            const color = diff > 0 ? COLORS.good : diff < -3 ? COLORS.bad : COLORS.textSecondary;
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 16, color, lineHeight: 1.4, flexShrink: 0 }}>{icon}</span>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: COLORS.text, margin: 0 }}>
                  <strong>{a.name}</strong> {diff > 0 ? `improved to ${a.score} (+${diff})` : diff < 0 ? `dropped to ${a.score} (${diff})` : `stable at ${a.score}`}.
                  {a.issues.length > 0 ? ` ${a.issues[0].title}.` : " No issues this week."}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {priorities.length > 0 && (
        <Card style={{ background: COLORS.accentLight, borderColor: COLORS.accentMid }}>
          <h3 style={{ fontSize: 12, color: COLORS.accent, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Priority Actions</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {priorities.map((p, i) => {
              const sv = sevStyle(p.severity);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "56px 1fr", alignItems: "start", gap: 12, padding: "10px 0", borderBottom: i < priorities.length - 1 ? `1px solid ${COLORS.accentMid}` : "none" }}>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, textAlign: "center", fontWeight: 600, background: sv.bg, color: sv.color, border: `1px solid ${sv.border}` }}>
                    {p.severity.charAt(0).toUpperCase() + p.severity.slice(1)}
                  </span>
                  <div>
                    <div style={{ fontSize: 14, color: "#1E1B4B", fontWeight: 500 }}>{p.recommendation.split(".")[0]}.</div>
                    <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>{p.agent}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: COLORS.textTertiary }}>
        This report is designed to be shared. Copy the summary or screenshot it for your meeting doc.
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════

export default function Blackbox() {
  const [screen, setScreen] = useState("overview");
  const [weekIdx, setWeekIdx] = useState(3);
  const [weights, setWeights] = useState({ completion: 25, satisfaction: 25, cost: 25, compliance: 25 });
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [weightOpen, setWeightOpen] = useState(false);

  const nav = useCallback((to, agentId = null, issue = null) => {
    setScreen(to);
    setSelectedAgentId(agentId);
    setSelectedIssue(issue);
  }, []);

  const selectedAgent = AGENTS_META.find(a => a.id === selectedAgentId);

  const onReportNav = useCallback(() => nav("report"), [nav]);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: FONT }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <div style={{
        borderBottom: `1px solid ${COLORS.border}`, padding: "12px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => nav("overview")}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>B</span>
          </div>
          <span style={{ fontSize: 17, fontWeight: 800, color: COLORS.text, letterSpacing: -0.5 }}>Blackbox</span>
          <span style={{ fontSize: 11, color: COLORS.textTertiary, marginLeft: 2, fontWeight: 500 }}>Agent Health Intelligence</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 12, color: COLORS.textSecondary }}>Jennifer's Workspace</span>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS.accent}, #7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>J</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px 60px" }}>
        {screen === "overview" && (
          <AgentOverview weekIdx={weekIdx} weights={weights}
            onAgent={(a) => nav("detail", a.id)} onReport={onReportNav}
            weightPanel={
              <>
                <WeekSelector current={weekIdx} onChange={setWeekIdx} />
                <WeightPanel weights={weights} onChange={setWeights} onReset={() => setWeights({ completion:25, satisfaction:25, cost:25, compliance:25 })} isOpen={weightOpen} onToggle={() => setWeightOpen(!weightOpen)} />
              </>
            }
          />
        )}
        {screen === "detail" && selectedAgent && (
          <AgentDetail agentMeta={selectedAgent} weekIdx={weekIdx} weights={weights}
            onBack={() => nav("overview")} onIssue={(issue) => nav("issue", selectedAgentId, issue)} />
        )}
        {screen === "issue" && selectedIssue && selectedAgent && (
          <IssueDrilldown issue={selectedIssue} agentName={selectedAgent.name} onBack={() => nav("detail", selectedAgentId)} />
        )}
        {screen === "report" && (
          <WeeklyReport weekIdx={weekIdx} weights={weights} onBack={() => nav("overview")} />
        )}
      </div>
    </div>
  );
}
