import { strings } from "../strings.fa";

export function TodayPanel() {
  // TODO: Phase 6 replaces these sample numbers with today's real totals.
  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <h2 className="mb-3 text-base font-semibold">{strings.today}</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-control bg-ground p-3 text-center">
          <div dir="ltr" className="text-[26px] font-bold leading-snug">
            {strings.focusHoursValue}
          </div>
          <div className="text-xs text-muted">{strings.focusHours}</div>
        </div>
        <div className="rounded-control bg-ground p-3 text-center">
          <div className="text-[26px] font-bold leading-snug">{strings.sessionsDoneValue}</div>
          <div className="text-xs text-muted">{strings.sessionsDone}</div>
        </div>
      </div>
    </section>
  );
}
