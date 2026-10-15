import type { RoutineSchedule } from "../../shared/routines";

/** One sentence for the Overview panel: `text` is the English the server words,
 * `code` names the catalog template that says it in the reader's language, and
 * `params` refill that template. A param named `at` is an epoch-millisecond
 * clock time; a schedule param is worded by the reader's own formatter. */
export interface OverviewLine {
  text: string;
  code: string;
  params?: Record<string, string | number | OverviewLine | RoutineSchedule>;
}

export interface OverviewRecent {
  at: number;
  summary: string;
  field: string;
  before?: string;
  after?: string;
  summaryCode?: string;
  summaryParams?: Record<string, string | number>;
}

export interface BotOverview {
  who: { name: string; title: string; blurb: string; soulLead: string };
  does: OverviewLine[];
  reaches: OverviewLine[];
  wont: OverviewLine[];
  recent: OverviewRecent[];
  setup?: SetupStep[];
}

export interface SetupStep {
  id: "identity" | "soul" | "folder" | "apps" | "schedule";
  label: string;
  done: boolean;
  section?: "identity" | "soul" | "access" | "routines";
}
