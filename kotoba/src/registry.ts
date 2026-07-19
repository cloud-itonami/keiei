/**
 * keiei kotoba — C-suite management daemon registry, kotoba-E2E split.
 *
 * Plaintext path (cxoRole): sdk.write / sdk.read — public org-chart reference
 * metadata (the unauthenticated `/cxo/listRoles` surface).
 * E2E path (cxoDecision): sdk.encryptedWrite / sdk.encryptedRead — CUI decision
 * ledger body sealed in the kotoba envelope (ADR-2605181100), read-cap = owner
 * DID + explicit recipients (e.g. CEO 河崎 for 24h auto-disclose). The substrate
 * never sees the confidential decision subject/rationale in plaintext.
 *
 * STAYS etzhayyim (NOT a collection): financial-action execution, external-mail send
 * execution, LLM deliberation inference — consumed via consent-capability.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  DECISION_INNER_TYPE,
  ROLE_COLLECTION,
  decisionRkey,
  isAiMode,
  isDecisionClass,
  isDecisionStatus,
  isPct,
  roleDidFor,
  roleRkey,
  type CoverageInput,
  type CoverageOutput,
  type CxoDecisionBody,
  type CxoDecisionView,
  type CxoRoleRecord,
  type CxoRoleView,
  type GetDecisionInput,
  type GetDecisionOutput,
  type GetRoleInput,
  type GetRoleOutput,
  type ListDecisionsInput,
  type ListDecisionsOutput,
  type ListRolesInput,
  type ListRolesOutput,
  type RecordDecisionInput,
  type RecordDecisionOutput,
  type RegisterRoleInput,
  type RegisterRoleOutput,
} from "./types.js";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

// ─── CXO role (PLAINTEXT) ───────────────────────────────────────────

export async function registerRole(e: Etzhayyim, input: RegisterRoleInput): Promise<RegisterRoleOutput> {
  if (!input.roleId) return { status: "rejected", error: "missingRequiredFields" };
  if (!isAiMode(input.aiMode)) return { status: "rejected", error: "invalidAiMode" };
  if (!isDecisionClass(input.authorityClass)) return { status: "rejected", error: "invalidAuthorityClass" };
  if (typeof input.humanSeatPresent !== "boolean") return { status: "rejected", error: "invalidHumanSeatPresent" };
  const rkey = roleRkey(input.roleId);
  const existing = await e.read<CxoRoleRecord>({ collection: ROLE_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", roleUri: existing.records[0].uri, did: existing.records[0].value.did, roleId: input.roleId };
  }
  const now = new Date().toISOString();
  const did = roleDidFor(input.roleId);
  const record: CxoRoleRecord = {
    did,
    roleId: input.roleId,
    humanSeatPresent: input.humanSeatPresent,
    aiMode: input.aiMode,
    authorityClass: input.authorityClass,
    escalationTarget: input.escalationTarget ?? "",
    createdAt: now,
  };
  const receipt = await e.write({ collection: ROLE_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "registered", roleUri: receipt.uri, did, roleId: input.roleId };
}

export async function getRole(e: Etzhayyim, input: GetRoleInput): Promise<GetRoleOutput> {
  if (!input.roleId) return { error: "invalidRoleId" };
  const resp = await e.read<CxoRoleRecord>({ collection: ROLE_COLLECTION, rkey: roleRkey(input.roleId) }).catch(() => ({ records: [] }));
  const hit = resp.records[0];
  if (!hit?.value) return { error: "notFound" };
  return { role: { ...hit.value, roleUri: hit.uri } };
}

export async function listRoles(e: Etzhayyim, input: ListRolesInput = {}): Promise<ListRolesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<CxoRoleRecord>({ collection: ROLE_COLLECTION, cursor: input.cursor, limit });
  const items: CxoRoleView[] = resp.records
    .filter((r) => !input.aiMode || r.value.aiMode === input.aiMode)
    .map((r) => ({ ...r.value, roleUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

/** FK existence check — confirm a cxoRole exists before recording a decision. */
async function roleExists(e: Etzhayyim, roleId: string): Promise<boolean> {
  const resp = await e.read<CxoRoleRecord>({ collection: ROLE_COLLECTION, rkey: roleRkey(roleId) }).catch(() => ({ records: [] }));
  return Boolean(resp.records[0]?.value);
}

