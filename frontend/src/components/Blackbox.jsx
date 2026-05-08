import React, { useState, useMemo, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const TREND_LABELS = [
  "Feb 17","Feb 24","Mar 3","Mar 10","Mar 17","Mar 24","Mar 31","Apr 7","Apr 14","Apr 21","Apr 28"
];

const WEEKS = [
  { label: "Week 1", endIdx: 7 },
  { label: "Week 2", endIdx: 8 },
  { label: "Week 3", endIdx: 9 },
  { label: "Week 4", endIdx: 10 },
];

const COLORS = {
  bg: "#F3F4F6", surface: "#FFFFFF", border: "#E5E7EB", borderLight: "#F3F4F6",
  text: "#111827", textSecondary: "#6B7280", textTertiary: "#9CA3AF",
  accent: "#4F46E5", accentLight: "#EEF2FF", accentMid: "#C7D2FE", accentDark: "#3730A3",
  good: "#059669", goodBg: "#ECFDF5", goodBorder: "#A7F3D0",
  warn: "#D97706", warnBg: "#FFFBEB", warnBorder: "#FDE68A",
  bad: "#DC2626", badBg: "#FEF2F2", badBorder: "#FECACA",
};

const FONT = "'Outfit', system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";

// ═══════════════════════════════════════════════════════════════
// AGENT TREND DATA
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
// AGENT META + WEEKLY DATA
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
  <button onClick={onClick} data-testid="back-button" style={{ background: "none", border: "none", color: COLORS.textSecondary, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 24, fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}
    onMouseOver={e => e.target.style.color = COLORS.accent} onMouseOut={e => e.target.style.color = COLORS.textSecondary}>
    ← {label}
  </button>
);

const Card = ({ children, style, onClick, hoverable, ...rest }) => {
  const base = { background: COLORS.surface, borderRadius: 14, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`, transition: "box-shadow 0.2s, border-color 0.2s", ...style };
  if (!hoverable) return <div style={base} {...rest}>{children}</div>;
  return (
    <div style={{ ...base, cursor: "pointer" }} onClick={onClick} {...rest}
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
      <button onClick={onToggle} data-testid="weights-toggle" style={{ display: "flex", alignItems: "center", gap: 8, background: isOpen ? COLORS.accentLight : COLORS.surface, border: `1px solid ${isOpen ? COLORS.accentMid : COLORS.border}`, borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: isOpen ? COLORS.accent : COLORS.textSecondary, transition: "all 0.2s" }}>
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
          <div className="bb-weight-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px" }}>
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
  <div className="bb-week-selector" style={{ display: "flex", gap: 6, marginBottom: 24 }}>
    {WEEKS.map((w, i) => (
      <button key={w.label} data-testid={`week-${i}`} onClick={() => onChange(i)} style={{
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
    <div data-testid="overview-screen">
      <div className="bb-overview-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: COLORS.text, margin: 0, fontFamily: FONT, letterSpacing: -0.6 }}>Agent Overview</h1>
          <p style={{ fontSize: 13, color: COLORS.textTertiary, margin: "4px 0 0", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>{WEEKS[weekIdx].label}</p>
        </div>
        <button onClick={onReport} data-testid="view-weekly-report-btn" style={{ padding: "11px 22px", background: COLORS.accent, border: "none", borderRadius: 12, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, boxShadow: "0 6px 18px rgba(79,70,229,0.35)", transition: "transform 0.15s, box-shadow 0.15s", letterSpacing: 0.2 }}
          onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 24px rgba(79,70,229,0.45)"; }}
          onMouseOut={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(79,70,229,0.35)"; }}>
          View Weekly Report
        </button>
      </div>

      {weightPanel}

      <div className="bb-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Overall Health", value: overall, extra: <TrendArrow current={overall} previous={prevOverall} />, color: scoreColor(overall) },
          { label: "Total Conversations", value: totalConv.toLocaleString(), color: COLORS.accent },
          { label: "Open Issues", value: issueCount, color: issueCount > 2 ? COLORS.bad : COLORS.warn },
        ].map((c) => (
          <Card key={c.label} style={{ padding: 20 }}>
            <div style={{ fontSize: 11, color: COLORS.textTertiary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>{c.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: c.color, fontFamily: MONO, transition: "color 0.3s", letterSpacing: -0.5 }}>{c.value}</span>
              {c.extra}
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {agents.map(a => (
          <Card key={a.id} hoverable onClick={() => onAgent(a)} data-testid={`agent-card-${a.id}`} className="bb-agent-card" style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "64px 1fr 180px 100px", alignItems: "center", gap: 24 }}>
            <ScoreRing score={a.score} size={56} strokeWidth={5} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, letterSpacing: -0.2 }}>{a.name}</span>
                <Badge status={a.status} />
              </div>
              <span style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 500 }}>{generateStatusLine(a.name, a.score, a.prevScore, a.weekData.issues)}</span>
            </div>
            <div className="bb-agent-trend" style={{ height: 36 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.trend.slice(-6)}>
                  <Area type="monotone" dataKey="score" stroke={scoreColor(a.score)} fill={scoreColor(a.score)} fillOpacity={0.08} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bb-agent-arrow" style={{ textAlign: "right" }}>
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
    <div data-testid="agent-detail-screen">
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

      <div className="bb-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 20, marginBottom: 32 }}>
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
            <div key={issue.id} data-testid={`issue-${issue.id}`} onClick={() => onIssue(issue)} className="bb-issue-row"
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
    <div data-testid="issue-drilldown-screen">
      <BackBtn onClick={onBack} label={`Back to ${agentName}`} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: sv.bg, border: `1px solid ${sv.border}`, color: sv.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{issue.severity} severity</span>
        <span style={{ fontSize: 12, color: COLORS.textTertiary }}>{agentName}</span>
      </div>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: COLORS.text, margin: "0 0 28px", fontFamily: FONT }}>{issue.title}</h1>

      <div className="bb-issue-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Metric affected", value: issue.metric },
          { label: "Impact", value: issue.impact },
          { label: "Conversations affected", value: issue.affected.toString() },
        ].map((c) => (
          <Card key={c.label} style={{ padding: 16 }}>
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
// PDF EXPORT — professional, multi-page, vector-friendly
// ═══════════════════════════════════════════════════════════════

const exportReportPdf = async ({ weekIdx, weights, reportEl, setStatus }) => {
  if (!reportEl) return;
  setStatus("rendering");

  // Add a temporary class to lift the report element above sticky overlays during capture
  const prevBoxShadow = reportEl.style.boxShadow;
  reportEl.style.boxShadow = "none";

  try {
    const canvas = await html2canvas(reportEl, {
      scale: 2,
      backgroundColor: "#FFFFFF",
      useCORS: true,
      logging: false,
      windowWidth: reportEl.scrollWidth,
    });

    // jsPDF page dimensions in mm at "a4"
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();   // 210
    const pageH = pdf.internal.pageSize.getHeight();  // 297

    // === Compact, professional header (page 1) ===
    // ASCII-only text. jsPDF's bundled Helvetica does NOT support Unicode
    // glyphs like flag/heart/check. Using plain letters keeps it crisp.
    const headerH = 22; // mm — slim band, not a billboard
    pdf.setFillColor(79, 70, 229); // indigo accent
    pdf.rect(0, 0, pageW, headerH, "F");

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("BLACKBOX", 14, 10);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Agent Health Intelligence", 14, 15);

    // Right-aligned meta (also ASCII-only, no unicode flags)
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Weekly Report  ${WEEKS[weekIdx].label}`, pageW - 14, 10, { align: "right" });

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    const w = weights;
    pdf.text(
      `Weights  Comp ${w.completion}  Sat ${w.satisfaction}  Cost ${w.cost}  Policy ${w.compliance}`,
      pageW - 14, 15, { align: "right" }
    );

    // === Capture report image, fit to page ===
    const margin = 12;
    const usableW = pageW - margin * 2;

    // Pixels-per-mm of the source canvas
    const mmPerPxX = usableW / canvas.width;
    const fullImgHmm = canvas.height * mmPerPxX;

    let position = headerH + 8; // leave breathing room below header on page 1
    let remaining = fullImgHmm;
    let yOffsetPx = 0;

    // Helper: render a slice of the canvas onto the current PDF page
    const renderSlice = (sliceHmm, yPosMm) => {
      const sliceHpx = Math.min(canvas.height - yOffsetPx, sliceHmm / mmPerPxX);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHpx;
      const ctx = sliceCanvas.getContext("2d");
      ctx.drawImage(canvas, 0, yOffsetPx, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);
      // JPEG with reasonable quality keeps file size sensible
      const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(sliceData, "JPEG", margin, yPosMm, usableW, sliceHpx * mmPerPxX);
      yOffsetPx += sliceHpx;
    };

    // First page
    const footerReserve = 12;
    const firstPageAvail = pageH - position - footerReserve;
    const firstSliceH = Math.min(remaining, firstPageAvail);
    renderSlice(firstSliceH, position);
    remaining -= firstSliceH;

    // Footer (ASCII-only, no em dashes)
    const drawFooter = (pageNum, totalPages) => {
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.2);
      pdf.line(margin, pageH - 10, pageW - margin, pageH - 10);
      pdf.setTextColor(156, 163, 175);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text("Blackbox  ·  Confidential, internal use only", margin, pageH - 5);
      pdf.text(`Page ${pageNum} of ${totalPages}`, pageW - margin, pageH - 5, { align: "right" });
    };

    // Subsequent pages
    while (remaining > 0.5) {
      pdf.addPage();
      const topMargin = 14;
      const avail = pageH - topMargin - footerReserve;
      const sliceH = Math.min(remaining, avail);
      renderSlice(sliceH, topMargin);
      remaining -= sliceH;
    }

    const totalPages = pdf.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      drawFooter(p, totalPages);
    }

    const fname = `Blackbox_Weekly_${WEEKS[weekIdx].label.replace(/\s+/g, "_")}.pdf`;
    pdf.save(fname);
    setStatus("done");
    setTimeout(() => setStatus("idle"), 1800);
  } catch (e) {
    console.error("PDF export failed", e);
    setStatus("error");
    setTimeout(() => setStatus("idle"), 2500);
  } finally {
    reportEl.style.boxShadow = prevBoxShadow;
  }
};

