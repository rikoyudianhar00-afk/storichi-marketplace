function starPoints(cx, cy, outerRadius, innerRadius, spikes) {
  return Array.from({ length: spikes * 2 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / spikes;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    return `${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`;
  }).join(" ");
}

export default function VerifiedBadge({ color = "#2454FF", size = 15, label = "Terverifikasi" }) {
  return (
    <svg
      className="verified-badge"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      title={label}
    >
      <polygon points={starPoints(12, 12, 11.7, 10.1, 16)} fill={color} />
      <path d="m7.2 12.1 3 3 6.6-6.6" fill="none" stroke="#fff" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
