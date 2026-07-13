import { appConfig } from "@/config/app";

export function NetworkBadge() {
  return (
    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm font-medium text-cyan-100">
      <span className="h-2 w-2 rounded-full bg-cyan-300" />
      {appConfig.stellarNetwork}
    </div>
  );
}
