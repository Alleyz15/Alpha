export default function SignalGrid() {
  return (
    <svg className="signal-grid" viewBox="0 0 720 520" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="signal-grid-gradient" x1="70" y1="70" x2="650" y2="470" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--signal)" />
          <stop offset="1" stopColor="var(--primary)" />
        </linearGradient>
        <radialGradient id="signal-grid-glow">
          <stop stopColor="var(--signal)" stopOpacity=".55" />
          <stop offset="1" stopColor="var(--signal)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className="signal-grid__mesh">
        {[80, 160, 240, 320, 400, 480, 560, 640].map((x) => <path key={`v-${x}`} d={`M${x} 35V485`} />)}
        {[70, 140, 210, 280, 350, 420].map((y) => <path key={`h-${y}`} d={`M40 ${y}H680`} />)}
      </g>

      <path className="signal-grid__path signal-grid__route--one" d="M70 390C150 390 167 305 244 305S339 220 414 220 504 118 650 118" />
      <path className="signal-grid__path signal-grid__route--two" d="M70 448C170 448 193 392 290 392s98-96 188-96 89 67 172 67" />
      <path className="signal-grid__floor" d="M70 342H650" />
      <text x="82" y="328" className="signal-grid__label">DEFINED FLOOR</text>

      <circle className="signal-grid__halo" cx="414" cy="220" r="54" fill="url(#signal-grid-glow)" />
      <circle className="signal-grid__node signal-grid__node--one" cx="70" cy="390" r="7" />
      <circle className="signal-grid__node signal-grid__node--two" cx="244" cy="305" r="7" />
      <circle className="signal-grid__node signal-grid__node--three" cx="414" cy="220" r="7" />
      <circle className="signal-grid__node signal-grid__node--four" cx="650" cy="118" r="7" />
      <circle className="signal-grid__pulse signal-grid__pulse--one" cx="70" cy="390" r="5" />
      <circle className="signal-grid__pulse signal-grid__pulse--two" cx="70" cy="448" r="4" />
    </svg>
  );
}
