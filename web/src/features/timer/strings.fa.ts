/**
 * Every Farsi string for this phase lives here.
 * Phase 2 moves this object into next-intl. Do not hard-code UI copy anywhere else.
 * "پومودورو" is still a placeholder name (DESIGN.md §5).
 */
export const strings = {
  appName: "پومودورو",
  appDescription: "تایمر پومودورو برای تمرکز",
  menu: "منوی اصلی",
  nav: {
    timer: "تایمر",
    tasks: "کارها",
    stats: "آمار",
    settings: "تنظیمات",
  },
  phases: {
    focus: "تمرکز",
    shortBreak: "استراحت کوتاه",
    longBreak: "استراحت بلند",
  },
  play: "شروع",
  pause: "توقف",
  reset: "از اول",
  skip: "رد کردن",
  autoStart: "شروع خودکار",
  session: "جلسه",
  of: "از",
  shortHint: "وقت استراحت",
  longHint: "نفس عمیق بکش",
  started: "شروع شد",
  ready: "آماده است",
  // Static sample copy. Later phases replace these with real data.
  streak: "۷ روز پیاپی",
  taskTitle: "مطالعه فصل ۳ فیزیک",
  today: "امروز",
  focusHours: "ساعت تمرکز",
  focusHoursValue: "۱:۱۰",
  sessionsDone: "جلسه کامل",
  sessionsDoneValue: "۳",
  tasksHeading: "کارها",
  allTasks: "همه",
  donePrefix: "انجام شد: ",
  sampleTasks: [
    { title: "مطالعه فصل ۳ فیزیک", meta: "۲ از ۴", active: true },
    { title: "حل تمرین ریاضی", meta: "۰ از ۳", active: false },
    { title: "نوشتن گزارش آزمایشگاه", meta: "۱ از ۲", active: false },
  ],
  placeholders: {
    tasks: "کارها به‌زودی",
    stats: "آمار به‌زودی",
    settings: "تنظیمات به‌زودی",
  },
} as const;
