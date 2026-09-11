import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import {
  Network,
  ShieldCheck,
  Server,
  Lock,
  Clock,
  Building2,
  CheckCircle2,
  FileCode2,
  Activity,
  AlertTriangle,
  History,
} from "lucide-react";
import { ALERT_CONTRACTS } from "@/features/external-integrations/observability/alertContracts";

export const dynamic = "force-dynamic";

interface ProviderSpec {
  id: string;
  name: string;
  category: string;
  categoryBadge: string;
  formatOrProtocol: string;
  phaseStage: string;
  capabilities: { name: string; state: string }[];
  description: string;
}

const REGISTERED_PROVIDERS: ProviderSpec[] = [
  {
    id: "cdsl",
    name: "Central Depository Services (India) Limited",
    category: "Depository",
    categoryBadge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    formatOrProtocol: "16-Digit Numeric BO ID",
    phaseStage: "Stage 3 Integration",
    capabilities: [
      { name: "verify_demat", state: "Disabled" },
      { name: "read_allotment", state: "Planned" },
      { name: "reconciliation", state: "Planned" },
      { name: "submit_application", state: "Unsupported" },
    ],
    description: "National demat account depository. Tracks beneficial ownership and demat share credits.",
  },
  {
    id: "nsdl",
    name: "National Securities Depository Limited",
    category: "Depository",
    categoryBadge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    formatOrProtocol: "'IN' + 6-Digit DP ID + 8-Digit Client ID",
    phaseStage: "Stage 3 Integration",
    capabilities: [
      { name: "verify_demat", state: "Disabled" },
      { name: "read_allotment", state: "Planned" },
      { name: "reconciliation", state: "Planned" },
      { name: "submit_application", state: "Unsupported" },
    ],
    description: "National demat depository. Tracks electronic beneficial ownership and ISIN holding statements.",
  },
  {
    id: "bse_ipo",
    name: "BSE IPO Syndicate Bidding Gateway",
    category: "IPO Infrastructure",
    categoryBadge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    formatOrProtocol: "BSE iBids API / Exchange Gateway",
    phaseStage: "Stage 5 (Actual Bidding)",
    capabilities: [
      { name: "read_issue", state: "Planned" },
      { name: "submit_application", state: "Planned (Deferred)" },
      { name: "modify_application", state: "Planned (Deferred)" },
      { name: "cancel_application", state: "Planned (Deferred)" },
    ],
    description: "Primary exchange syndicate bidding system. Routes authorized retail and HNI bids to exchange book.",
  },
  {
    id: "nse_ipo",
    name: "NSE IPO Emerge / Syndicate Gateway",
    category: "IPO Infrastructure",
    categoryBadge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    formatOrProtocol: "NSE e-IPO Platform Interface",
    phaseStage: "Stage 5 (Actual Bidding)",
    capabilities: [
      { name: "read_issue", state: "Planned" },
      { name: "submit_application", state: "Planned (Deferred)" },
      { name: "modify_application", state: "Planned (Deferred)" },
      { name: "cancel_application", state: "Planned (Deferred)" },
    ],
    description: "NSE syndicate bidding gateway for mainboard and SME issues. Stage 1 holds contracts only.",
  },
  {
    id: "link_intime",
    name: "Link Intime India Private Limited",
    category: "Registrar (RTA)",
    categoryBadge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    formatOrProtocol: "RTA Allotment & Basis Verification",
    phaseStage: "Stage 4 Integration",
    capabilities: [
      { name: "read_allotment", state: "Planned" },
      { name: "read_refund", state: "Planned" },
      { name: "reconciliation", state: "Planned" },
    ],
    description: "Registrar and Share Transfer Agent. Authoritative registry for basis of allotment and share credit.",
  },
  {
    id: "kfintech",
    name: "KFin Technologies Limited",
    category: "Registrar (RTA)",
    categoryBadge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    formatOrProtocol: "KFin IPO Query Gateway",
    phaseStage: "Stage 4 Integration",
    capabilities: [
      { name: "read_allotment", state: "Planned" },
      { name: "read_refund", state: "Planned" },
      { name: "reconciliation", state: "Planned" },
    ],
    description: "Registrar and Transfer Agent managing allotment status, PAN matching, and depository intimations.",
  },
  {
    id: "npci_upi",
    name: "NPCI UPI IPO Mandate Infrastructure",
    category: "UPI / Payment ASBA",
    categoryBadge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    formatOrProtocol: "UPI 2.0 One-Time Mandate (ASBA)",
    phaseStage: "Stage 5 Integration",
    capabilities: [
      { name: "read_mandate", state: "Planned" },
      { name: "create_mandate", state: "Planned (Deferred)" },
      { name: "webhook_events", state: "Planned" },
    ],
    description: "NPCI UPI mandate block/unblock infrastructure. User authorizes mandate strictly inside bank/UPI app.",
  },
];

