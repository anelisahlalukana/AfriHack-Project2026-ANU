// Shared look for the dashboard charts. The palette lives in App.css (.dash-page); the fallbacks
// here are the same values, so a chart still draws correctly outside that wrapper.
export const COLORS = {
  normal: 'var(--dash-blue, #3b78e7)',
  // Risk profiles run cautious to bold as one blue scale, lightest to darkest.
  conservative: 'var(--dash-mist, #cfe0fb)',
  moderate: 'var(--dash-sky, #8fb2f2)',
  balanced: 'var(--dash-blue, #3b78e7)',
  growth: 'var(--dash-blue-deep, #2a55b8)',
  aggressive: 'var(--dash-navy, #16305f)',
  not_assessed: 'var(--dash-slate-light, #c5cedb)',
  other: 'var(--dash-slate, #8b98ad)',
}

// The "Needs attention" bars are a deeper red and blue than the rest of the dashboard's palette.
export const ATTENTION = {
  urgent: 'var(--dash-red-dark, #b3222b)',
  normal: 'var(--dash-blue-dark, #1d429c)',
}

export const AXIS ={ fontSize: 12, fill: 'var(--muted, #667085)' }
export const VALUE_LABEL = { fontSize: 12, fontWeight: 600, fill: 'var(--text-2, #344054)' }
export const CURSOR = { fill: 'var(--dash-hover, #f3f6fb)' }
export const TOOLTIP = {
  background: 'var(--card, #fff)', border: '1px solid var(--border-strong, #cfd9e6)', borderRadius: 10,
  boxShadow: 'var(--shadow, 0 6px 20px rgba(16,40,80,.12))', fontSize: 13, padding: '8px 12px',
}
// The area chart: a smooth blue line with hollow dots over a soft gradient, and a dashed grey line
// for the period before.
export const TREND = {
  line: COLORS.normal,
  previous: 'var(--dash-slate-light, #c5cedb)',
  grid: 'var(--dash-grid, #eef1f6)',
  dot: { r: 4, fill: '#fff', stroke: COLORS.normal, strokeWidth: 2 },
  activeDot: { r: 6, fill: '#fff', stroke: COLORS.normal, strokeWidth: 2.5 },
}

// The pale lane behind each bar, so a small value still reads against the full scale.
export const BAR_LANE = { fill: 'var(--dash-track, #edf1f7)', radius: 6 }

// Bars are redrawn from fresh objects every time the live dashboard refreshes, so animation would
// replay every 15 seconds. Switch it off.
export const STATIC = { isAnimationActive: false }
