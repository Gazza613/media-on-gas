import { useState, useEffect, useRef } from "react";

const COLORS = {
  bg: "#0a0e1a",
  card: "#111827",
  cardAlt: "#1a2236",
  border: "#1e293b",
  mtn: "#FFCB05",
  mtnDim: "rgba(255,203,5,0.12)",
  fb: "#1877F2",
  ig: "#C13584",
  tt: "#25F4EE",
  green: "#4ade80",
  red: "#f87171",
  amber: "#fbbf24",
  text: "#f1f5f9",
  muted: "#64748b",
  white: "#ffffff",
};

const font = "'DM Sans', sans-serif";
const mono = "'JetBrains Mono', monospace";

// Data
const fbData = {
  impressions: 3538025, reach: 1301126, freq: 2.72, spend: 60255, cpm: 17.03, clicks: 61455, ctr: 1.74,
  campaigns: [
    { name: "App Install Clicks", adset: "Cold Interest", results: 18976, spend: 13451, cpc: 0.71, ctr: 1.58 },
    { name: "App Install Clicks", adset: "Lookalike", results: 17775, spend: 13602, cpc: 0.77, ctr: 1.56 },
    { name: "Homeloans Traffic", adset: "High Intent", results: 2830, spend: 5725, cpc: 2.02, ctr: 2.18 },
    { name: "Page Likes", adset: "Cold Interest", results: 1498, spend: 5907, cpc: 3.94, ctr: 1.67 },
    { name: "Page Likes", adset: "Lookalike", results: 1428, spend: 5946, cpc: 4.16, ctr: 1.59 },
  ],
  topAds: [
    { name: "GIF, Scroll & Chill Bundles", audience: "Cold Interest", results: 7671, cpc: 0.67, ctr: 2.36, best: true },
    { name: "Static 4, Rent to Own Honor", audience: "Lookalike", results: 5838, cpc: 0.77, ctr: 1.49 },
    { name: "MP4, Ayanda R59 R69 Deals", audience: "Cold Interest", results: 1844, cpc: 0.70, ctr: 1.90 },
    { name: "Static 2, Scroll & Chill Bundles", audience: "Cold Interest", results: 2075, cpc: 0.71, ctr: 1.34 },
    { name: "GIF, Showmax and Mins", audience: "Cold Interest", results: 1287, cpc: 0.64, ctr: 2.78 },
  ],
};

const igData = {
  impressions: 1142009, reach: 319871, freq: 3.57, spend: 15541, cpm: 13.61, followers: 5754, cpf: 1.36,
  topAds: [
    { name: "MP4, Kabelo Handset Rent to Own", results: 4449, cpf: 1.30, ctr: 1.15, best: true },
    { name: "MP4, Ayanda R59 R69 Deals", results: 602, cpf: 1.56, ctr: 1.06 },
    { name: "MP4, Kabelo MoMo Marching On", results: 282, cpf: 1.45, ctr: 1.22 },
    { name: "MP4, Ayanda 4GB Anytime Data", results: 271, cpf: 1.57, ctr: 1.40 },
  ],
};

const ttData = {
  impressions: 7594935, spend: 48117, cpm: 6.34, views: 7023845, viewRate: 92.5, follows: 7558, cpf: 1.94, likes: 10462, comments: 100,
  topAds: [
    { name: "Ayanda, R59 R69 Deals", follows: 3249, cpf: 1.28, spend: 4165, best: true },
    { name: "Kabelo, MoMo Marching On", follows: 1308, cpf: 1.38, spend: 1803 },
  ],
};

const weekData = [
  { week: "W1", dates: "1–7 Mar", results: 15072, daily: 2153, cpc: 1.35, ctr: 1.53, spend: 20318 },
  { week: "W2", dates: "8–14 Mar", results: 16507, daily: 2358, cpc: 1.31, ctr: 1.66, spend: 21610 },
  { week: "W3", dates: "15–21 Mar", results: 17868, daily: 2552, cpc: 1.30, ctr: 1.71, spend: 23319 },
  { week: "W4", dates: "22–24 Mar", results: 8254, daily: 2751, cpc: 1.28, ctr: 1.70, spend: 10549, best: true },
];

