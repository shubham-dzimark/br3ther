export function Stars({
  rating,
  count,
  size = 14,
  showCount = true,
}: {
  rating: number;
  count?: number;
  size?: number;
  showCount?: boolean;
}) {
  const rounded = Math.round(rating * 2) / 2; // nearest half star

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex"
        role="img"
        aria-label={`Rated ${rating.toFixed(1)} out of 5`}
      >
        {[1, 2, 3, 4, 5].map((i) => {
          const fill =
            rounded >= i ? "full" : rounded >= i - 0.5 ? "half" : "empty";
          return (
            <svg
              key={i}
              width={size}
              height={size}
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="shrink-0"
            >
              <defs>
                <linearGradient id={`half-${size}-${i}`}>
                  <stop offset="50%" stopColor="#F0B429" />
                  <stop offset="50%" stopColor="#E2E8F0" />
                </linearGradient>
              </defs>
              <path
                d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8z"
                fill={
                  fill === "full"
                    ? "#F0B429"
                    : fill === "half"
                      ? `url(#half-${size}-${i})`
                      : "#E2E8F0"
                }
              />
            </svg>
          );
        })}
      </span>
      {showCount && count != null ? (
        <span className="text-sm text-slate-500">
          {count === 0 ? "No reviews" : `(${count})`}
        </span>
      ) : null}
    </span>
  );
}
