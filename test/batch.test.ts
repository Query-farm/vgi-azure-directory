import { test, expect } from "bun:test";
import { USERS, GROUPS, schemaFor, buildDeltaBatch } from "../src/schema.js";
import type { DirectoryRow } from "../src/users-delta.js";

test("buildDeltaBatch: N data rows + 1 marker row carrying deltaNext", () => {
  const schema = schemaFor(USERS);
  const rows: DirectoryRow[] = [
    { id: "u1", changeType: "upsert", removedReason: null, fields: { userPrincipalName: "u1@x", displayName: "One", accountEnabled: true } },
    { id: "u2", changeType: "removed", removedReason: "deleted", fields: {} },
  ];
  const batch = buildDeltaBatch(USERS, schema, rows, "https://graph/users/delta?$deltatoken=Z") as { numRows: number };
  expect(batch.numRows).toBe(3); // 2 data + 1 marker
});

test("schema columns: common + business + control, per collection", () => {
  expect(schemaFor(USERS).fields.map((f) => f.name)).toEqual([
    "id", "change_type", "removed_reason", "user_principal_name", "display_name", "account_enabled", "_row_kind", "_delta_next",
  ]);
  expect(schemaFor(GROUPS).fields.map((f) => f.name)).toContain("security_enabled");
});

test("buildDeltaBatch on an empty delta still emits the marker row", () => {
  const schema = schemaFor(USERS);
  const batch = buildDeltaBatch(USERS, schema, [], "https://graph/users/delta?$deltatoken=Z0") as { numRows: number };
  expect(batch.numRows).toBe(1);
});
