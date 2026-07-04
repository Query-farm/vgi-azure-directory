// THE reason vgi-azure-directory exists: prove the Graph delta token is a durable,
// no-loss VGI scan cursor — the TS analogue of vgi-cdc's crash-resume test.

import { test, expect } from "bun:test";
import { ResyncRequired } from "@vgi-azure/graph-core";
import { collectDelta, deltaStartUrl, type DirectoryRow } from "../src/users-delta.js";
import { FakeGraph } from "./fake-graph.js";

const SELECT = "id,userPrincipalName,displayName,accountEnabled";

type Store = Map<string, Record<string, unknown>>;
function apply(store: Store, rows: DirectoryRow[]): void {
  for (const r of rows) {
    if (r.changeType === "removed") store.delete(r.id);
    else store.set(r.id, r.fields);
  }
}
const clone = (s: Store): Store => new Map([...s].map(([k, v]) => [k, { ...v }]));

function seed(g: FakeGraph): void {
  g.upsert({ id: "u1", userPrincipalName: "u1@x", displayName: "One", accountEnabled: true });
  g.upsert({ id: "u2", userPrincipalName: "u2@x", displayName: "Two", accountEnabled: true });
  g.upsert({ id: "u3", userPrincipalName: "u3@x", displayName: "Three", accountEnabled: true });
}

test("full sync pages through everything and returns a deltaLink", async () => {
  const g = new FakeGraph("users", /*pageSize*/ 2); // 3 objs → 2 pages
  seed(g);
  let fetches = 0;
  const counting = async (url: string) => { fetches++; return g.fetch(url); };

  const r = await collectDelta(counting, deltaStartUrl("users", SELECT));

  expect(r.rows.map((x) => x.id).sort()).toEqual(["u1", "u2", "u3"]);
  expect(r.rows.every((x) => x.changeType === "upsert")).toBe(true);
  expect(fetches).toBe(2); // two pages, nextLink followed verbatim
  expect(r.deltaNext).toContain("$deltatoken=");
});

test("incremental delta returns only changed + removed rows", async () => {
  const g = new FakeGraph("users", 100);
  seed(g);
  const r0 = await collectDelta(g.fetch, deltaStartUrl("users", SELECT));

  g.upsert({ id: "u4", userPrincipalName: "u4@x", displayName: "Four", accountEnabled: true });
  g.remove("u2");
  g.upsert({ id: "u3", userPrincipalName: "u3@x", displayName: "Three-CHANGED", accountEnabled: false });

  const r1 = await collectDelta(g.fetch, r0.deltaNext);
  const byId = Object.fromEntries(r1.rows.map((x) => [x.id, x]));

  expect(Object.keys(byId).sort()).toEqual(["u2", "u3", "u4"]); // u1 unchanged → absent
  expect(byId.u2!.changeType).toBe("removed");
  expect(byId.u2!.removedReason).toBe("deleted");
  expect(byId.u4!.changeType).toBe("upsert");
  expect(byId.u3!.fields.displayName).toBe("Three-CHANGED");
});

test("CRASH/RESUME: replay after a crash yields identical state — no loss, no dup", async () => {
  const g = new FakeGraph("users", 2);
  seed(g);

  // Initial sync, applied and cursor persisted.
  const r0 = await collectDelta(g.fetch, deltaStartUrl("users", SELECT));
  const store: Store = new Map();
  apply(store, r0.rows);
  const D1 = r0.deltaNext;

  // Source mutates.
  g.upsert({ id: "u4", userPrincipalName: "u4@x", displayName: "Four", accountEnabled: true });
  g.remove("u2");
  g.upsert({ id: "u3", userPrincipalName: "u3@x", displayName: "Three-CHANGED", accountEnabled: false });

  // Scan #2 runs and rows are applied — but the worker CRASHES before persisting
  // the new cursor, so the durable cursor is still D1.
  const r1 = await collectDelta(g.fetch, D1);
  const crashed = clone(store);
  apply(crashed, r1.rows); // rows applied, but D2 NOT persisted

  // Resume: caller re-runs from the still-durable D1. Graph replays the SAME window.
  const r1b = await collectDelta(g.fetch, D1);
  const resumed = clone(store);
  apply(resumed, r1b.rows);

  // At-least-once capture + idempotent upsert-by-id ⇒ exactly-once effect.
  expect(r1b.rows).toEqual(r1.rows);              // identical replay
  expect([...resumed.entries()].sort()).toEqual([...crashed.entries()].sort());
  expect(resumed.has("u2")).toBe(false);          // the delete survived
  expect(resumed.has("u4")).toBe(true);           // the add survived
  expect(resumed.get("u3")!.displayName).toBe("Three-CHANGED"); // the change survived
  expect(resumed.get("u3")!.accountEnabled).toBe(false);
});

test("expired token → ResyncRequired (caller drops token, restarts full sync)", async () => {
  const g = new FakeGraph("users", 100);
  seed(g);
  const r0 = await collectDelta(g.fetch, deltaStartUrl("users", SELECT));
  g.expireToken(r0.deltaNext);

  await expect(collectDelta(g.fetch, r0.deltaNext)).rejects.toBeInstanceOf(ResyncRequired);

  // Recovery: a fresh full sync succeeds.
  const recovered = await collectDelta(g.fetch, deltaStartUrl("users", SELECT));
  expect(recovered.rows.length).toBe(3);
});