// ─── CXO decision ledger entry (E2E-ENCRYPTED, CUI) ─────────────────

export async function recordDecision(e: Etzhayyim, input: RecordDecisionInput): Promise<RecordDecisionOutput> {
  if (!input.decisionId || !input.roleId || !input.subject || !input.rationale) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isDecisionClass(input.decisionClass)) return { status: "rejected", error: "invalidDecisionClass" };
  if (input.status !== undefined && !isDecisionStatus(input.status)) return { status: "rejected", error: "invalidStatus" };
  if (input.urgency !== undefined && !isPct(input.urgency)) return { status: "rejected", error: "invalidUrgency" };
  // FK: deciding role must be a registered cxoRole (exists()).
  if (!(await roleExists(e, input.roleId))) return { status: "rejected", error: "unknownRole" };
  const body: CxoDecisionBody = {
    decisionId: input.decisionId,
    roleId: input.roleId,
    decisionClass: input.decisionClass,
    subject: input.subject,
    rationale: input.rationale,
    principal: input.principal ?? "did:web:etzhayyim.com",
    status: input.status ?? "open",
    urgency: input.urgency ?? 0,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
  };
  // Read-cap = owner DID (sender, auto-wrapped) + any explicit recipients (CEO).
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: DECISION_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: decisionRkey(input.decisionId),
  });
  return { status: "recorded", uri: receipt.uri, keyId: receipt.keyId, decisionId: input.decisionId };
}

async function scanDecisions(e: Etzhayyim, maxScan: number): Promise<CxoDecisionView[]> {
  const out: CxoDecisionView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<CxoDecisionBody>({ innerType: DECISION_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    }
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listDecisions(e: Etzhayyim, input: ListDecisionsInput = {}): Promise<ListDecisionsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanDecisions(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter(
    (d) => (!input.roleId || d.roleId === input.roleId) && (!input.decisionClass || d.decisionClass === input.decisionClass)
  );
  return { items: filtered.slice(0, limit), total: filtered.length };
}

export async function getDecision(e: Etzhayyim, input: GetDecisionInput): Promise<GetDecisionOutput> {
  if (!input.decisionId) return { error: "invalidDecisionId" };
  const all = await scanDecisions(e, DEFAULT_MAX_SCAN);
  const found = all.find((d) => d.decisionId === input.decisionId);
  if (!found) return { error: "notFound" };
  return { decision: found };
}

// ─── Coverage rollup ────────────────────────────────────────────────

export async function coverage(e: Etzhayyim, input: CoverageInput = {}): Promise<CoverageOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
  const rolesByMode: Record<string, number> = {};
  let cxoRoleCount = 0;
  let cursor: string | undefined;
  while (cxoRoleCount < maxScan) {
    const page = await e.read<CxoRoleRecord>({ collection: ROLE_COLLECTION, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      rolesByMode[r.value.aiMode] = (rolesByMode[r.value.aiMode] ?? 0) + 1;
      cxoRoleCount += 1;
    }
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }
  const decisions = await scanDecisions(e, maxScan);
  const decisionsByClass: Record<string, number> = {};
  for (const d of decisions) {
    decisionsByClass[d.decisionClass] = (decisionsByClass[d.decisionClass] ?? 0) + 1;
  }
  return {
    cxoRoleCount,
    cxoDecisionCount: decisions.length,
    rolesByMode,
    decisionsByClass,
    truncated: cxoRoleCount >= maxScan || decisions.length >= maxScan,
  };
}
