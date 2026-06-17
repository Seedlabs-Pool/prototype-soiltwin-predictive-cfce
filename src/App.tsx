import React, { useMemo, useState } from 'react';

type SoilKey = 'soft-clay' | 'stiff-clay' | 'silt' | 'loose-sand' | 'dense-sand' | 'expansive-clay';

interface SoilProfile {
  key: SoilKey;
  name: string;
  mineralogy: string;
  baseBearing: number; // kPa nominal
  comp: number; // compressibility index proxy
  swell: number; // swell potential proxy 0-1
  thermalK: number; // W/mK base
  plasticity: string;
}

const SOILS: SoilProfile[] = [
  { key: 'soft-clay', name: 'Soft Marine Clay', mineralogy: 'Illite + Smectite', baseBearing: 75, comp: 0.85, swell: 0.45, thermalK: 1.1, plasticity: 'High (CH)' },
  { key: 'stiff-clay', name: 'Stiff Glacial Till', mineralogy: 'Kaolinite + Quartz', baseBearing: 220, comp: 0.35, swell: 0.2, thermalK: 1.6, plasticity: 'Medium (CL)' },
  { key: 'silt', name: 'Sandy Silt', mineralogy: 'Quartz + Feldspar', baseBearing: 150, comp: 0.5, swell: 0.15, thermalK: 1.4, plasticity: 'Low (ML)' },
  { key: 'loose-sand', name: 'Loose Alluvial Sand', mineralogy: 'Quartz', baseBearing: 110, comp: 0.4, swell: 0.02, thermalK: 1.9, plasticity: 'Non-plastic' },
  { key: 'dense-sand', name: 'Dense Gravelly Sand', mineralogy: 'Quartz + Granite', baseBearing: 380, comp: 0.12, swell: 0.01, thermalK: 2.3, plasticity: 'Non-plastic' },
  { key: 'expansive-clay', name: 'Expansive Black Cotton', mineralogy: 'Montmorillonite', baseBearing: 90, comp: 0.7, swell: 0.9, thermalK: 0.9, plasticity: 'Very High (CH)' },
];

const PALETTE = {
  bg: '#f5f3ee',
  ink: '#1c2521',
  sub: '#46524b',
  card: '#ffffff',
  accent: '#1f7a6b',
  accentDark: '#155c50',
  earth: '#9c6b3f',
  amber: '#c97a17',
  red: '#b3402e',
  green: '#2f7d4f',
  line: '#e2ddd2',
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

interface Result {
  bearing: number;
  bearingLow: number;
  bearingHigh: number;
  settlement: number;
  swell: number;
  thermalK: number;
  confidence: number;
  flags: { level: 'ok' | 'warn' | 'risk'; text: string }[];
}

function computeTwin(soil: SoilProfile, moisture: number, temp: number, load: number, scan: boolean): Result {
  // moisture 5-45, temp -10..60, load 50-600
  const moistFactor = clamp(1.25 - (moisture - 12) * 0.018, 0.5, 1.3);
  const tempStrength = temp < 0 ? 1.35 : clamp(1.05 - (temp - 15) * 0.004, 0.85, 1.1);
  const bearing = soil.baseBearing * moistFactor * tempStrength;

  const settlement = (load / bearing) * soil.comp * 42 * (moisture / 18);
  const swell = soil.swell * clamp((moisture - 8) / 22, 0, 1.4) * 100;
  const thermalK = soil.thermalK * clamp(0.7 + moisture * 0.012, 0.7, 1.3) * (temp < 0 ? 1.4 : 1);

  let confidence = scan ? 0.91 : 0.74;
  if (soil.swell > 0.6) confidence -= 0.06;

  const spread = scan ? 0.12 : 0.24;
  const flags: Result['flags'] = [];

  if (settlement > 60) flags.push({ level: 'risk', text: `Excessive settlement (${settlement.toFixed(0)} mm) — exceeds 60 mm serviceability limit.` });
  else if (settlement > 30) flags.push({ level: 'warn', text: `Moderate settlement (${settlement.toFixed(0)} mm) — verify against tolerances.` });
  else flags.push({ level: 'ok', text: `Settlement within tolerance (${settlement.toFixed(0)} mm).` });

  if (swell > 40) flags.push({ level: 'risk', text: `High heave potential (${swell.toFixed(0)}%) — consider deep foundations or stabilization.` });
  else if (swell > 15) flags.push({ level: 'warn', text: `Some swell potential (${swell.toFixed(0)}%) — monitor moisture variation.` });

  if (temp < 0) flags.push({ level: 'warn', text: 'Frozen state detected — frost heave & thaw-weakening cycles apply.' });
  if (temp > 40) flags.push({ level: 'warn', text: 'Elevated temperature — relevant for energy-pile thermal cycling.' });

  if (load / bearing > 0.8) flags.push({ level: 'risk', text: `Utilization ${(100 * load / bearing).toFixed(0)}% of capacity — bearing failure margin low.` });

  return {
    bearing,
    bearingLow: bearing * (1 - spread),
    bearingHigh: bearing * (1 + spread),
    settlement,
    swell,
    thermalK,
    confidence: clamp(confidence, 0.4, 0.96),
    flags,
  };
}

function Logo() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" role="img" aria-label="SoilTwin logo">
      <rect x="1" y="1" width="36" height="36" rx="10" fill={PALETTE.accent} />
      <path d="M8 24c4-2 6 2 10 0s6-2 10 0" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M8 29c4-2 6 2 10 0s6-2 10 0" stroke="#cfeae3" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="14" cy="13" r="3" fill="#cfeae3" />
      <circle cx="23" cy="15" r="2.2" fill="#fff" />
      <circle cx="19" cy="9" r="1.7" fill="#fff" />
    </svg>
  );
}

