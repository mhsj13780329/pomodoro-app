import { PHASES, type Phase } from "../logic";
import { strings } from "../strings.fa";

type Props = {
  checked: Record<Phase, boolean>;
  onToggle: (phase: Phase) => void;
};

export function AutoStartSwitches({ checked, onToggle }: Props) {
  return (
    <div className="w-full rounded-control border border-line bg-surface px-3 py-2.5 md:rounded-sheet md:bg-ground md:px-4 md:py-3">
      <div className="mb-1.5 text-[13px] text-muted">{strings.autoStart}</div>
      <div className="flex gap-2">
        {PHASES.map((phase) => {
          const on = checked[phase];
          return (
            <button
              key={phase}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => onToggle(phase)}
              className="flex min-h-11 flex-1 cursor-pointer flex-col items-center gap-1.5 border-0 bg-transparent p-0 text-ink"
            >
              <span className="text-xs font-medium md:text-[13px]">{strings.phases[phase]}</span>
              <span
                className={`flex h-[22px] w-10 items-center rounded-full p-[3px] ${
                  on ? "justify-end bg-[var(--phase)]" : "justify-start bg-switch-off"
                }`}
              >
                <span className="size-4 rounded-full bg-white" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
