import { useTranslations } from "next-intl";

type Props = {
  done: number;
  planned: number | null;
  /** The row of dots is for roomy lists; tight panels pass false. */
  dots?: boolean;
};

/**
 * "done/planned" for a task. With an estimate it reads "۲ از ۴" (plus dots on desktop);
 * without one it only says how many sessions were done, and nothing before the first one.
 * The visible text is hidden from screen readers and replaced by a full sentence.
 */
export function TaskCount({ done, planned, dots: showDots = true }: Props) {
  const t = useTranslations("tasks");

  if (planned == null) {
    if (done === 0) return null;
    return <span className="px-2 text-[13px] text-muted">{t("sessionsCount", { count: done })}</span>;
  }

  const dotCount = Math.min(planned, 8);
  return (
    <>
      <span className="sr-only">{t("progressLabel", { done, planned })}</span>
      {showDots && (
        <span aria-hidden="true" className="hidden items-center gap-1 md:flex">
          {Array.from({ length: dotCount }, (_, index) => (
            <span
              key={index}
              className={`size-2.5 rounded-full ${
                index < done ? "bg-focus" : "box-border border-2 border-line-strong"
              }`}
            />
          ))}
        </span>
      )}
      <span aria-hidden="true" className="min-w-11 px-1 text-end text-[13px] text-muted">
        {t("progress", { done, planned })}
      </span>
    </>
  );
}