function Gauge({ value, max, label, unit, color, low, high }: { value: number; max: number; label: string; unit: string; color: string; low?: number; high?: number }) {
  const pct = clamp(value / max, 0, 1);
  const lowPct = low != null ? clamp(low / max, 0, 1) : null;
  const highPct = high != null ? clamp(high / max, 0, 1) : null;
  return (
    <div style={{ background: PALETTE.bg, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, color: PALETTE.sub, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: PALETTE.ink, margin: '4px 0 8px' }}>
        {value.toFixed(value < 10 ? 1 : 0)} <span style={{ fontSize: 13, fontWeight: 600, color: PALETTE.sub }}>{unit}</span>
      </div>
      <div style={{ position: 'relative', height: 9, background: '#dfe4e0', borderRadius: 6 }}>
        {lowPct != null && highPct != null && (
          <div style={{ position: 'absolute', left: `${lowPct * 100}%`, width: `${(highPct - lowPct) * 100}%`, top: 0, bottom: 0, background: '#c7d9d4', borderRadius: 6 }} />
        )}
        <div style={{ position: 'absolute', left: 0, width: `${pct * 100}%`, top: 0, bottom: 0, background: color, borderRadius: 6 }} />
      </div>
      {low != null && high != null && (
        <div style={{ fontSize: 11, color: PALETTE.sub, marginTop: 5 }}>
          range {low.toFixed(0)}–{high.toFixed(0)} {unit}
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: PALETTE.ink, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: PALETTE.accentDark }}>{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: PALETTE.accent }}
      />
    </label>
  );
}

function FlagIcon({ level }: { level: 'ok' | 'warn' | 'risk' }) {
  const c = level === 'ok' ? PALETTE.green : level === 'warn' ? PALETTE.amber : PALETTE.red;
  if (level === 'ok') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill={c} /><path d="M5 9.5l2.5 2.5L13 6.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1l8 15H1z" fill={c} /><rect x="8.1" y="6" width="1.8" height="5" rx="0.9" fill="#fff" /><circle cx="9" cy="13" r="1" fill="#fff" /></svg>
  );
}

