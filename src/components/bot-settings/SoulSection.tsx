import type { Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { SoulField } from "../SoulField";
import { ProposalStatus } from "./ProposalStatus";
import type { BotPatch } from "./useBotSettingsDerived";

export function SoulSection({ bot, patch }: { bot: Bot; patch: (patch: BotPatch) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-ink-secondary">
        {t("soul.sectionHint")}
      </p>
      <ProposalStatus bot={bot} kind="chief" />
      <SoulField bot={bot} onPatch={patch} />
    </div>
  );
}
