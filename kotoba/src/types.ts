/**
 * keiei kotoba — C-suite (経営) management daemon, kotoba-E2E split.
 *
 * Per ADR-2605101200 (AI CXO Roles as Resident Lang-Server), ADR-2606011400
 * (Consensys product-front / infra-back) + ADR-2605172400 (3-axis) +
 * ADR-2605181100 (kotoba E2E encrypted-record envelope). Founder directive
 * 2026-06-03: PII / CUI / confidential may migrate to etzhayyim when made safe
 * via kotoba E2E.
 *
 * SPLIT:
 *   PUBLIC (plaintext AT records) — CXO role registry: the org-chart reference
 *   metadata already served unauthenticated via `/cxo/listRoles` (role id, human
 *   seat presence, AI mode shadow/primary, decision-class authority, escalation
 *   target). Non-sensitive, frontable open metadata.
 *
 *   SENSITIVE / CUI (kotoba E2E, com.etzhayyim.encrypted.record) — CXO decision
 *   ledger entries: the confidential management deliberations the resident LSP
 *   appends to CXO-LEDGER.md (Class A/B/C decisions — M&A, layoffs, financial
 *   drafts, hiring/firing, incident disclosure, public statements). These carry
 *   institutional confidential subject + rationale + principal and are sealed via
 *   sdk.encryptedWrite (read-cap = owner DID + explicit recipients, e.g. CEO).
 *   The substrate never sees the decision body in plaintext.
 *
 *   STAYS etzhayyim (consumed via consent-capability) — financial-action EXECUTION
 *   (fiat card-processor / BSP charges / wire transfers / payroll runs),
 *   external-mail SEND execution, and LLM deliberation INFERENCE. These are the
 *   regulated *acts*, not the resulting audit records (which migrate: role meta
 *   plaintext, decision body E2E).
 *
 * AT-Lexicon: no float (queueDepth + ledger sequence are integers; confidence /
 * urgency are integers 0-100; money as decimal STRINGS).
 */

// Plaintext public collection.
export const ROLE_COLLECTION = "com.etzhayyim.apps.keiei.cxoRole";
// E2E inner-type NSID (decision body shape inside the encrypted envelope).
export const DECISION_INNER_TYPE = "com.etzhayyim.apps.keiei.cxoDecision";

export const KEIEI_DID_PREFIX = "did:web:keiei.etzhayyim.com:" as const;

export type AiMode = "shadow" | "primary";
export type DecisionClass = "A" | "B" | "C" | "D";
export type DecisionStatus = "open" | "executed" | "escalated" | "rejected";

// ─── CXO role (PLAINTEXT, public org-chart reference) ───────────────

export interface CxoRoleRecord {
  did: string;
  roleId: string;
  /** true if a human holds the seat (shadow/deputy mode), false if vacant. */
  humanSeatPresent: boolean;
  aiMode: AiMode;
  /** Highest decision class the AI may execute autonomously (A/B/C/D). */
  authorityClass: DecisionClass;
  /** Human principal a decision escalates to (handle/DID), empty if principal. */
  escalationTarget: string;
  createdAt: string;
}
export interface CxoRoleView extends CxoRoleRecord {
  roleUri: string;
}
export interface RegisterRoleInput {
  roleId: string;
  humanSeatPresent: boolean;
  aiMode: AiMode;
  authorityClass: DecisionClass;
  escalationTarget?: string;
}
export interface RegisterRoleOutput {
  status: "registered" | "alreadyExists" | "rejected";
  roleUri?: string;
  did?: string;
  roleId?: string;
  error?: string;
}
export interface GetRoleInput {
  roleId: string;
}
export interface GetRoleOutput {
  role?: CxoRoleView;
  error?: string;
}
export interface ListRolesInput {
  aiMode?: AiMode;
  limit?: number;
  cursor?: string;
}
export interface ListRolesOutput {
  items: CxoRoleView[];
  cursor?: string;
  total: number;
}

// ─── CXO decision ledger entry (E2E-ENCRYPTED, CUI) ─────────────────

export interface CxoDecisionBody {
  decisionId: string;
  /** FK → cxoRole.roleId of the deciding role. */
  roleId: string;
  decisionClass: DecisionClass;
  /** Short confidential subject line (e.g. "FY27 headcount reduction"). */
  subject: string;
  /** Confidential deliberation rationale. */
  rationale: string;
  /** Operating-entity principal the action is attributed to. */
  principal: string;
  status: DecisionStatus;
  /** integer 0-100 — institutional urgency of the decision. */
  urgency: number;
  decidedAt: string;
}
export interface CxoDecisionView extends CxoDecisionBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface RecordDecisionInput {
  decisionId: string;
  roleId: string;
  decisionClass: DecisionClass;
  subject: string;
  rationale: string;
  principal?: string;
  status?: DecisionStatus;
  urgency?: number;
  decidedAt?: string;
  /** Extra DIDs to grant read-cap (owner always included, e.g. CEO). */
  recipients?: string[];
}
export interface RecordDecisionOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyId?: string;
  decisionId?: string;
  error?: string;
}
export interface ListDecisionsInput {
  roleId?: string;
  decisionClass?: DecisionClass;
  limit?: number;
  cursor?: string;
}
export interface ListDecisionsOutput {
  items: CxoDecisionView[];
  cursor?: string;
  total: number;
}
export interface GetDecisionInput {
  decisionId: string;
}
export interface GetDecisionOutput {
  decision?: CxoDecisionView;
  error?: string;
}

// ─── Coverage rollup ────────────────────────────────────────────────

export interface CoverageInput {
  maxScan?: number;
}
export interface CoverageOutput {
  cxoRoleCount?: number;
  cxoDecisionCount?: number;
  rolesByMode?: Record<string, number>;
  decisionsByClass?: Record<string, number>;
  truncated?: boolean;
  error?: string;
}

// ─── Validation + helpers ───────────────────────────────────────────

const DECISION_CLASSES: ReadonlySet<string> = new Set(["A", "B", "C", "D"]);
const AI_MODES: ReadonlySet<string> = new Set(["shadow", "primary"]);
const DECISION_STATUSES: ReadonlySet<string> = new Set(["open", "executed", "escalated", "rejected"]);

export function isPct(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;
}
export function isDecisionClass(s: unknown): s is DecisionClass {
  return typeof s === "string" && DECISION_CLASSES.has(s);
}
export function isAiMode(s: unknown): s is AiMode {
  return typeof s === "string" && AI_MODES.has(s);
}
export function isDecisionStatus(s: unknown): s is DecisionStatus {
  return typeof s === "string" && DECISION_STATUSES.has(s);
}
export function roleDidFor(id: string): string {
  return `${KEIEI_DID_PREFIX}role:${id.toLowerCase()}`;
}
export function roleRkey(id: string): string {
  return `role-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
export function decisionRkey(id: string): string {
  return `decision-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