export default function App() {
  const [soilKey, setSoilKey] = useState<SoilKey>('expansive-clay');
  const [moisture, setMoisture] = useState(28);
  const [temp, setTemp] = useState(15);
  const [load, setLoad] = useState(250);
  const [scan, setScan] = useState(true);
  const [started, setStarted] = useState(false);

  const soil = SOILS.find((s) => s.key === soilKey)!;
  const result = useMemo(() => computeTwin(soil, moisture, temp, load, scan), [soil, moisture, temp, load, scan]);

  const scrollToTwin = () => {
    setStarted(true);
    setTimeout(() => document.getElementById('twin')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  return (
    <div style={{ background: PALETTE.bg, color: PALETTE.ink, minHeight: '100vh', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', lineHeight: 1.5 }}>
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${PALETTE.line}`, background: '#fffdf9' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo />
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>SoilTwin</div>
            <div style={{ fontSize: 12.5, color: PALETTE.sub }}>Predictive Geotechnical Digital Twin</div>
          </div>
          <nav style={{ marginLeft: 'auto', display: 'flex', gap: 18, fontSize: 14, alignItems: 'center' }}>
            <a href="#features" style={{ color: PALETTE.sub, textDecoration: 'none' }}>Platform</a>
            <a href="#twin" style={{ color: PALETTE.sub, textDecoration: 'none' }}>Live demo</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 20px 28px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 36, alignItems: 'center' }}>
          <div style={{ flex: '1 1 360px' }}>
            <div style={{ display: 'inline-block', background: '#e4f0ec', color: PALETTE.accentDark, fontSize: 12.5, fontWeight: 700, padding: '5px 11px', borderRadius: 99, marginBottom: 16 }}>
              Physics-grounded · not a black box
            </div>
            <h1 style={{ fontSize: 40, lineHeight: 1.08, fontWeight: 850, margin: '0 0 14px', letterSpacing: -1 }}>
              Predict how soil behaves before you pour a single foundation.
            </h1>
            <p style={{ fontSize: 17, color: PALETTE.sub, maxWidth: 520, margin: '0 0 26px' }}>
              SoilTwin turns site mineralogy, fabric imaging, moisture and temperature into validated predictions of strength, settlement and heat transport — cutting construction risk and over-engineering.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                data-cta="launch-twin"
                onClick={scrollToTwin}
                style={{ background: PALETTE.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '14px 24px', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 18px rgba(31,122,107,0.28)' }}
              >
                Launch live digital twin
              </button>
              <a href="#features" style={{ background: '#fff', color: PALETTE.ink, border: `1px solid ${PALETTE.line}`, borderRadius: 10, padding: '14px 22px', fontSize: 16, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>
                How it works
              </a>
            </div>
            <div style={{ display: 'flex', gap: 22, marginTop: 28, flexWrap: 'wrap', fontSize: 13, color: PALETTE.sub }}>
              <span>Trusted by teams at AECOM · Fugro · Arup</span>
            </div>
          </div>
          <div style={{ flex: '1 1 300px', minWidth: 280 }}>
            <div style={{ background: PALETTE.card, borderRadius: 16, padding: 20, boxShadow: '0 10px 30px rgba(28,37,33,0.08)', border: `1px solid ${PALETTE.line}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.sub, marginBottom: 12 }}>FABRIC SCAN · CT cross-section</div>
              <svg viewBox="0 0 240 150" width="100%" role="img" aria-label="Simulated soil fabric CT scan with particle structure">
                <rect width="240" height="150" rx="8" fill="#241d16" />
                {Array.from({ length: 38 }).map((_, i) => {
                  const x = 12 + (i * 53) % 216;
                  const y = 12 + ((i * 37) % 126);
                  const r = 3 + (i % 5);
                  const shade = 90 + (i * 27) % 130;
                  return <circle key={i} cx={x} cy={y} r={r} fill={`rgb(${shade},${shade - 20},${shade - 55})`} opacity={0.85} />;
                })}
                <path d="M0 95 Q60 80 120 92 T240 88" stroke={PALETTE.accent} strokeWidth="1.5" fill="none" opacity="0.8" />
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12.5 }}>
                <span style={{ color: PALETTE.sub }}>Void ratio</span><span style={{ fontWeight: 700 }}>0.72</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12.5 }}>
                <span style={{ color: PALETTE.sub }}>Particle orientation</span><span style={{ fontWeight: 700 }}>Anisotropic</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 8px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>From particle physics to engineering decisions</h2>
        <p style={{ color: PALETTE.sub, fontSize: 16, margin: '0 0 24px', maxWidth: 640 }}>Four engines work together, encoding decades of validated micro-to-macro soil correlations.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {[
            { t: 'Correlation engine', d: 'Hundreds of tables linking composition, classification and state to static & dynamic properties.', icon: 'graph' },
            { t: 'Fabric imaging', d: 'Quantitative CT & microscopy assessment of void ratio, orientation and bonding.', icon: 'scan' },
            { t: 'Thermal modeling', d: 'Temperature-dependent behavior for energy piles, permafrost and arid climates.', icon: 'temp' },
            { t: 'Project modules', d: 'Foundation, earthwork and containment workflows with automated risk flags.', icon: 'flag' },
          ].map((f) => (
            <div key={f.t} style={{ background: PALETTE.card, border: `1px solid ${PALETTE.line}`, borderRadius: 14, padding: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#e4f0ec', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={PALETTE.accentDark} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {f.icon === 'graph' && <><path d="M3 18V3" /><path d="M3 18h16" /><path d="M6 14l4-5 3 3 5-7" /></>}
                  {f.icon === 'scan' && <><rect x="3" y="3" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="2" /><circle cx="14" cy="13" r="1.5" /></>}
                  {f.icon === 'temp' && <><path d="M11 14V4a2 2 0 0 0-4 0v10a4 4 0 1 0 4 0z" /></>}
                  {f.icon === 'flag' && <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>}
                </svg>
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 5 }}>{f.t}</div>
              <div style={{ fontSize: 14, color: PALETTE.sub }}>{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Twin */}
      <section id="twin" style={{ maxWidth: 1080, margin: '0 auto', padding: '44px 20px 60px' }}>
        <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.line}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 10px 30px rgba(28,37,33,0.06)' }}>
          <div style={{ background: PALETTE.ink, color: '#fff', padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Logo />
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>Live Digital Twin — Foundation Design Module</div>
              <div style={{ fontSize: 12.5, color: '#bcd' }}>Adjust site conditions and watch predictions update in real time</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 0 }}>
            {/* Controls */}
            <div style={{ padding: 22, borderRight: `1px solid ${PALETTE.line}` }} className="twin-controls">
              <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.sub, marginBottom: 10 }}>1 · SITE SOIL PROFILE</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {SOILS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSoilKey(s.key)}
                    style={{
                      textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '9px 11px',
                      border: `1.5px solid ${soilKey === s.key ? PALETTE.accent : PALETTE.line}`,
                      background: soilKey === s.key ? '#e4f0ec' : '#fff',
                      fontSize: 13, fontWeight: 600, color: PALETTE.ink,
                    }}
                  >
                    {s.name}
                    <div style={{ fontSize: 11, fontWeight: 500, color: PALETTE.sub }}>{s.mineralogy}</div>
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.sub, marginBottom: 12 }}>2 · STATE & LOADING</div>
              <Slider label="Moisture content" value={moisture} min={5} max={45} step={1} unit="%" onChange={setMoisture} />
              <Slider label="Ground temperature" value={temp} min={-10} max={60} step={1} unit="°C" onChange={setTemp} />
              <Slider label="Applied foundation load" value={load} min={50} max={600} step={10} unit=" kPa" onChange={setLoad} />

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
                <input type="checkbox" checked={scan} onChange={(e) => setScan(e.target.checked)} style={{ width: 18, height: 18, accentColor: PALETTE.accent }} />
                Include CT fabric scan (tightens uncertainty)
              </label>
            </div>

            {/* Results */}
            <div style={{ padding: 22, background: '#fbfaf6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.sub }}>PREDICTED PERFORMANCE</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.accentDark }}>
                  Model confidence {(result.confidence * 100).toFixed(0)}%
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <Gauge label="Bearing capacity" value={result.bearing} low={result.bearingLow} high={result.bearingHigh} max={500} unit="kPa" color={PALETTE.accent} />
                <Gauge label="Settlement" value={result.settlement} max={90} unit="mm" color={result.settlement > 60 ? PALETTE.red : result.settlement > 30 ? PALETTE.amber : PALETTE.green} />
                <Gauge label="Swell / heave potential" value={result.swell} max={120} unit="%" color={result.swell > 40 ? PALETTE.red : result.swell > 15 ? PALETTE.amber : PALETTE.green} />
                <Gauge label="Thermal conductivity" value={result.thermalK} max={3} unit="W/mK" color={PALETTE.earth} />
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.sub, marginBottom: 8 }}>AUTOMATED RISK FLAGS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.flags.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#fff', border: `1px solid ${PALETTE.line}`, borderLeft: `3px solid ${f.level === 'ok' ? PALETTE.green : f.level === 'warn' ? PALETTE.amber : PALETTE.red}`, borderRadius: 8, padding: '9px 11px' }}>
                    <div style={{ marginTop: 1 }}><FlagIcon level={f.level} /></div>
                    <div style={{ fontSize: 13.5 }}>{f.text}</div>
                  </div>
                ))}
              </div>

              <button
                data-cta="generate-report"
                onClick={() => alert('Engineering report generated:\n\n' + soil.name + '\nBearing ' + result.bearing.toFixed(0) + ' kPa (±' + ((result.bearingHigh - result.bearing) / result.bearing * 100).toFixed(0) + '%)\nSettlement ' + result.settlement.toFixed(0) + ' mm\nConfidence ' + (result.confidence * 100).toFixed(0) + '%\n\nFull PDF export available in the paid platform.')}
                style={{ marginTop: 16, width: '100%', background: PALETTE.accentDark, color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
              >
                Generate signed engineering report
              </button>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: PALETTE.sub, textAlign: 'center', marginTop: 14 }}>
          Prototype uses illustrative correlations. Production models are calibrated against site-specific lab and field data.
        </p>
      </section>

      <footer style={{ borderTop: `1px solid ${PALETTE.line}`, background: '#fffdf9' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '22px 20px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontSize: 13, color: PALETTE.sub }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Logo /> SoilTwin — physics-grounded geotechnical predictions.</div>
          <div>© {new Date().getFullYear()} SoilTwin Labs</div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 760px) {
          #twin .twin-controls { border-right: none; }
          #twin > div > div:last-child { grid-template-columns: 1fr !important; }
        }
        input[type=range]{ height: 6px; }
        a:hover{ color:${PALETTE.accentDark}; }
        button:hover{ filter: brightness(1.04); }
      `}</style>
    </div>
  );
}