const R = (n) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: n < 10 ? 2 : 0, maximumFractionDigits: 2 })}`;
const N = (n) => n.toLocaleString("en-ZA");
const P = (n) => `${n.toFixed(2)}%`;

function Flag({ type, children }) {
  const c = type === "good" ? COLORS.green : type === "warn" ? COLORS.amber : COLORS.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: c + "18", color: c, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, fontFamily: mono, letterSpacing: 0.5 }}>
      {type === "good" ? "▲" : type === "warn" ? "●" : "▼"} {children}
    </span>
  );
}

function Badge({ color, children }) {
  return <span style={{ background: color, color: "#fff", fontSize: 9, fontWeight: 800, padding: "3px 10px", borderRadius: 12, fontFamily: font, letterSpacing: 1, textTransform: "uppercase" }}>{children}</span>;
}

function Metric({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 9, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", fontFamily: mono, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: color || COLORS.white, fontFamily: font, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 12, ...style }}>{children}</div>;
}

function Table({ headers, rows, dark }) {
  const bg = dark ? "#14172a" : COLORS.card;
  const borderC = dark ? "#2a2d45" : COLORS.border;
  return (
    <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${borderC}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: font, fontSize: 12 }}>
        <thead>
          <tr>{headers.map((h, i) => <th key={i} style={{ padding: "10px 14px", textAlign: i === 0 ? "left" : "center", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: COLORS.mtn, background: "#004F71", borderBottom: `2px solid ${COLORS.mtn}30`, fontFamily: mono }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? bg : (dark ? "#1a1d32" : COLORS.cardAlt) }}>
              {row.map((cell, ci) => <td key={ci} style={{ padding: "10px 14px", textAlign: ci === 0 ? "left" : "center", color: COLORS.text, borderBottom: `1px solid ${borderC}`, whiteSpace: "nowrap" }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniBar({ pct, color }) {
  return (
    <div style={{ width: "100%", height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color || COLORS.mtn, borderRadius: 3, transition: "width 1s ease" }} />
    </div>
  );
}

// ── Tabs ──
function OverviewTab() {
  const totalImpressions = 12274969;
  const totalSpend = 123913;
  const budget = 165000;
  const pacing = ((totalSpend / budget) * 100).toFixed(1);
  const timeElapsed = 77.4;

  return (
    <div>
      {/* Hero strip */}
      <div style={{ background: "linear-gradient(135deg, #004F71, #002a3d)", borderRadius: 14, padding: "28px 28px 24px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, background: `radial-gradient(circle, ${COLORS.mtn}15, transparent)`, borderRadius: "50%" }} />
        <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: COLORS.mtn + "90", fontFamily: mono, marginBottom: 8 }}>MTN MoMo · Paid Social · March 2026</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
          <Metric label="Total Impressions" value={N(totalImpressions)} sub="3 platforms" color={COLORS.mtn} />
          <Metric label="Combined Spend" value={R(totalSpend)} sub={`Meta R75,796 + TikTok R48,117`} color={COLORS.mtn} />
          <Metric label="Budget" value={R(budget)} sub="Meta R100k + TikTok R65k" color={COLORS.mtn} />
          <Metric label="Blended CPM" value="R10.10" color={COLORS.green} />
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>
            <span>24 of 31 days ({timeElapsed}%)</span>
            <span>{R(totalSpend)} of {R(budget)} ({pacing}%)</span>
          </div>
          <MiniBar pct={parseFloat(pacing)} />
          <div style={{ marginTop: 6 }}><Flag type="good">ON PACE, spend trails time by 2.3pp</Flag></div>
        </div>
      </div>

      {/* CPM comparison */}
      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: mono, marginBottom: 14 }}>Platform CPM Comparison</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { name: "Facebook", cpm: 17.03, imp: 3538025, color: COLORS.fb },
            { name: "Instagram", cpm: 13.61, imp: 1142009, color: COLORS.ig },
            { name: "TikTok", cpm: 6.34, imp: 7594935, color: COLORS.tt },
          ].map((p) => (
            <div key={p.name} style={{ flex: 1, minWidth: 140, background: COLORS.cardAlt, borderRadius: 10, padding: 16, borderLeft: `3px solid ${p.color}` }}>
              <div style={{ fontSize: 10, color: p.color, fontWeight: 700, fontFamily: mono, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.white }}>{R(p.cpm)}</div>
              <div style={{ fontSize: 10, color: COLORS.muted }}>{N(p.imp)} impressions</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Community */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: mono }}>Community Growth</div>
          <span style={{ fontSize: 22, fontWeight: 900, color: COLORS.mtn }}>19,214</span>
        </div>
        {[
          { platform: "TikTok", follows: 7558, cpf: 1.94, color: COLORS.tt, pct: 39.3 },
          { platform: "Facebook", follows: 5902, cpf: 4.66, color: COLORS.fb, pct: 30.7 },
          { platform: "Instagram", follows: 5754, cpf: 1.36, color: COLORS.ig, pct: 30.0 },
        ].map((p) => (
          <div key={p.platform} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.text, marginBottom: 3 }}>
              <span style={{ color: p.color, fontWeight: 700 }}>{p.platform}</span>
              <span>{N(p.follows)} · {R(p.cpf)} CPF</span>
            </div>
            <MiniBar pct={p.pct * 2.5} color={p.color} />
          </div>
        ))}
      </Card>
    </div>
  );
}

function FacebookTab() {
  return (
    <div>
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <Metric label="Impressions" value={N(fbData.impressions)} sub="75.6% of Meta total" color={COLORS.fb} />
          <Metric label="Reach" value={N(fbData.reach)} />
          <Metric label="Frequency" value={`${fbData.freq}x`} />
          <Metric label="Spend" value={R(fbData.spend)} />
          <Metric label="CPM" value={R(fbData.cpm)} />
          <Metric label="Clicks" value={N(fbData.clicks)} />
          <Metric label="CTR" value={P(fbData.ctr)} color={COLORS.green} />
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: mono, marginBottom: 10 }}>Campaign KPIs</div>
        <Table
          headers={["Campaign", "Ad Set", "Results", "Spend", "CPC", "CTR"]}
          rows={fbData.campaigns.map((c) => [
            <span style={{ fontWeight: 600 }}>{c.name}</span>,
            c.adset,
            <strong>{N(c.results)}</strong>,
            R(c.spend),
            <span style={{ color: c.cpc < 1 ? COLORS.green : COLORS.text }}>{R(c.cpc)}</span>,
            P(c.ctr),
          ])}
        />
      </Card>

      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: mono, marginBottom: 10 }}>Top App Install Creatives <Flag type="good">GIF format leads</Flag></div>
        <Table
          headers={["Creative", "Results", "CPC", "CTR"]}
          rows={fbData.topAds.map((a) => [
            <span>{a.name} {a.best && <Badge color="#004F71">BEST</Badge>}</span>,
            <strong>{N(a.results)}</strong>,
            <span style={{ color: a.cpc < 0.70 ? COLORS.green : COLORS.text }}>{R(a.cpc)}</span>,
            P(a.ctr),
          ])}
        />
      </Card>

      <Card style={{ borderLeft: `3px solid ${COLORS.mtn}`, background: COLORS.cardAlt }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.mtn, fontFamily: mono, marginBottom: 6 }}>OPTIMISATION FLAGS</div>
        <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 6 }}><Flag type="good">GIF format best CPC</Flag> Scroll & Chill GIF at R0.67, prioritise GIF creative refresh for April.</div>
          <div style={{ marginBottom: 6 }}><Flag type="good">Cold Interest ≈ Lookalike</Flag> CPC gap is only R0.06, both adsets viable, no reallocation needed.</div>
          <div><Flag type="warn">Frequency 2.72x</Flag> Approaching 3x threshold on 24 days, monitor for fatigue in final week.</div>
        </div>
      </Card>
    </div>
  );
}

function InstagramTab() {
  return (
    <div>
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <Metric label="Impressions" value={N(igData.impressions)} sub="24.4% of Meta total" color={COLORS.ig} />
          <Metric label="Reach" value={N(igData.reach)} />
          <Metric label="Frequency" value={`${igData.freq}x`} />
          <Metric label="Spend" value={R(igData.spend)} />
          <Metric label="CPM" value={R(igData.cpm)} sub="Best Meta" color={COLORS.green} />
          <Metric label="Followers" value={N(igData.followers)} color={COLORS.green} />
          <Metric label="CPF" value={R(igData.cpf)} sub="Best Meta" color={COLORS.green} />
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: mono, marginBottom: 10 }}>Top Follower Creatives</div>
        <Table
          headers={["Creative", "Follows", "CPF", "CTR"]}
          rows={igData.topAds.map((a) => [
            <span>{a.name} {a.best && <Badge color={COLORS.ig}>BEST</Badge>}</span>,
            <strong>{N(a.results)}</strong>,
            R(a.cpf),
            P(a.ctr),
          ])}
        />
      </Card>

      <Card style={{ borderLeft: `3px solid ${COLORS.ig}`, background: COLORS.cardAlt }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.ig, fontFamily: mono, marginBottom: 6 }}>OPTIMISATION FLAGS</div>
        <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 6 }}><Flag type="good">Best Meta CPM at R13.61</Flag>, 20% more efficient than Facebook for impressions.</div>
          <div style={{ marginBottom: 6 }}><Flag type="good">Kabelo Rent to Own dominates</Flag>, 77% of all IG follows from one creative. Test new Kabelo variants.</div>
          <div><Flag type="warn">Frequency 3.57x</Flag>, above 3x threshold. Creative refresh recommended for April.</div>
        </div>
      </Card>
    </div>
  );
}

function TikTokTab() {
  return (
    <div>
      <Card style={{ background: "#14172a", border: "1px solid #2a2d45" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <Metric label="Impressions" value={N(ttData.impressions)} sub="61.9% of all campaign" color={COLORS.tt} />
          <Metric label="Spend" value={R(ttData.spend)} />
          <Metric label="CPM" value={R(ttData.cpm)} sub="Best all platforms" color={COLORS.green} />
          <Metric label="Video Views" value={N(ttData.views)} />
          <Metric label="View Rate" value={P(ttData.viewRate)} color={COLORS.green} />
          <Metric label="Follows" value={N(ttData.follows)} color={COLORS.green} />
          <Metric label="CPF" value={R(ttData.cpf)} />
          <Metric label="Likes" value={N(ttData.likes)} />
        </div>
      </Card>

      <Card style={{ background: "#14172a", border: "1px solid #2a2d45" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: mono, marginBottom: 10 }}>Top Follower Creatives</div>
        <Table
          dark
          headers={["Creative", "Follows", "CPF", "Spend"]}
          rows={ttData.topAds.map((a) => [
            <span style={{ color: a.best ? COLORS.green : COLORS.text }}>{a.name} {a.best && <Badge color="#fff">BEST ALL PLATFORMS</Badge>}</span>,
            <strong style={{ color: COLORS.green }}>{N(a.follows)}</strong>,
            <span style={{ color: a.best ? COLORS.green : COLORS.text }}>{R(a.cpf)}</span>,
            R(a.spend),
          ])}
        />
      </Card>

      <Card style={{ borderLeft: `3px solid ${COLORS.tt}`, background: "#14172a" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.tt, fontFamily: mono, marginBottom: 6 }}>OPTIMISATION FLAGS</div>
        <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 6 }}><Flag type="good">92.5% view completion</Flag>, exceptional creative resonance. Content format is working.</div>
          <div style={{ marginBottom: 6 }}><Flag type="good">Ayanda R1.28 CPF</Flag>, best community cost across all 3 platforms, 2.4x cheaper than next best Meta rate.</div>
          <div><Flag type="good">R6.34 CPM</Flag>, 2.7x more impressions per rand vs Facebook. TikTok is the scale engine.</div>
        </div>
      </Card>
    </div>
  );
}

function WeeklyTab() {
  return (
    <div>
      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: mono, marginBottom: 10 }}>Week-on-Week Meta Performance</div>
        <Table
          headers={["Week", "Results", "Daily Avg", "CPC", "CTR", "Spend"]}
          rows={weekData.map((w) => [
            <span>{w.week} <span style={{ color: COLORS.muted, fontSize: 10 }}>{w.dates}</span> {w.best && <Flag type="good">BEST</Flag>}</span>,
            <strong>{N(w.results)}</strong>,
            `${N(w.daily)}/day`,
            <span style={{ color: w.best ? COLORS.green : COLORS.text, fontWeight: w.best ? 700 : 400 }}>{R(w.cpc)}</span>,
            P(w.ctr),
            R(w.spend),
          ])}
        />
        <div style={{ marginTop: 12, padding: "10px 14px", background: "#004F71", borderRadius: 8, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          {[["Meta Total", ""], ["57,703", "results"], ["2,404/day", "avg"], ["R1.31", "avg CPC"], ["1.64%", "avg CTR"], ["R75,796", "spend"]].map(([v, l], i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.mtn }}>{v}</div>
              <div style={{ fontSize: 9, color: COLORS.mtn + "80" }}>{l}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Trend visualization */}
      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: mono, marginBottom: 14 }}>Daily Volume Trend</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120 }}>
          {weekData.map((w) => {
            const h = (w.daily / 2751) * 100;
            return (
              <div key={w.week} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: w.best ? COLORS.green : COLORS.text, marginBottom: 4 }}>{N(w.daily)}</div>
                <div style={{ height: h, background: w.best ? `linear-gradient(to top, ${COLORS.green}, ${COLORS.green}80)` : `linear-gradient(to top, ${COLORS.fb}, ${COLORS.fb}60)`, borderRadius: "6px 6px 0 0", transition: "height 0.8s ease" }} />
                <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 4 }}>{w.week}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>
          <Flag type="good">Consistent week-on-week growth</Flag>
          <span style={{ fontSize: 12, color: COLORS.muted, marginLeft: 8 }}>+28% daily volume from W1 to W4, CPC improved 5%</span>
        </div>
      </Card>

      <Card style={{ borderLeft: `3px solid ${COLORS.mtn}`, background: COLORS.cardAlt }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.mtn, fontFamily: mono, marginBottom: 6 }}>CAMPAIGN OUTLOOK</div>
        <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.8 }}>
          Campaign structure is mature and well-optimised. Every metric is trending in the right direction, rising volume, falling costs. 7 days remain to close out March with R41,087 budget remaining. No immediate action required; maintain current structure and monitor frequency.
        </div>
      </Card>
    </div>
  );
}

function InsightCard({ status, title, platform, children, action }) {
  const borderColor = status === "good" ? COLORS.green : status === "warn" ? COLORS.amber : COLORS.red;
  const statusLabel = status === "good" ? "PERFORMING" : status === "warn" ? "MONITOR" : "ACTION NEEDED";
  const platformColor = platform === "FB" ? COLORS.fb : platform === "IG" ? COLORS.ig : platform === "TT" ? COLORS.tt : COLORS.mtn;
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${borderColor}`, borderRadius: "0 10px 10px 0", padding: "18px 20px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Flag type={status}>{statusLabel}</Flag>
          {platform && <Badge color={platformColor}>{platform}</Badge>}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.white, marginBottom: 6, fontFamily: font }}>{title}</div>
      <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>{children}</div>
      {action && (
        <div style={{ marginTop: 10, padding: "8px 14px", background: borderColor + "15", borderRadius: 6, fontSize: 12, fontWeight: 700, color: borderColor, fontFamily: mono }}>
          → {action}
        </div>
      )}
    </div>
  );
}

