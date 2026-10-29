import type { TimerCore } from "../logic";

const DOT_CAP = 32;

type Kind = "done" | "current" | "upcoming";

function kindOf(index: number, state: TimerCore): Kind {
  const count = state.completedFocusInCycle;
  if (state.phase === "focus" && index === count && count < state.longBreakEvery) return "current";
  if (index < count) return "done";
  return "upcoming";
}

const dotClass: Record<Kind, string> = {
  done: "border-[var(--phase)] bg-[var(--phase)]",
  current: "border-[var(--phase)] bg-transparent",
  upcoming: "border-line-strong bg-transparent",
};

type Props = {
  state: TimerCore;
  label: string;
};

export function CycleDots({ state, label }: Props) {
  const count = Math.min(state.longBreakEvery, DOT_CAP);
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={`size-3 rounded-full border-2 ${dotClass[kindOf(index, state)]}`} />
      ))}
    </div>
  );
}
