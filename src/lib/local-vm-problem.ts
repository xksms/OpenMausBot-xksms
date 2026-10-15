import { t } from "@/lib/i18n";

export function localVmProblem(problem: string | null | undefined): string | undefined {
  return problem === "Install a supported container runtime first"
    ? t("vm.runtime.installSupported")
    : problem ?? undefined;
}
