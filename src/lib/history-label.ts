import type { LocaleKey } from "@/locales";

import { catalogWord, t } from "./i18n";

/** The profile field names, worded as the approval cards already word them. */
const FIELD_LABEL: Record<string, LocaleKey> = {
  name: "approval.applied.field.name",
  title: "approval.applied.field.title",
  description: "approval.applied.field.description",
  soul: "approval.applied.field.soul",
  cwd: "approval.applied.field.cwd",
  notifications: "approval.applied.field.notifications",
  speakReplies: "approval.applied.field.speakReplies",
};

export interface HistorySummaryRow {
  field: string;
  before?: string;
  after?: string;
  summary: string;
  summaryCode?: string;
  summaryParams?: Record<string, string | number>;
}

/** A change row's sentence in the reader's language; a row the server did not
 * word as a sentence keeps the text it recorded. */
export function historySummary(row: HistorySummaryRow): string {
  if (row.summaryCode) return catalogWord(row.summaryCode, row.summary, row.summaryParams);
  const label = FIELD_LABEL[row.field];
  if (!label || row.before === undefined || row.after === undefined) return row.summary;
  return t("history.summary.changed", {
    field: t(label),
    before: JSON.stringify(row.before),
    after: JSON.stringify(row.after),
  });
}
