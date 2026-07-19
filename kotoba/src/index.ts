/**
 * keiei kotoba — barrel. C-suite (経営) management daemon, kotoba-E2E split:
 * public CXO role registry plaintext + CUI decision-ledger body sealed via
 * kotoba E2E (ADR-2605181100). Financial-action / external-mail / LLM
 * deliberation EXECUTION stay etzhayyim via consent-capability.
 */
export * from "./types.js";
export {
  registerRole,
  getRole,
  listRoles,
  recordDecision,
  listDecisions,
  getDecision,
  coverage,
} from "./registry.js";