function AnalystTab() {
  const flags = [
    { status: "good", title: "Meta CPC at Campaign-Best R1.28 in Week 4", platform: "META", action: "Maintain current structure, no changes needed for final week.",
      body: "Week 4 is delivering 2,751 results/day at R1.28 blended CPC, the lowest cost and highest daily volume of the entire 24-day period. Results have grown every single week from 2,153/day in W1 (+28%), while CPC improved 5%. This confirms a well-optimised, maturing campaign." },
    { status: "good", title: "GIF Format Outperforms All Meta App Install Creatives", platform: "FB", action: "Prioritise GIF creative format for April refresh. Brief new GIF variants on top offers.",
      body: "Scroll & Chill Bundles GIF leads with 7,671 clicks at R0.67 CPC, the single best cost-per-click in the Meta account. Showmax & Mins GIF follows at R0.64 CPC with a 2.78% CTR (highest in account). GIF consistently delivers top CTR on App Install." },
    { status: "good", title: "TikTok: 61.9% of All Impressions at R6.34 CPM", platform: "TT", action: "TikTok is the scale engine. Consider increasing TikTok allocation in April budget.",
      body: "7.59M impressions at 2.7x more volume per rand than Facebook. 92.5% video view completion rate confirms strong creative resonance. Combined with lowest CPF (R1.28 Ayanda), TikTok is both the reach and community growth leader." },
    { status: "good", title: "Ayanda R59/R69 Deals, Best Community Creative All Platforms", platform: "TT", action: "Scale Ayanda creative with new offer variants. Test Ayanda on IG Reels.",
      body: "3,249 TikTok follows at R1.28 CPF, 2.4x cheaper than the next best Meta community rate. This single creative is driving the most cost-efficient audience acquisition across all 3 platforms." },
    { status: "good", title: "Kabelo Rent to Own Dominates Instagram Followers", platform: "IG", action: "Test new Kabelo variants to diversify IG follower sources before fatigue sets in.",
      body: "4,449 follows at R1.30 CPF, accounts for 77% of all Instagram follows. Single creative concentration is an efficiency win now but a risk if fatigue hits." },
    { status: "good", title: "Instagram Delivers Best Meta CPM at R13.61", platform: "IG", action: "IG is 20% more efficient than FB for impressions. Ideal for awareness layering.",
      body: "R13.61 CPM vs Facebook's R17.03, a 20% efficiency advantage. Combined with strong community follow rates, Instagram is the most cost-efficient Meta impression channel." },
    { status: "good", title: "Three-Platform Community Grew to 19,214", platform: "ALL", action: "Community blended CPF at R2.60 is strong. Track retention and engagement post-campaign.",
      body: "TikTok: 7,558 follows (R1.94 CPF) · Facebook: 5,902 likes (R4.66 CPF) · Instagram: 5,754 followers (R1.36 CPF). Healthy distribution across platforms with TikTok leading volume and IG leading efficiency." },
    { status: "warn", title: "Instagram Frequency at 3.57x, Above Threshold", platform: "IG", action: "Introduce fresh creative for IG in final week or rotate existing underperformers out.",
      body: "3.57x average frequency on 24 days exceeds the 3x fatigue threshold. While CPF remains efficient, continued frequency growth without new creative risks rising costs and declining engagement." },
    { status: "warn", title: "Facebook Frequency Approaching 3x at 2.72x", platform: "FB", action: "Monitor daily. If frequency crosses 3x before month-end, pause lowest-performing adset.",
      body: "Currently at 2.72x with 7 days remaining. At current trajectory, frequency will reach ~3.5x by month-end. Performance is still improving (W4 is best week), so no immediate action, but this is the metric most likely to cause a late-campaign slowdown." },
    { status: "warn", title: "Kabelo Concentration Risk on Instagram", platform: "IG", action: "Brief 2–3 new IG follower creatives for April to reduce single-creative dependency.",
      body: "77% of all IG follows come from one Kabelo creative. If this ad fatigues, the entire IG follower pipeline is at risk. Diversification is the priority for the next cycle." },
  ];

  const scoreData = [
    { metric: "Budget Pacing", score: 95, status: "good", detail: "75.1% spend vs 77.4% time, slightly under-pacing (ideal)" },
    { metric: "CPC Trend", score: 92, status: "good", detail: "Improving every week, W4 at campaign-best R1.28" },
    { metric: "Creative Health", score: 85, status: "good", detail: "GIF format winning on FB, Ayanda winning on TT" },
    { metric: "Frequency Risk", score: 62, status: "warn", detail: "IG at 3.57x (above threshold), FB at 2.72x (approaching)" },
    { metric: "Community Growth", score: 90, status: "good", detail: "19,214 total at R2.60 blended CPF, strong across all 3" },
    { metric: "Platform Balance", score: 78, status: "good", detail: "TikTok dominates impressions (62%) but each platform has a role" },
  ];

  return (
    <div>
      {/* Campaign Health Score */}
      <Card style={{ background: "linear-gradient(135deg, #004F71, #002a3d)", border: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: COLORS.mtn + "80", fontFamily: mono }}>Campaign Health Score</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: COLORS.mtn, lineHeight: 1, marginTop: 4 }}>84<span style={{ fontSize: 18, color: COLORS.mtn + "80" }}>/100</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Flag type="good">STRONG PERFORMANCE</Flag>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>7 days remaining · R41,087 budget left</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {scoreData.map((s) => (
            <div key={s.metric} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.white }}>{s.metric}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: s.status === "good" ? COLORS.green : COLORS.amber, fontFamily: mono }}>{s.score}</span>
              </div>
              <MiniBar pct={s.score} color={s.status === "good" ? COLORS.green : COLORS.amber} />
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 4 }}>{s.detail}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Flags Filter Summary */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ background: COLORS.green + "15", border: `1px solid ${COLORS.green}30`, borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 100, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.green }}>7</div>
          <div style={{ fontSize: 9, color: COLORS.green, fontFamily: mono, letterSpacing: 1 }}>PERFORMING</div>
        </div>
        <div style={{ background: COLORS.amber + "15", border: `1px solid ${COLORS.amber}30`, borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 100, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.amber }}>3</div>
          <div style={{ fontSize: 9, color: COLORS.amber, fontFamily: mono, letterSpacing: 1 }}>MONITOR</div>
        </div>
        <div style={{ background: COLORS.red + "15", border: `1px solid ${COLORS.red}30`, borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 100, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.red }}>0</div>
          <div style={{ fontSize: 9, color: COLORS.red, fontFamily: mono, letterSpacing: 1 }}>ACTION NEEDED</div>
        </div>
      </div>

      {/* All Insight Cards */}
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: mono, marginBottom: 10 }}>Optimisation Flags & Strategic Reads</div>
      {flags.map((f, i) => (
        <InsightCard key={i} status={f.status} title={f.title} platform={f.platform} action={f.action}>
          {f.body}
        </InsightCard>
      ))}

      {/* April Recommendations */}
      <Card style={{ background: "linear-gradient(135deg, #1a1a2e, #16213e)", border: `1px solid ${COLORS.mtn}40`, marginTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.mtn, fontFamily: mono, letterSpacing: 2, marginBottom: 12 }}>APRIL PLANNING RECOMMENDATIONS</div>
        {[
          { num: "01", text: "Increase GIF format allocation on Facebook App Install, proven lowest CPC at R0.67" },
          { num: "02", text: "Brief 2–3 new Instagram follower creatives to reduce Kabelo single-creative dependency" },
          { num: "03", text: "Scale Ayanda R59/R69 on TikTok with new offer variants, R1.28 CPF is best in campaign" },
          { num: "04", text: "Consider increasing TikTok budget share, delivers 2.7x more impressions per rand than FB" },
          { num: "05", text: "Monitor frequency caps: set alerts at 3.5x on FB and 4x on IG to trigger creative rotation" },
        ].map((r) => (
          <div key={r.num} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS.mtn + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: COLORS.mtn, fontFamily: mono, flexShrink: 0 }}>{r.num}</div>
            <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.6 }}>{r.text}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview", icon: "◉" },
  { id: "facebook", label: "Facebook", icon: "f" },
  { id: "instagram", label: "Instagram", icon: "◎" },
  { id: "tiktok", label: "TikTok", icon: "♪" },
  { id: "weekly", label: "Weekly", icon: "▤" },
  { id: "analyst", label: "Data Analyst", icon: "⚡" },
];

