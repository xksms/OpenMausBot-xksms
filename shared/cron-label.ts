import type { RoutineCronSchedule } from "./routine-schedule.ts";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const weekdayKey = (index: number) => `cron.weekday.${WEEKDAYS[index]!.toLowerCase()}`;
const monthKey = (index: number) => `cron.month.${MONTHS[index]!.toLowerCase()}`;

/** The English catalog, mirrored by en.json key for key. The server, which has
 * no i18n, reads it through the default translator. */
export const CRON_EN: Record<string, string> = {
  ...Object.fromEntries(WEEKDAYS.map((day, index) => [weekdayKey(index), day])),
  ...Object.fromEntries(MONTHS.map((month, index) => [monthKey(index), month])),
  "cron.label.expression": "Cron {expression}",
  "cron.label.everyDay": "Every day at {time}",
  "cron.label.lastDay": "Monthly on the last day at {time}",
  "cron.label.monthDay": "Monthly on day {day} at {time}",
  "cron.label.yearly": "Yearly on {month} {day} at {time}",
  "cron.label.weekdays": "Every weekday at {time}",
  "cron.label.weekly": "Weekly on {weekday} at {time}",
  "cron.label.nthWeekday": "Monthly on the {order} {weekday} at {time}",
  "cron.order.first": "first",
  "cron.order.second": "second",
  "cron.order.third": "third",
  "cron.order.fourth": "fourth",
  "cron.order.fifth": "fifth",
  "cron.order.last": "last",
};

/** The words a reader gets: the app passes its t(), the server none. */
export type CronTranslate = (key: string, params?: Record<string, string | number>) => string;

function fill(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : whole));
}

export const english: CronTranslate = (key, params) => fill(CRON_EN[key], params);

const ORDER_KEYS = ["", "cron.order.first", "cron.order.second", "cron.order.third", "cron.order.fourth", "cron.order.fifth"];

/** Describe familiar presets; retain the exact expression for everything else.
 * This is presentation only, never a second parser or source of scheduling truth. */
export function cronScheduleLabel(schedule: RoutineCronSchedule, translate: CronTranslate = english): string {
  const [minute, hour, day, month, weekday] = schedule.expression.trim().split(/\s+/);
  let label = translate("cron.label.expression", { expression: schedule.expression });
  if (/^\d+$/.test(minute ?? "") && /^\d+$/.test(hour ?? "")) {
    const time = `${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}`;
    const monthDay = /^\d+$/.test(day ?? "") ? Number(day) : null;
    if (weekday === "*" && month === "*") {
      if (day === "*") label = translate("cron.label.everyDay", { time });
      else if (day === "L") label = translate("cron.label.lastDay", { time });
      else if (monthDay !== null) label = translate("cron.label.monthDay", { day: monthDay, time });
    } else if (weekday === "*" && /^\d+$/.test(month ?? "") && monthDay !== null) {
      const name = MONTHS[Number(month) - 1];
      if (name) label = translate("cron.label.yearly", { month: translate(monthKey(Number(month) - 1)), day: monthDay, time });
    } else if (day === "*" && month === "*") {
      if (weekday === "1-5" || weekday?.toUpperCase() === "MON-FRI") label = translate("cron.label.weekdays", { time });
      else if (/^[0-7]$/.test(weekday ?? "")) label = translate("cron.label.weekly", { weekday: translate(weekdayKey(Number(weekday) % 7)), time });
      else {
        const nth = /^([0-7])#([1-5]|L)$/i.exec(weekday ?? "");
        if (nth) {
          const order = nth[2]!.toUpperCase() === "L" ? "cron.order.last" : ORDER_KEYS[Number(nth[2])]!;
          label = translate("cron.label.nthWeekday", {
            order: translate(order),
            weekday: translate(weekdayKey(Number(nth[1]) % 7)),
            time,
          });
        }
      }
    }
  }
  return `${label} · ${schedule.timeZone}`;
}
