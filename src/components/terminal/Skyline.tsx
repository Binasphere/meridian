/**
 * A faint Manhattan skyline behind the chart.
 *
 * Drawn in the ink colour at a few percent opacity, so it reads as depth in
 * the empty pane and never competes with a candle: Empire State, Chrysler and
 * One World Trade Center among the blocks. Pure silhouette, one fill, no
 * detail — at this strength anything finer turns to noise.
 */
const BLOCKS: ReadonlyArray<[x: number, w: number, h: number]> = [
  [0, 58, 92], [52, 42, 132], [90, 56, 106], [140, 36, 162], [172, 52, 120],
  [268, 46, 142], [310, 32, 112], [424, 50, 126], [470, 36, 172],
  [502, 58, 116], [556, 24, 196], [576, 56, 136], [628, 42, 100],
  [742, 50, 146], [788, 42, 112], [826, 60, 160], [882, 36, 126],
  [914, 56, 96], [964, 46, 176], [1006, 30, 130], [1032, 60, 110],
  [1088, 40, 152], [1124, 50, 102], [1170, 40, 132],
];

/** A second, lower row set back behind the first, for depth. */
const BACK: ReadonlyArray<[x: number, w: number, h: number]> = [
  [20, 70, 150], [120, 60, 190], [200, 70, 150], [300, 50, 175],
  [440, 60, 200], [600, 70, 180], [760, 60, 200], [860, 70, 190],
  [990, 60, 205], [1080, 80, 180],
];

export function Skyline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 300"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      aria-hidden
      focusable="false"
    >
      <g fill="currentColor" opacity={0.55}>
        {BACK.map(([x, w, h]) => (
          <rect key={`b${x}`} x={x} y={300 - h} width={w} height={h} />
        ))}
      </g>
      <g fill="currentColor">
        {BLOCKS.map(([x, w, h]) => (
          <rect key={x} x={x} y={300 - h} width={w} height={h} />
        ))}

        {/* Chrysler: body, setback, stepped crown, needle. */}
        <rect x={224} y={128} width={42} height={172} />
        <rect x={231} y={110} width={28} height={20} />
        <polygon points="229,112 235,96 239,82 243,70 245,24 247,70 251,82 255,96 261,112" />

        {/* Empire State: base, setbacks, mast. */}
        <rect x={338} y={150} width={84} height={150} />
        <rect x={352} y={112} width={56} height={40} />
        <rect x={364} y={62} width={32} height={52} />
        <rect x={371} y={46} width={18} height={18} />
        <rect x={378} y={8} width={4} height={40} />

        {/* One World Trade Center: tapering prism, antenna. */}
        <polygon points="680,300 687,96 710,52 733,96 740,300" />
        <rect x={709} y={4} width={2.5} height={50} />
      </g>
    </svg>
  );
}