export default function AdminIntegrationsPage() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="External Integrations & Financial Infrastructure"
        description="Depository registries (CDSL/NSDL), Exchange Syndicate gateway contracts, and RTA interfaces."
        badge={
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5" />
            Stage 2: Hardening & Observability
          </span>
        }
      />

      {/* Mandatory Architectural Guardrails Alert */}
      <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-blue-200">
            Phase 9 Stage 2 Boundary: Hardened Observability & Zero-Connectivity Invariant
          </p>
          <p className="text-blue-300/80 leading-relaxed">
            Zero live external network connections active. Zero mock or real IPO applications, bidding, or mandates are permitted. 
            All external providers are registered in standby/planned contract mode. External account references are strictly 
            informational (manual entry with masked display). Real IPO application submission is explicitly deferred to Stage 5.
          </p>
        </div>
      </div>

      {/* Telemetry & KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--text-muted)] font-medium">Registered Providers</p>
              <p className="text-2xl font-bold text-[var(--text-main)] mt-1">7</p>
              <span className="text-[11px] text-blue-400 mt-0.5 block">CDSL, NSDL, BSE, NSE, RTAs, NPCI</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--text-muted)] font-medium">Operating State</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">Standby</p>
              <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">Zero Live Calls / Contracts Only</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Server className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--text-muted)] font-medium">Durable Event Inbox</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">Guarded</p>
              <span className="text-[11px] text-emerald-400/80 mt-0.5 block">256 KB DB Size & Unique Locks</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--text-muted)] font-medium">Raw Payload Retention</p>
              <p className="text-2xl font-bold text-purple-400 mt-1">90 Days</p>
              <span className="text-[11px] text-purple-400/80 mt-0.5 block">Append-Only Run Audit Trail</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provider Registry & Architecture Table */}
      <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" />
            <span>Financial Infrastructure Provider Registry</span>
          </CardTitle>
          <CardDescription className="text-xs text-[var(--text-muted)]">
            Indian market participants and exchange bidding gateways modeled under the Phase 9 integration framework.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                  <th className="pb-3 font-semibold">Provider / Entity</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Data Standard / Protocol</th>
                  <th className="pb-3 font-semibold">Stage Roadmap</th>
                  <th className="pb-3 font-semibold">Capability Status</th>
                  <th className="pb-3 font-semibold">Operating State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {REGISTERED_PROVIDERS.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--bg-subtle)]/50 transition-colors">
                    <td className="py-3 pr-4 font-medium text-[var(--text-main)]">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{p.description}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${p.categoryBadge}`}>
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-[11px] text-zinc-300">
                      {p.formatOrProtocol}
                    </td>
                    <td className="py-3 pr-4 text-[11px] text-[var(--text-muted)]">
                      {p.phaseStage}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {p.capabilities.map((c, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700"
                          >
                            {c.name}: {c.state}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
                        Standby
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Stage 2 Observability: Alert Contracts & Pruning Audit Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Operational Alert Contracts & Thresholds</span>
            </CardTitle>
            <CardDescription className="text-xs text-[var(--text-muted)]">
              Formal integration health alerting contracts with designated ownership teams.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.values(ALERT_CONTRACTS).map((alert) => (
                <div key={alert.alertId} className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-zinc-300 font-semibold">{alert.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${
                      alert.severity === 'critical'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">Threshold: <code className="text-zinc-200">{alert.threshold}</code></p>
                  <p className="text-[10px] text-zinc-400">{alert.actionableRunbook}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-purple-400" />
              <span>Raw Payload Retention & Pruning Telemetry</span>
            </CardTitle>
            <CardDescription className="text-xs text-[var(--text-muted)]">
              Raw payloads pruned after 90 days. Event headers, hashes, and identity permanently preserved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-[var(--text-muted)]">
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1.5">
              <p className="font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                Append-Only History Table (<code className="text-zinc-300">external_pruning_runs</code>)
              </p>
              <p className="text-[11px] text-zinc-400">
                Pruning runs are logged with execution duration, records purged, and caller identity. 
                Database trigger <code className="text-zinc-300">trg_external_pruning_runs_immutable</code> blocks all UPDATE and DELETE mutations.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1.5">
              <p className="font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                Phase 8 Audit Integration
              </p>
              <p className="text-[11px] text-zinc-400">
                Successful pruning runs emit sanitized audit events to Phase 8 <code className="text-zinc-300">audit_logs</code>. 
                If database operations fail, application-level error handlers emit high-severity security telemetry.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1.5">
              <p className="font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-purple-400" />
                Fixed Policy Parameter
              </p>
              <p className="text-[11px] text-zinc-400">
                Retention policy is constrained strictly between 30 and 365 days (fixed at 90 days), preventing accidental deletion of recent events.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Architecture & Guardrails Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>Zero-Credential Security Guardrails</span>
            </CardTitle>
            <CardDescription className="text-xs text-[var(--text-muted)]">
              Strict isolation preventing any storage or handling of banking or trading credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-[var(--text-muted)]">
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1.5">
              <p className="font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Prohibited Credential Rejection
              </p>
              <p className="text-[11px] text-zinc-400">
                Incoming payloads are recursively scanned. Any fields matching UPI PIN, MPIN, ATM PIN, OTP,
                broker password, or trading PIN are strictly rejected with an immediate error.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1.5">
              <p className="font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Demat Reference Storage
              </p>
              <p className="text-[11px] text-zinc-400">
                User demat references are stored with separated masked strings (<code className="text-zinc-300">12081600XXXX1234</code>)
                for UI presentation, and envelope-encrypted (AES-256-GCM) identifiers for future API communication.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-purple-400" />
              <span>Event Inbox & 90-Day Retention Policy</span>
            </CardTitle>
            <CardDescription className="text-xs text-[var(--text-muted)]">
              Durable event persistence without premature queue daemons or raw payload audit leakage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-[var(--text-muted)]">
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1.5">
              <p className="font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                Raw Payload Access Restricted by RLS
              </p>
              <p className="text-[11px] text-zinc-400">
                Normal users cannot read <code className="text-zinc-300">external_events.payload</code>. Phase 8 audit logs receive
                only sanitized domain summaries (<code className="text-zinc-300">payload_hash</code> and event headers).
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1.5">
              <p className="font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                Automated Pruning Function
              </p>
              <p className="text-[11px] text-zinc-400">
                Function <code className="text-zinc-300">prune_expired_raw_payloads()</code> replaces raw payloads older than 90 days
                with a tombstone marker while preserving audit signatures and event identity.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
