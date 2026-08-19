export function StarDisplay({ rating, count }) {
  const rounded = Math.round(rating || 0);
  return (
    <span className="star-display">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i < rounded ? "#FFB020" : "none"}>
          <path
            d="m12 3 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 21l1.2-6.5-4.8-4.6 6.6-.9L12 3Z"
            stroke="#FFB020"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      ))}
      {typeof count === "number" && <span className="star-count">({count})</span>}
    </span>
  );
}

export function StarInput({ value, onChange }) {
  return (
    <span className="star-input">
      {Array.from({ length: 5 }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Beri ${i + 1} bintang`}
          onClick={() => onChange(i + 1)}
          className="star-input-btn"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill={i < value ? "#FFB020" : "none"}>
            <path
              d="m12 3 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 21l1.2-6.5-4.8-4.6 6.6-.9L12 3Z"
              stroke="#FFB020"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </span>
  );
}
