import type { OverviewLine } from "./bot-overview-types";
import { catalogWord } from "./i18n";
import type { RoutineSchedule } from "./routines";
import { niceTime, scheduleSentence } from "./schedule-label";

function isSchedule(value: OverviewLine | RoutineSchedule): value is RoutineSchedule {
  return "type" in value;
}

function paramWord(key: string, value: string | number | OverviewLine | RoutineSchedule): string | number {
  if (typeof value === "string" || typeof value === "number") {
    return key === "at" && typeof value === "number" ? niceTime(value) : value;
  }
  if (isSchedule(value)) return scheduleSentence(value);
  return overviewLine(value);
}

export function overviewLine(line: OverviewLine): string {
  if (!line.params) return catalogWord(line.code, line.text);
  const params = Object.fromEntries(Object.entries(line.params).map(([key, value]) => [key, paramWord(key, value)]));
  return catalogWord(line.code, line.text, params);
}
