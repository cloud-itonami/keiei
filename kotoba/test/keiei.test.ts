import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  registerRole,
  getRole,
  listRoles,
  recordDecision,
  listDecisions,
  getDecision,
  coverage,
} from "../src/index.js";

const OWNER = "did:web:keiei.etzhayyim.com";

describe("keiei kotoba (C-suite kotoba-E2E split)", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: OWNER });
  });

  describe("cxoRole (PLAINTEXT public org-chart reference)", () => {
    it("registers, dedups, validates, gets, lists/filters", async () => {
      expect((await registerRole(e, { roleId: "cto", humanSeatPresent: false, aiMode: "primary", authorityClass: "C", escalationTarget: "j.kawasaki" })).status).toBe("registered");
      expect((await registerRole(e, { roleId: "cto", humanSeatPresent: false, aiMode: "primary", authorityClass: "C" })).status).toBe("alreadyExists");
      expect((await registerRole(e, { roleId: "bad", humanSeatPresent: false, aiMode: "ghost" as any, authorityClass: "C" })).status).toBe("rejected"); // invalid mode
      expect((await registerRole(e, { roleId: "bad2", humanSeatPresent: false, aiMode: "primary", authorityClass: "Z" as any })).status).toBe("rejected"); // invalid class
      await registerRole(e, { roleId: "ceo", humanSeatPresent: true, aiMode: "shadow", authorityClass: "C" });
      const got = await getRole(e, { roleId: "cto" });
      expect(got.role?.aiMode).toBe("primary");
      expect(got.role?.humanSeatPresent).toBe(false);
      expect((await getRole(e, { roleId: "nope" })).error).toBe("notFound");
      expect((await listRoles(e)).total).toBe(2);
      expect((await listRoles(e, { aiMode: "primary" })).total).toBe(1);
    });
  });

  describe("cxoDecision (E2E-ENCRYPTED CUI ledger)", () => {
    beforeEach(async () => {
      await registerRole(e, { roleId: "cto", humanSeatPresent: false, aiMode: "primary", authorityClass: "C" });
      await registerRole(e, { roleId: "chro", humanSeatPresent: false, aiMode: "primary", authorityClass: "C" });
    });

    it("seals via encryptedWrite, round-trips via encryptedRead, validates FK + fields", async () => {
      const ok = await recordDecision(e, { decisionId: "d1", roleId: "cto", decisionClass: "B", subject: "infra migration", rationale: "confidential rationale", urgency: 70 });
      expect(ok.status).toBe("recorded");
      expect(ok.keyId).toBeTruthy();
      // FK: unknown role rejected
      expect((await recordDecision(e, { decisionId: "dX", roleId: "ceo", decisionClass: "B", subject: "s", rationale: "r" })).status).toBe("rejected");
      // invalid class + invalid urgency rejected
      expect((await recordDecision(e, { decisionId: "dY", roleId: "cto", decisionClass: "Z" as any, subject: "s", rationale: "r" })).status).toBe("rejected");
      expect((await recordDecision(e, { decisionId: "dZ", roleId: "cto", decisionClass: "B", subject: "s", rationale: "r", urgency: 200 })).status).toBe("rejected");
      const got = await getDecision(e, { decisionId: "d1" });
      expect(got.decision?.subject).toBe("infra migration");
      expect(got.decision?.rationale).toBe("confidential rationale");
      expect(got.decision?.principal).toBe("did:web:etzhayyim.com");
      expect(got.decision?.status).toBe("open");
      await recordDecision(e, { decisionId: "d2", roleId: "chro", decisionClass: "A", subject: "headcount", rationale: "r2" });
      expect((await listDecisions(e)).total).toBe(2);
      expect((await listDecisions(e, { roleId: "cto" })).total).toBe(1);
      expect((await listDecisions(e, { decisionClass: "A" })).total).toBe(1);
    });

    it("enforces read-cap: a non-recipient DID cannot decrypt the decision", async () => {
      await recordDecision(e, { decisionId: "d1", roleId: "cto", decisionClass: "A", subject: "M&A", rationale: "secret" });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listDecisions(outsider)).total).toBe(0);
      expect((await getDecision(outsider, { decisionId: "d1" })).error).toBe("notFound");
    });

    it("grants read-cap to an explicit recipient (CEO auto-disclose)", async () => {
      const ceo = "did:web:ceo.etzhayyim.com";
      const r = await recordDecision(e, { decisionId: "d1", roleId: "cto", decisionClass: "B", subject: "spend draft", rationale: "r", recipients: [ceo] });
      expect(r.status).toBe("recorded");
      expect((await listDecisions(e)).total).toBe(1); // owner can read
    });
  });

  describe("coverage rollup", () => {
    it("counts plaintext roles by mode + E2E decisions by class", async () => {
      await registerRole(e, { roleId: "cto", humanSeatPresent: false, aiMode: "primary", authorityClass: "C" });
      await registerRole(e, { roleId: "ceo", humanSeatPresent: true, aiMode: "shadow", authorityClass: "C" });
      await registerRole(e, { roleId: "coo", humanSeatPresent: true, aiMode: "shadow", authorityClass: "C" });
      await recordDecision(e, { decisionId: "d1", roleId: "cto", decisionClass: "B", subject: "s1", rationale: "r1" });
      await recordDecision(e, { decisionId: "d2", roleId: "cto", decisionClass: "B", subject: "s2", rationale: "r2" });
      await recordDecision(e, { decisionId: "d3", roleId: "cto", decisionClass: "A", subject: "s3", rationale: "r3" });
      const cov = await coverage(e);
      expect(cov.cxoRoleCount).toBe(3);
      expect(cov.cxoDecisionCount).toBe(3);
      expect(cov.rolesByMode?.shadow).toBe(2);
      expect(cov.rolesByMode?.primary).toBe(1);
      expect(cov.decisionsByClass?.B).toBe(2);
      expect(cov.decisionsByClass?.A).toBe(1);
    });
  });
});
