import type { ProjectColor } from "@/lib/tasks/contract";

/**
 * A project stores a palette id, never a color. Each id maps to a theme token class,
 * so a project keeps looking right when the user switches theme or goes dark.
 * (Full class names, so Tailwind can see them.)
 */
export const PROJECT_DOT: Record<ProjectColor, string> = {
  focus: "bg-focus",
  short: "bg-short",
  long: "bg-long",
  amber: "bg-pro-ink",
  clay: "bg-focus-ink",
  stone: "bg-muted",
};
