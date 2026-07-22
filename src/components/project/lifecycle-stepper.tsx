import { Check } from "lucide-react";
import {
  LIFECYCLE_PHASES,
  phaseIndex,
  type ProjectLifecycleStatus,
} from "@/lib/project-lifecycle";

export function LifecycleStepper({
  status,
}: {
  status: ProjectLifecycleStatus;
}) {
  const currentIdx = phaseIndex(status);
  const isLost = status === "lost";

  return (
    <div className="w-full overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 p-2">
        {LIFECYCLE_PHASES.map((phase, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isLostAtWon = isLost && phase.key === "won";
          const label = isLostAtWon ? "แพ้งาน" : phase.label;

          return (
            <li key={phase.key} className="flex items-center gap-1">
              <div
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  isCurrent
                    ? isLostAtWon
                      ? "bg-destructive/10 text-destructive ring-1 ring-destructive/40"
                      : "bg-primary/10 text-primary ring-1 ring-primary/30"
                    : isDone
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    isDone
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCurrent
                        ? isLostAtWon
                          ? "border-destructive bg-destructive text-destructive-foreground"
                          : "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background"
                  }`}
                >
                  {isDone ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="whitespace-nowrap font-medium">{label}</span>
              </div>
              {i < LIFECYCLE_PHASES.length - 1 && (
                <div
                  className={`h-px w-6 ${
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
