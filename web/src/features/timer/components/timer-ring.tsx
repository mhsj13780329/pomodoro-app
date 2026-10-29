const RADIUS = 122;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Props = {
  progress: number;
  clock: string;
  subtitle: string;
};

export function TimerRing({ progress, clock, subtitle }: Props) {
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = CIRCUMFERENCE * (1 - clamped);

  return (
    <div
      role="timer"
      aria-label={`${clock} ${subtitle}`}
      className="relative mx-auto size-[280px] md:size-[340px]"
    >
      <svg
        viewBox="0 0 280 280"
        className="absolute top-0 bottom-0 start-0 end-0 size-full"
        aria-hidden="true"
      >
        <circle cx="140" cy="140" r={RADIUS} stroke="var(--ring-track)" strokeWidth="12" fill="none" />
        {clamped > 0.001 ? (
          <circle
            cx="140"
            cy="140"
            r={RADIUS}
            stroke="var(--phase)"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 140 140)"
          />
        ) : null}
      </svg>
      <div className="absolute top-0 bottom-0 start-0 end-0 flex flex-col items-center justify-center gap-0.5 md:gap-1">
        <span dir="ltr" className="text-[64px] font-semibold leading-none tracking-wide tabular-nums md:text-[76px]">
          {clock}
        </span>
        <span className="text-[15px] text-muted md:text-base">{subtitle}</span>
      </div>
    </div>
  );
}
