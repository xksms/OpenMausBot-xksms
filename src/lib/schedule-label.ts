import { catalogWord } from "@/lib/i18n";
import { atLocalTime } from "@/lib/routine-calendar";
import type { RoutineSchedule } from "@/lib/routines";
import { cronScheduleLabel, english as cronEnglish, type CronTranslate } from "../../shared/cron-label";

/** The English this build ships; en.json's schedule.* keys mirror these words. */
const EN = {
  "schedule.durationMinutes": "{count} min",
  "schedule.durationHours": "{count} hr",
  "schedule.durationHoursMinutes": "{h} hr {m} min",
  "schedule.everyMinutes": "Every {count} min",
  "schedule.everyHour": "Every hour",
  "schedule.everyHours": "Every {count} hr",
  "schedule.everyHoursMinutes": "Every {h} hr {m} min",
  "schedule.eachMinutes": "every {count} minutes",
  "schedule.eachHour": "every hour",
  "schedule.eachHours": "every {count} hours",
  "schedule.eachHourMinutes": "every {h} hour {m} minutes",
  "schedule.eachHoursMinutes": "every {h} hours {m} minutes",
  "schedule.weekdays": "weekdays",
  "schedule.until": "until {date}",
  "schedule.everyDay": "Every day",
  "schedule.everyWeekday": "Every weekday",
  "schedule.weeklyOn": "Weekly on {day}",
  "schedule.eachDay": "every day",
  "schedule.eachWeekday": "every weekday",
  "schedule.eachWeeklyOn": "weekly on {day}",
  "schedule.onceOn": "once on {date}, {time}",
  "schedule.labelAtTime": "{label} at {time}",
} as const;

const DAY_KEYS = [
  "schedule.day.sun", "schedule.day.mon", "schedule.day.tue", "schedule.day.wed", "schedule.day.thu", "schedule.day.fri", "schedule.day.sat",
] as const;

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type ScheduleKey = keyof typeof EN;

function word(key: ScheduleKey, params?: Record<string, string | number>): string {
  return catalogWord(key, EN[key], params);
}

function dayName(day: number): string {
  return catalogWord(DAY_KEYS[day], DAY_NAMES[day]);
}

/** The cron labels in the reader's language, for a caller that words one itself. */
export const cronLabelTranslate: CronTranslate = (key, params) => catalogWord(key, cronEnglish(key, params), params);

export function niceTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function niceDate(at: number): string {
  return new Date(at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export function whenLabel(at: number): string {
  const date = new Date(at);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay ? niceTime(at) : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return word("schedule.durationMinutes", { count: minutes });
  if (minutes % 60 === 0) return word("schedule.durationHours", { count: minutes / 60 });
  return word("schedule.durationHoursMinutes", { h: Math.floor(minutes / 60), m: minutes % 60 });
}

export function intervalLabel(minutes: number): string {
  if (minutes < 60) return word("schedule.everyMinutes", { count: minutes });
  if (minutes === 60) return word("schedule.everyHour");
  if (minutes % 60 === 0) return word("schedule.everyHours", { count: minutes / 60 });
  return word("schedule.everyHoursMinutes", { h: Math.floor(minutes / 60), m: minutes % 60 });
}

function eachLabel(minutes: number): string {
  if (minutes < 60) return word("schedule.eachMinutes", { count: minutes });
  if (minutes === 60) return word("schedule.eachHour");
  if (minutes % 60 === 0) return word("schedule.eachHours", { count: minutes / 60 });
  const hours = Math.floor(minutes / 60);
  return word(hours === 1 ? "schedule.eachHourMinutes" : "schedule.eachHoursMinutes", { h: hours, m: minutes % 60 });
}

function intervalRestrictions(schedule: Extract<RoutineSchedule, { type: "interval" }>): string[] {
  const details: string[] = [];
  if (schedule.weekdays && schedule.weekdays.length < 7) {
    details.push(schedule.weekdays.join(",") === "1,2,3,4,5"
      ? word("schedule.weekdays")
      : schedule.weekdays.map(dayName).join(", "));
  }
  if (schedule.window) {
    const wallTime = (time: string) => {
      const [hour, minute] = time.split(":").map(Number);
      return niceTime(new Date(2000, 0, 1, hour, minute).getTime());
    };
    details.push(`${wallTime(schedule.window.start)}–${wallTime(schedule.window.end)}`);
  }
  if (schedule.endsAt != null) {
    details.push(word("schedule.until", { date: new Date(schedule.endsAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) }));
  }
  return details;
}

export function scheduleLabel(schedule: RoutineSchedule | { type: "once"; at: number } | { type: "daily"; time: string; weekdays: number[] }): string {
  if (schedule.type === "cron") return cronScheduleLabel(schedule, cronLabelTranslate);
  if (schedule.type === "once") return `${niceDate(schedule.at)}, ${niceTime(schedule.at)}`;
  if (schedule.type === "interval") {
    return [intervalLabel(schedule.everyMinutes), ...intervalRestrictions(schedule)].join(" · ");
  }
  const days = schedule.weekdays;
  const label = days.length === 7
    ? word("schedule.everyDay")
    : days.join(",") === "1,2,3,4,5"
      ? word("schedule.everyWeekday")
      : days.length === 1
        ? word("schedule.weeklyOn", { day: dayName(days[0]!) })
        : days.map(dayName).join(", ");
  return word("schedule.labelAtTime", { label, time: niceTime(atLocalTime(Date.now(), schedule.time)) });
}

export function scheduleSentence(schedule: RoutineSchedule): string {
  if (schedule.type === "cron") return cronScheduleLabel(schedule, cronLabelTranslate);
  if (schedule.type === "interval") {
    return [eachLabel(schedule.everyMinutes), ...intervalRestrictions(schedule)].join(" · ");
  }
  if (schedule.type === "once") {
    return word("schedule.onceOn", { date: niceDate(schedule.at), time: niceTime(schedule.at) });
  }
  const days = schedule.weekdays;
  const time = niceTime(atLocalTime(Date.now(), schedule.time));

  if (days.length === 7) {
    return word("schedule.labelAtTime", { label: word("schedule.eachDay"), time });
  }
  if (days.join(",") === "1,2,3,4,5") {
    return word("schedule.labelAtTime", { label: word("schedule.eachWeekday"), time });
  }
  if (days.length === 1) {
    return word("schedule.labelAtTime", { label: word("schedule.eachWeeklyOn", { day: dayName(days[0]!) }), time });
  }

  return word("schedule.labelAtTime", { label: days.map(dayName).join(", "), time });
}
