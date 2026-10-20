"use client";

import {
  Callout,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Checkbox,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
} from "@/components/ui";

export type EnvironmentId = "sandbox" | "production";

export interface EnvironmentCapability {
  id: string;
  label: string;
  enabled: boolean;
  requiresApproval?: boolean;
}

export interface EnvironmentSnapshot {
  id: EnvironmentId;
  label: string;
  version: string;
  network: string;
  rolloutPhase: "planned" | "canary" | "rolling" | "complete" | "blocked";
  capabilities: EnvironmentCapability[];
  blockers: string[];
  signedMetadata: {
    digest: string;
    signerId: string;
    signedAt: string;
  };
  stale: boolean;
  acknowledgedAt?: string;
}

export type DiffKind = "added" | "removed" | "changed" | "unchanged";

export interface CapabilityDiff {
  id: string;
  label: string;
  kind: DiffKind;
  sandbox?: boolean;
  production?: boolean;
}

export interface EnvironmentComparison {
  sandbox: EnvironmentSnapshot;
  production: EnvironmentSnapshot;
  capabilityDiffs: CapabilityDiff[];
  versionMatch: boolean;
  networkMatch: boolean;
  rolloutReady: boolean;
}

export interface EnvironmentRolloutPanelProps {
  comparison: EnvironmentComparison;
  selectedEnvironment: EnvironmentId;
  onEnvironmentChange: (env: EnvironmentId) => void;
  acknowledged: boolean;
  onAcknowledgeChange: (acknowledged: boolean) => void;
  onRetry?: () => void;
  disabled?: boolean;
}

const SENSITIVE_KEYS = /(secret|key|token|password|credential|private)/i;

export function isSensitiveCapabilityId(id: string): boolean {
  return SENSITIVE_KEYS.test(id);
}

export function computeCapabilityDiffs(
  sandbox: EnvironmentCapability[],
  production: EnvironmentCapability[],
): CapabilityDiff[] {
  const sandboxMap = new Map(
    sandbox
      .filter((c) => !isSensitiveCapabilityId(c.id))
      .map((c) => [c.id, c] as const),
  );
  const productionMap = new Map(
    production
      .filter((c) => !isSensitiveCapabilityId(c.id))
      .map((c) => [c.id, c] as const),
  );
  const ids = new Set<string>([...sandboxMap.keys(), ...productionMap.keys()]);
  const diffs: CapabilityDiff[] = [];
  for (const id of Array.from(ids).sort()) {
    const s = sandboxMap.get(id);
    const p = productionMap.get(id);
    const label = p?.label ?? s?.label ?? id;
    if (s && !p) {
      diffs.push({ id, label, kind: "removed", sandbox: s.enabled });
    } else if (!s && p) {
      diffs.push({ id, label, kind: "added", production: p.enabled });
    } else if (s && p) {
      const changed = s.enabled !== p.enabled;
      diffs.push({
        id,
        label,
        kind: changed ? "changed" : "unchanged",
        sandbox: s.enabled,
        production: p.enabled,
      });
    }
  }
  return diffs;
}

export function isRolloutReady(comparison: EnvironmentComparison): boolean {
  const { production } = comparison;
  if (production.stale) return false;
  if (production.rolloutPhase === "blocked") return false;
  if (production.blockers.length > 0) return false;
  if (!comparison.versionMatch) return false;
  if (!comparison.networkMatch) return false;
  return true;
}

export function canActivateProduction(
  comparison: EnvironmentComparison,
  selected: EnvironmentId,
  acknowledged: boolean,
): { allowed: boolean; reason?: string } {
  if (selected !== "production") {
    return { allowed: false, reason: "Production actions require the production environment to be selected." };
  }
  if (!acknowledged) {
    return { allowed: false, reason: "Acknowledge the comparison before activating production." };
  }
  if (!isRolloutReady(comparison)) {
    return { allowed: false, reason: "Rollout is not safe to activate." };
  }
  return { allowed: true };
}

const ROLLOUT_PHASE_VARIANT: Record<
  EnvironmentSnapshot["rolloutPhase"],
  "success" | "default" | "destructive"
> = {
  planned: "default",
  canary: "default",
  rolling: "default",
  complete: "success",
  blocked: "destructive",
};

function DiffBadge({ kind }: { kind: DiffKind }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    kind === "added"
      ? "default"
      : kind === "removed"
        ? "destructive"
        : kind === "changed"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{kind}</Badge>;
}

export function EnvironmentRolloutPanel({
  comparison,
  selectedEnvironment,
  onEnvironmentChange,
  acknowledged,
  onAcknowledgeChange,
  onRetry,
  disabled = false,
}: EnvironmentRolloutPanelProps) {
  const ready = isRolloutReady(comparison);
  const activation = canActivateProduction(comparison, selectedEnvironment, acknowledged);
  const production = comparison.production;
  const sandbox = comparison.sandbox;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Environment rollout</CardTitle>
        <CardDescription>
          Compare sandbox and production capabilities, versions, networks, and
          rollout status before enabling workflows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="environment-select">Environment</Label>
            <Select
              value={selectedEnvironment}
              onValueChange={(v) => onEnvironmentChange(v as EnvironmentId)}
              disabled={disabled}
            >
              <SelectTrigger id="environment-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {onRetry ? (
            <Button variant="outline" onClick={onRetry} disabled={disabled}>
              Refresh comparison
            </Button>
          ) : null}
        </div>

        {comparison.production.stale ? (
          <Callout variant="warning">
            Production snapshot is stale. Refresh before enabling workflows.
          </Callout>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {[ sandbox, production ].map((env) => (
            <div key={env.id} className="rounded-border p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{env.label}</h4>
                <Badge variant={ROLLOUT_PHASE_VARIANT[env.rolloutPhase]}>
                  {env.rolloutPhase}
                </Badge>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt>Version</dt>
                  <dd>{env.version}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Network</dt>
                  <dd>{env.network}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Signed by</dt>
                  <dd>{env.signedMetadata.signerId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Digest</dt>
                  <dd className="font-mono text-xs">{env.signedMetadata.digest}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={comparison.versionMatch ? "success" : "destructive"}>
            {comparison.versionMatch ? "Versions aligned" : "Version mismatch"}
          </Badge>
          <Badge variant={comparison.networkMatch ? "success" : "destructive"}>
            {comparison.networkMatch ? "Networks aligned" : "Network mismatch"}
          </Badge>
          <Badge variant={ready ? "success" : "warning"}>
            {ready ? "Rollout ready" : "Rollout blocked"}
          </Badge>
        </div>

        {production.blockers.length > 0 ? (
          <div className="space-y2">
            <h3 className="text-sm font-medium">Blockers</h3>
            <ul className="list-disc list-inside text-sm text-destructive">
              {production.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Separator />

        <div className="space-y2">
          <h3 className="text-sm font-medium">Capability diff</h3>
          <ul className="space-y2">
            {comparison.capabilityDiffs.map((diff) => (
              <li key={diff.id} className="flex items-center justify-between text-sm">
                <span>{diff.label}</span>
                <DiffBadge kind={diff.kind} />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="acknowledge-comparison"
            checked={acknowledged}
            onCheckedChange={(v) => onAcknowledgeChange(v === true)}
            disabled={disabled}
          />
          <Label htmlFor="acknowledge-comparison" className="text-sm">
            I acknowledge the comparison and understand that production actions cannot use
            sandbox identifiers.
          </Label>
        </div>

        {!activation.allowed && activation.reason ? (
          <p className="text-sm text-muted-foreground" role="status">
            {activation.reason}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
