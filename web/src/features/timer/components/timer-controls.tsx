import { useTranslations } from "next-intl";
import { IconPause, IconPlay, IconReset, IconSkip } from "@/components/icons";

type Props = {
  running: boolean;
  onToggle: () => void;
  onReset: () => void;
  onSkip: () => void;
};

export function TimerControls({ running, onToggle, onReset, onSkip }: Props) {
  const t = useTranslations("timer");
  return (
    <div className="flex items-center justify-center gap-7 md:gap-8">
      <button
        type="button"
        aria-label={t("reset")}
        onClick={onReset}
        className="flex size-14 cursor-pointer items-center justify-center rounded-full border border-line bg-surface p-0 text-ink md:bg-ground"
      >
        <IconReset className="size-6" />
      </button>
      <button
        type="button"
        aria-label={running ? t("pause") : t("play")}
        onClick={onToggle}
        className="flex size-[84px] cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--phase)] p-0 text-white"
      >
        {running ? <IconPause className="size-[34px]" /> : <IconPlay className="size-[34px]" />}
      </button>
      <button
        type="button"
        aria-label={t("skip")}
        onClick={onSkip}
        className="flex size-14 cursor-pointer items-center justify-center rounded-full border border-line bg-surface p-0 text-ink md:bg-ground"
      >
        <IconSkip className="size-6 rtl:-scale-x-100" />
      </button>
    </div>
  );
}
