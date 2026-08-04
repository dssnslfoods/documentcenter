import { Check } from "lucide-react";
import {
  lifecyclePhases,
  visiblePhaseIndex,
  type ProjectLifecycleStatus,
} from "@/lib/project-lifecycle";

export function LifecycleStepper({
  status,
  isInhouse = false,
}: {
  status: ProjectLifecycleStatus;
  isInhouse?: boolean;
}) {
  const phases = lifecyclePhases(isInhouse);
  const currentIdx = visiblePhaseIndex(status, isInhouse);
  const isLost = status === "lost";

  return (
    <div className="w-full overflow-x-auto">
      <ol className="flex min-w-max items-center gap-0 p-1">
        {phases.map((phase, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isLostAtWon = isLost && phase.key === "won";
          const label = isLostAtWon ? "แพ้งาน" : phase.label;

          const dotClass = isDone
            ? "border-primary bg-primary text-primary-foreground"
            : isCurrent
              ? isLostAtWon
                ? "border-destructive bg-destructive text-destructive-foreground shadow-[0_0_0_4px] shadow-destructive/15"
                : "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px] shadow-primary/15"
              : "border-border bg-card text-muted-foreground";

          const textClass = isCurrent
            ? isLostAtWon
              ? "text-destructive"
              : "text-foreground"
            : isDone
              ? "text-foreground/70"
              : "text-muted-foreground/70";

          return (
            <li key={phase.key} className="flex items-center gap-0">
              <div className="flex flex-col items-center gap-1.5 px-2 pt-1 pb-2">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-all ${dotClass}`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={`whitespace-nowrap text-[11px] font-medium ${textClass}`}>{label}</span>
              </div>
              {i < phases.length - 1 && (
                <div
                  className={`mb-6 h-0.5 w-8 rounded-full transition-colors ${
                    isDone ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
