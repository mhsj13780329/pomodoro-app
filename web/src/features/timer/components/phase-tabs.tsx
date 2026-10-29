import { PHASES, type Phase } from "../logic";
import { strings } from "../strings.fa";

type Props = {
  phase: Phase;
  onSelect: (phase: Phase) => void;
};

export function PhaseTabs({ phase, onSelect }: Props) {
  return (
    <div role="tablist" className="flex w-full gap-1 rounded-track bg-surface-2 p-1">
      {PHASES.map((item) => {
        const selected = item === phase;
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(item)}
            className={`min-h-11 flex-1 cursor-pointer rounded-tab px-1 text-sm font-semibold md:min-h-12 md:text-[15px] ${
              selected ? "bg-[var(--phase)] text-white" : "text-muted"
            }`}
          >
            {strings.phases[item]}
          </button>
        );
      })}
    </div>
  );
}