export default function Dashboard() {
  const [tab, setTab] = useState("overview");

  return (
    <div style={{ fontFamily: font, background: COLORS.bg, color: COLORS.text, minHeight: "100vh", padding: "0" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "linear-gradient(90deg, #004F71, #002a3d)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `2px solid ${COLORS.mtn}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: `linear-gradient(135deg, #E8231A, #FF7A00)`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: "#fff" }}>GAS</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: COLORS.mtn, letterSpacing: -0.5 }}>MEDIA ON GAS</div>
            <div style={{ fontSize: 9, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase" }}>MTN MoMo · March 2026</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Badge color={COLORS.fb}>Facebook</Badge>
          <Badge color={COLORS.ig}>Instagram</Badge>
          <Badge color="#333355">TikTok</Badge>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "12px 8px", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${COLORS.mtn}` : "2px solid transparent",
              color: tab === t.id ? COLORS.mtn : COLORS.muted, fontFamily: font, fontSize: 12, fontWeight: 700, cursor: "pointer",
              transition: "all 0.2s", letterSpacing: 0.5, whiteSpace: "nowrap",
            }}
          >
            <span style={{ marginRight: 4 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        {tab === "overview" && <OverviewTab />}
        {tab === "facebook" && <FacebookTab />}
        {tab === "instagram" && <InstagramTab />}
        {tab === "tiktok" && <TikTokTab />}
        {tab === "weekly" && <WeeklyTab />}
        {tab === "analyst" && <AnalystTab />}
      </div>

      {/* Footer */}
      <div style={{ padding: "16px 24px", borderTop: `1px solid ${COLORS.border}`, textAlign: "center" }}>
        <div style={{ fontSize: 10, color: COLORS.muted }}>Meta data: 1–24 Mar 2026 · TikTok data: 1–23 Mar 2026 · All figures in ZAR · Confidential</div>
        <div style={{ fontSize: 10, color: COLORS.muted + "60", marginTop: 4 }}>GAS Marketing Automation · grow@gasmarketing.co.za</div>
      </div>
    </div>
  );
}
