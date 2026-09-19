export default function Brand() {
  return (
    <div className="brand-lockup" aria-label="Royal Square Financial">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M16 4a12 12 0 0 0 0 24"
          fill="none"
          stroke="var(--taupe-hi)"
          strokeWidth="4.5"
        />
        <path
          d="M16 28a12 12 0 0 0 0-24"
          fill="none"
          stroke="var(--red-text)"
          strokeWidth="4.5"
        />
      </svg>
      <div>
        <b>Royal Square</b>
        <span>Financial</span>
      </div>
    </div>
  );
}