// ═══════════════════════════════════════════════════════════════
// SCREEN 4: WEEKLY REPORT
// ═══════════════════════════════════════════════════════════════

const WeeklyReport = ({ weekIdx, weights, onBack }) => {
  const [copied, setCopied] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("idle"); // idle | rendering | done | error
  const reportRef = useRef(null);

  // ═══ Compute everything once ═══
  const data = useMemo(() => {
    const endIdx = WEEKS[weekIdx].endIdx;

    const agents = AGENTS_META.map(a => {
      const dims = getDims(a.id, endIdx);
      const prevDims = getDims(a.id, endIdx - 1);
      const score = calcHealth(dims, weights);
      const prevScore = calcHealth(prevDims, weights);
      const wd = a.weekly[weekIdx];
      const prevWd = weekIdx > 0 ? a.weekly[weekIdx - 1] : wd;
      const failRate = wd.convTotal > 0 ? wd.convFailed / wd.convTotal : 0;
      const prevFailRate = prevWd.convTotal > 0 ? prevWd.convFailed / prevWd.convTotal : 0;
      const resolutionRate = 1 - failRate;
      const totalCost = wd.convTotal * wd.costPer;
      const prevTotalCost = prevWd.convTotal * prevWd.prevCostPer;
      return {
        id: a.id, name: a.name, type: a.type,
        dims, prevDims, score, prevScore, status: statusOf(score),
        issues: wd.issues, convTotal: wd.convTotal, convFailed: wd.convFailed,
        prevConvTotal: prevWd.convTotal, prevConvFailed: prevWd.convFailed,
        failRate, prevFailRate, resolutionRate,
        costPer: wd.costPer, prevCostPer: wd.prevCostPer,
        totalCost, prevTotalCost,
      };
    });

    const overall = Math.round(agents.reduce((s, a) => s + a.score, 0) / agents.length);
    const prevOverall = Math.round(agents.reduce((s, a) => s + a.prevScore, 0) / agents.length);
    const totalConv = agents.reduce((s, a) => s + a.convTotal, 0);
    const prevTotalConv = agents.reduce((s, a) => s + a.prevConvTotal, 0);
    const totalFailed = agents.reduce((s, a) => s + a.convFailed, 0);
    const prevTotalFailed = agents.reduce((s, a) => s + a.prevConvFailed, 0);
    const totalCost = agents.reduce((s, a) => s + a.totalCost, 0);
    const prevTotalCost = agents.reduce((s, a) => s + a.prevTotalCost, 0);

    const allIssues = agents.flatMap(a => a.issues.map(i => ({ ...i, agentName: a.name, agentId: a.id })));
    const sevOrder = { high: 0, medium: 1, low: 2 };
    const issuesSorted = [...allIssues].sort((x, y) => sevOrder[x.severity] - sevOrder[y.severity]);
    const issueCounts = {
      high: allIssues.filter(i => i.severity === "high").length,
      medium: allIssues.filter(i => i.severity === "medium").length,
      low: allIssues.filter(i => i.severity === "low").length,
    };
    const priorities = issuesSorted.filter(i => i.severity !== "low");

    // Weakest dimension across all agents
    const dimAvgs = ["completion", "satisfaction", "cost", "compliance"].map(k => ({
      key: k,
      label: { completion: "Task Completion", satisfaction: "User Satisfaction", cost: "Cost Efficiency", compliance: "Policy Compliance" }[k],
      avg: Math.round(agents.reduce((s, a) => s + a.dims[k], 0) / agents.length),
    }));
    const weakestDim = [...dimAvgs].sort((a, b) => a.avg - b.avg)[0];

    // Worst & best agent
    const worstAgent = [...agents].sort((a, b) => a.score - b.score)[0];
    const bestAgent = [...agents].sort((a, b) => b.score - a.score)[0];
    const biggestDrop = [...agents].sort((a, b) => (a.score - a.prevScore) - (b.score - b.prevScore))[0];
    const biggestGain = [...agents].sort((a, b) => (b.score - b.prevScore) - (a.score - a.prevScore))[0];

    return {
      agents, overall, prevOverall,
      totalConv, prevTotalConv, totalFailed, prevTotalFailed,
      totalCost, prevTotalCost,
      issueCounts, issuesSorted, priorities,
      dimAvgs, weakestDim, worstAgent, bestAgent, biggestDrop, biggestGain,
    };
  }, [weekIdx, weights]);

  // ═══ Auto-generated executive narrative ═══
  const narrative = useMemo(() => {
    const overallDelta = data.overall - data.prevOverall;
    const verdict = data.overall >= 85 ? "healthy" : data.overall >= 75 ? "watching closely" : "needs attention";
    const pieces = [];
    if (overallDelta < 0) {
      const drop = Math.abs(overallDelta);
      pieces.push(`Overall fleet health dropped ${drop} point${drop === 1 ? "" : "s"} this week to ${data.overall}, primarily driven by ${data.biggestDrop.name} (${data.biggestDrop.score - data.biggestDrop.prevScore} pts).`);
    } else if (overallDelta > 0) {
      pieces.push(`Overall fleet health rose ${overallDelta} point${overallDelta === 1 ? "" : "s"} this week to ${data.overall}, led by ${data.biggestGain.name} (+${data.biggestGain.score - data.biggestGain.prevScore} pts).`);
    } else {
      pieces.push(`Overall fleet health is stable at ${data.overall}, ${verdict}.`);
    }
    pieces.push(`${data.weakestDim.label} is the weakest dimension across the fleet at ${data.weakestDim.avg}.`);
    if (data.totalCost > data.prevTotalCost) {
      const pct = Math.round(((data.totalCost - data.prevTotalCost) / data.prevTotalCost) * 100);
      pieces.push(`Total weekly cost rose ${pct}% to $${Math.round(data.totalCost).toLocaleString()}.`);
    } else if (data.totalCost < data.prevTotalCost) {
      const pct = Math.round(((data.prevTotalCost - data.totalCost) / data.prevTotalCost) * 100);
      pieces.push(`Total weekly cost fell ${pct}% to $${Math.round(data.totalCost).toLocaleString()}.`);
    }
    if (data.issueCounts.high > 0) {
      pieces.push(`${data.issueCounts.high} high-severity issue${data.issueCounts.high > 1 ? "s" : ""} ${data.issueCounts.high === 1 ? "needs" : "need"} immediate attention.`);
    }
    return pieces.join(" ");
  }, [data]);

  const copyText = useCallback(() => {
    const arrow = (n) => n > 0 ? `+${n}` : n < 0 ? `${n}` : "0";
    let txt = `Blackbox Weekly Report — ${WEEKS[weekIdx].label}\n\n`;
    txt += `EXECUTIVE SUMMARY\n${narrative}\n\n`;
    txt += `KPIs\nHealth ${data.overall} (${arrow(data.overall - data.prevOverall)}) | Conversations ${data.totalConv.toLocaleString()} (${arrow(data.totalConv - data.prevTotalConv)}) | Failed ${data.totalFailed} | Cost $${Math.round(data.totalCost).toLocaleString()}\n\n`;
    txt += `BY AGENT\n`;
    data.agents.forEach(a => {
      txt += `${a.name}: health ${a.score} (${arrow(a.score - a.prevScore)}), ${a.convTotal.toLocaleString()} conv, ${a.convFailed} failed, $${a.costPer.toFixed(2)}/res, ${a.issues.length} issue${a.issues.length !== 1 ? "s" : ""}\n`;
    });
    if (data.priorities.length > 0) {
      txt += `\nPRIORITY ACTIONS\n`;
      data.priorities.forEach((p, i) => {
        txt += `${i + 1}. [${p.severity.toUpperCase()}] ${p.recommendation.split(".")[0]} (${p.agentName})\n`;
      });
    }
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [data, narrative, weekIdx]);

  const onDownloadPdf = useCallback(() => {
    exportReportPdf({ weekIdx, weights, reportEl: reportRef.current, setStatus: setPdfStatus });
  }, [weekIdx, weights]);

  const pdfBtnLabel = pdfStatus === "rendering" ? "Generating…" : pdfStatus === "done" ? "✓ Downloaded" : pdfStatus === "error" ? "Try again" : "Download PDF";
  const pdfDisabled = pdfStatus === "rendering";

  // ═══ Small helpers used inside render ═══
  const Delta = ({ value, suffix = "", invert = false }) => {
    if (value === 0) return <span style={{ color: COLORS.textTertiary, fontSize: 12, fontFamily: MONO }}>→ 0{suffix}</span>;
    const positive = invert ? value < 0 : value > 0;
    const color = positive ? COLORS.good : COLORS.bad;
    const sign = value > 0 ? "+" : "";
    const arrow = value > 0 ? "↑" : "↓";
    return <span style={{ color, fontSize: 12, fontWeight: 700, fontFamily: MONO }}>{arrow}{sign}{value}{suffix}</span>;
  };

  const HeatCell = ({ score, prev }) => {
    const color = scoreColor(score);
    const bg = score >= 85 ? COLORS.goodBg : score >= 75 ? COLORS.warnBg : COLORS.badBg;
    const delta = score - prev;
    return (
      <div style={{ background: bg, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: MONO, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 10, color: delta === 0 ? COLORS.textTertiary : delta > 0 ? COLORS.good : COLORS.bad, fontFamily: MONO, marginTop: 2, fontWeight: 600 }}>
          {delta > 0 ? `+${delta}` : delta === 0 ? "—" : delta}
        </div>
      </div>
    );
  };

  const SectionTitle = ({ children, hint }) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
      <h3 style={{ fontSize: 13, color: COLORS.text, margin: 0, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 800 }}>{children}</h3>
      {hint && <span style={{ fontSize: 11, color: COLORS.textTertiary, fontWeight: 500 }}>{hint}</span>}
    </div>
  );

  return (
    <div data-testid="weekly-report-screen">
      <BackBtn onClick={onBack} label="Back to Overview" />
      <div className="bb-report-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: COLORS.text, margin: 0, fontFamily: FONT, letterSpacing: -0.5 }}>Weekly Report</h1>
          <p style={{ fontSize: 13, color: COLORS.textTertiary, margin: "4px 0 0", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{WEEKS[weekIdx].label} · {data.agents.length} agents</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={copyText} data-testid="copy-summary-btn" style={{
            padding: "10px 16px", borderRadius: 10, border: `1px solid ${copied ? COLORS.goodBorder : COLORS.border}`,
            background: copied ? COLORS.goodBg : COLORS.surface, color: copied ? COLORS.good : COLORS.textSecondary,
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all 0.2s",
          }}>{copied ? "✓ Copied" : "Copy Summary"}</button>
          <button onClick={onDownloadPdf} disabled={pdfDisabled} data-testid="download-pdf-btn" style={{
            padding: "10px 16px", borderRadius: 10, border: "none",
            background: pdfStatus === "done" ? COLORS.good : pdfStatus === "error" ? COLORS.bad : COLORS.accent,
            color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: pdfDisabled ? "wait" : "pointer", fontFamily: FONT,
            boxShadow: "0 4px 14px rgba(79,70,229,0.3)", transition: "all 0.2s",
            display: "flex", alignItems: "center", gap: 8, opacity: pdfDisabled ? 0.85 : 1,
          }}>
            {pdfStatus === "rendering" && <span className="bb-spinner" style={{ width: 12, height: 12 }} />}
            {pdfBtnLabel}
          </button>
        </div>
      </div>

      {/* Capture region for PDF */}
      <div ref={reportRef} data-testid="report-capture-region" style={{ background: "transparent" }}>

        {/* ─── 1. EXECUTIVE SUMMARY ─── */}
        <Card style={{ marginBottom: 16, padding: 24, background: "linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 100%)", borderColor: COLORS.accentMid }}>
          <SectionTitle hint="Auto-derived from this week's data">Executive Summary</SectionTitle>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: COLORS.text, margin: 0, fontWeight: 500 }}>
            {narrative}
          </p>
        </Card>

        {/* ─── 2. KPI STRIP (4 cards) ─── */}
        <div className="bb-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Fleet Health", value: data.overall, delta: data.overall - data.prevOverall, color: scoreColor(data.overall) },
            { label: "Conversations", value: data.totalConv.toLocaleString(), delta: data.totalConv - data.prevTotalConv, color: COLORS.accent },
            { label: "Failed", value: data.totalFailed.toLocaleString(), delta: data.totalFailed - data.prevTotalFailed, color: data.totalFailed > data.prevTotalFailed ? COLORS.bad : COLORS.good, invertDelta: true },
            { label: "Weekly Cost", value: `$${Math.round(data.totalCost).toLocaleString()}`, delta: Math.round(data.totalCost - data.prevTotalCost), color: data.totalCost > data.prevTotalCost ? COLORS.bad : COLORS.good, prefix: "$", invertDelta: true },
          ].map((k) => (
            <Card key={k.label} style={{ padding: 16 }}>
              <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: MONO, marginBottom: 4, lineHeight: 1 }}>{k.value}</div>
              <Delta value={k.delta} suffix={k.prefix ? "" : ""} invert={!!k.invertDelta} />
            </Card>
          ))}
        </div>

        {/* ─── 3. PERFORMANCE MATRIX (heatmap) ─── */}
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle hint="Score (top) and week-over-week change (bottom)">Performance Matrix</SectionTitle>
          <div className="bb-matrix" style={{ display: "grid", gridTemplateColumns: "1.5fr repeat(4, 1fr) 1fr", gap: 8, alignItems: "center" }}>
            <div></div>
            {data.dimAvgs.map(d => (
              <div key={d.key} style={{ fontSize: 10.5, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, textAlign: "center" }}>{d.label}</div>
            ))}
            <div style={{ fontSize: 10.5, color: COLORS.text, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 800, textAlign: "center" }}>Health</div>

            {data.agents.map(a => (
              <React.Fragment key={a.id}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.text }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: COLORS.textTertiary, fontWeight: 500 }}>{a.type}</div>
                </div>
                <HeatCell score={a.dims.completion} prev={a.prevDims.completion} />
                <HeatCell score={a.dims.satisfaction} prev={a.prevDims.satisfaction} />
                <HeatCell score={a.dims.cost} prev={a.prevDims.cost} />
                <HeatCell score={a.dims.compliance} prev={a.prevDims.compliance} />
                <HeatCell score={a.score} prev={a.prevScore} />
              </React.Fragment>
            ))}

            <div style={{ fontSize: 11, color: COLORS.textTertiary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Fleet avg</div>
            {data.dimAvgs.map(d => (
              <div key={d.key} style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: scoreColor(d.avg), fontFamily: MONO }}>{d.avg}</div>
            ))}
            <div style={{ textAlign: "center", fontSize: 14, fontWeight: 800, color: scoreColor(data.overall), fontFamily: MONO }}>{data.overall}</div>
          </div>
        </Card>

        {/* ─── 4. VOLUME & ECONOMICS ─── */}
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle hint={`Total spend $${Math.round(data.totalCost).toLocaleString()} this week`}>Volume & Economics</SectionTitle>
          <div className="bb-vol-table" style={{ display: "grid", gridTemplateColumns: "1.5fr repeat(4, 1fr)", gap: 8, alignItems: "center" }}>
            {["Agent", "Conversations", "Failed", "Resolution", "$/Resolution"].map(h => (
              <div key={h} style={{ fontSize: 10.5, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, paddingBottom: 8, borderBottom: `1px solid ${COLORS.border}` }}>{h}</div>
            ))}
            {data.agents.map(a => {
              const costDelta = a.costPer - a.prevCostPer;
              return (
                <React.Fragment key={a.id}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.text, paddingTop: 6 }}>{a.name}</div>
                  <div style={{ paddingTop: 6 }}>
                    <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: COLORS.text }}>{a.convTotal.toLocaleString()}</div>
                    <Delta value={a.convTotal - a.prevConvTotal} />
                  </div>
                  <div style={{ paddingTop: 6 }}>
                    <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: a.convFailed > a.prevConvFailed ? COLORS.bad : COLORS.text }}>{a.convFailed}</div>
                    <Delta value={a.convFailed - a.prevConvFailed} invert />
                  </div>
                  <div style={{ paddingTop: 6 }}>
                    <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: scoreColor(a.resolutionRate * 100) }}>{Math.round(a.resolutionRate * 100)}%</div>
                  </div>
                  <div style={{ paddingTop: 6 }}>
                    <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: costDelta > 0 ? COLORS.bad : costDelta < 0 ? COLORS.good : COLORS.text }}>${a.costPer.toFixed(2)}</div>
                    <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 600, color: costDelta > 0 ? COLORS.bad : costDelta < 0 ? COLORS.good : COLORS.textTertiary }}>
                      {costDelta > 0 ? "+" : ""}${costDelta.toFixed(2)}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </Card>

        {/* ─── 5. ISSUES INVENTORY ─── */}
        {data.issuesSorted.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <SectionTitle hint={`${data.issueCounts.high} high · ${data.issueCounts.medium} medium · ${data.issueCounts.low} low`}>Open Issues</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.issuesSorted.map(issue => {
                const sv = sevStyle(issue.severity);
                return (
                  <div key={issue.id} className="bb-issue-row" style={{
                    background: sv.bg, border: `1px solid ${sv.border}`, borderRadius: 10,
                    padding: "10px 14px",
                    display: "grid", gridTemplateColumns: "70px 1fr auto", alignItems: "center", gap: 12,
                  }}>
                    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, textAlign: "center", fontWeight: 800, background: COLORS.surface, color: sv.color, border: `1px solid ${sv.border}`, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {issue.severity}
                    </span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.text }}>{issue.title}</div>
                      <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 2 }}>
                        {issue.agentName} · {issue.metric} · {issue.affected.toLocaleString()} conversations
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontFamily: MONO, fontWeight: 800, color: sv.color }}>{issue.impact}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ─── 6. FOCUS FOR NEXT WEEK ─── */}
        {data.priorities.length > 0 && (
          <Card style={{ background: "linear-gradient(135deg, #EEF2FF 0%, #FAF5FF 100%)", borderColor: COLORS.accentMid, marginBottom: 16 }}>
            <SectionTitle hint="Ranked by severity, then impact">Focus for Next Week</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {data.priorities.slice(0, 5).map((p, i) => {
                const sv = sevStyle(p.severity);
                return (
                  <div key={p.id} className="bb-priority-row" style={{
                    display: "grid", gridTemplateColumns: "32px 1fr",
                    gap: 12, alignItems: "start", padding: "10px 0",
                    borderBottom: i < Math.min(data.priorities.length, 5) - 1 ? `1px solid rgba(79,70,229,0.15)` : "none",
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, background: COLORS.surface,
                      border: `1px solid ${sv.border}`, color: sv.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800, fontFamily: MONO,
                    }}>{i + 1}</div>
                    <div>
                      <div style={{ fontSize: 14, color: COLORS.text, fontWeight: 600, lineHeight: 1.4 }}>{p.recommendation.split(".")[0]}.</div>
                      <div style={{ fontSize: 11.5, color: COLORS.accent, marginTop: 4, fontWeight: 600 }}>
                        {p.agentName} · expected lift on {p.metric.toLowerCase()} · severity {p.severity}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

      </div>

      <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: COLORS.textTertiary }}>
        Share-ready: copy the summary, download a PDF, or screenshot for your meeting doc.
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

      {/* Local styles for animations */}
      <style>{`
        @keyframes bbSlide { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes bbFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bbPulse { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
        @keyframes bbSpin { to { transform: rotate(360deg); } }
        .bb-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:${COLORS.accent}; animation: bbPulse 1.1s infinite ease-in-out both; }
        .bb-spinner { display:inline-block; border:2px solid rgba(255,255,255,0.4); border-top-color:#fff; border-radius:50%; animation: bbSpin 0.7s linear infinite; }

        /* =============================================================
           Responsive layout — phones, tablets, desktops
           Inline styles set the desktop default; these media queries
           override only on smaller viewports.
           ============================================================= */
        @media (max-width: 820px) {
          .bb-content { padding: 18px 14px 40px !important; }
          .bb-topbar { padding: 12px 16px !important; }
          .bb-topbar-tagline { display: none !important; }
          .bb-topbar-workspace { display: none !important; }

          .bb-stats-grid,
          .bb-issue-grid,
          .bb-report-grid { grid-template-columns: 1fr !important; }
          .bb-weight-grid { grid-template-columns: 1fr !important; gap: 14px !important; }

          .bb-detail-grid { grid-template-columns: 1fr !important; }

          .bb-agent-card {
            grid-template-columns: 56px 1fr !important;
            gap: 14px !important;
            padding: 16px !important;
          }
          .bb-agent-card .bb-agent-trend,
          .bb-agent-card .bb-agent-arrow { display: none !important; }

          .bb-overview-header,
          .bb-report-header {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 14px !important;
          }
          .bb-overview-header h1,
          .bb-report-header h1 { font-size: 24px !important; }

          .bb-week-selector { flex-wrap: wrap !important; }
          .bb-week-selector button {
            flex: 1 1 calc(50% - 6px) !important;
            min-width: 0 !important;
            padding: 9px 8px !important;
            font-size: 12px !important;
          }

          .bb-issue-row {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            padding: 12px 14px !important;
          }

          .bb-priority-row {
            grid-template-columns: 1fr !important;
            gap: 6px !important;
          }

          /* Weekly Report tables collapse on mobile */
          .bb-kpi-grid { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .bb-matrix {
            grid-template-columns: 1.2fr repeat(4, 1fr) 1fr !important;
            gap: 4px !important;
          }
          .bb-matrix > div { font-size: 10.5px !important; padding: 4px 2px !important; }
          .bb-vol-table {
            grid-template-columns: 1.4fr 1fr 1fr 1fr !important;
            gap: 6px !important;
          }
          .bb-vol-table > div:nth-of-type(5n+5) { display: none !important; } /* hide $/Resolution col on phones */

          .bb-brand-name { font-size: 18px !important; }
          .bb-brand-tile { width: 32px !important; height: 32px !important; }
          .bb-brand-tile span { font-size: 16px !important; }
        }

        @media (max-width: 480px) {
          .bb-content { padding: 14px 12px 32px !important; }
          .bb-overview-header h1,
          .bb-report-header h1 { font-size: 22px !important; }
          .bb-matrix {
            grid-template-columns: 1fr repeat(2, 1fr) 1fr !important;
          }
          .bb-matrix > div:nth-of-type(7n+4),
          .bb-matrix > div:nth-of-type(7n+5) { display: none !important; }
        }

        /* Tablet portrait (iPad ~820–1024px) — keep desktop layout
           but tighten the agent card right rail so trend chart shows */
        @media (min-width: 821px) and (max-width: 1024px) {
          .bb-content { padding: 24px 20px 50px !important; }
          .bb-agent-card { gap: 16px !important; }
        }


        /* Hide platform-injected "Made with Emergent" badge */
        #emergent-badge,
        [id^="emergent-badge"],
        a[href*="emergent.sh"],
        iframe[src*="emergent"] { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
      `}</style>

      {/* Top bar */}
      <div style={{
        borderBottom: `1px solid ${COLORS.border}`, padding: "12px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => nav("overview")} data-testid="logo-home">
          <div className="bb-brand-tile" style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${COLORS.accent}, #7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(79,70,229,0.35)" }}>
            <span style={{ fontSize: 19, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>B</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
            <span className="bb-brand-name" style={{ fontSize: 22, fontWeight: 900, color: COLORS.text, letterSpacing: -0.8 }}>Blackbox</span>
            <span className="bb-topbar-tagline" style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Agent Health Intelligence</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="bb-topbar-workspace" style={{ fontSize: 12, color: COLORS.textSecondary }}>Jennifer's Workspace</span>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS.accent}, #7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>J</div>
        </div>
      </div>

      {/* Content */}
      <div className="bb-content" style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px 60px" }}>
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
