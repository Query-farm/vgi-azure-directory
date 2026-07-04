// The directory delta driver — pure logic over graph-core, no SDK / no network.
// One driver serves users, groups, and devices: a directoryObject delta row is
// generic (id + change-type + business fields), so the same code walks every
// collection. This is the module the crash/resume cursor-proof exercises.

import { paginate, isRemoved, type FetchJson } from "@vgi-azure/graph-core";

const GRAPH = "https://graph.microsoft.com/v1.0";

export type Collection = "users" | "groups" | "devices";
export type ChangeType = "upsert" | "removed";

export interface DirectoryRow {
  id: string;
  changeType: ChangeType;
  /** '@removed.reason' (changed|deleted) for removed rows, else null. */
  removedReason: string | null;
  /** Business fields (non-`@` keys). Empty for id-only `@removed` tombstones. */
  fields: Record<string, unknown>;
}

export interface DeltaResult {
  rows: DirectoryRow[];
  /** The verbatim @odata.deltaLink to persist as the cursor for the next scan. */
  deltaNext: string;
}

/** Build the initial full-sync URL for a collection. `select` is pinned for the
 *  life of the resulting delta token (changing it forces a 410 resync). */
export function deltaStartUrl(collection: Collection, select: string): string {
  return `${GRAPH}/${collection}/delta?$select=${encodeURIComponent(select)}`;
}

/** Map one raw Graph object to a generic directory row (works for any collection). */
export function toRow(obj: Record<string, unknown>): DirectoryRow {
  const id = String(obj.id ?? "");
  if (isRemoved(obj)) {
    const removed = obj["@removed"] as { reason?: string } | undefined;
    return { id, changeType: "removed", removedReason: String(removed?.reason ?? "deleted"), fields: {} };
  }
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!k.startsWith("@")) fields[k] = v;
  return { id, changeType: "upsert", removedReason: null, fields };
}

/**
 * Drain a delta scan to completion from `startUrl` (a fresh full-sync URL, or a
 * previously persisted @odata.deltaLink replayed verbatim). Returns every change
 * row plus the new deltaLink to persist.
 *
 * The loss-safety contract lives in the CALLER: persist `deltaNext` only after the
 * rows are durably applied. On crash the caller still holds the old token, re-runs
 * this, and Graph replays the same window — absorbed idempotently by upsert-by-id.
 */
export async function collectDelta(fetchJson: FetchJson, startUrl: string): Promise<DeltaResult> {
  const rows: DirectoryRow[] = [];
  let deltaNext: string | undefined;
  for await (const page of paginate<Record<string, unknown>>(fetchJson, startUrl)) {
    for (const obj of page.value) rows.push(toRow(obj));
    if (page.deltaLink) deltaNext = page.deltaLink;
  }
  if (deltaNext === undefined) {
    throw new Error("delta scan ended without an @odata.deltaLink");
  }
  return { rows, deltaNext };
}
