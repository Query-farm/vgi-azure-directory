// Arrow output schemas + row→batch mapping for the three directory collections.
// One CollectionSpec drives everything (schema, select, business columns), so
// users/groups/devices are data, not duplicated code.

import { Schema, Field, Utf8, Bool } from "@query-farm/apache-arrow";
import { batchFromColumns } from "@query-farm/vgi";
import { ROW_KIND, MARKER, DELTA_NEXT } from "@vgi-azure/graph-core";
import type { Collection, DirectoryRow } from "./users-delta.js";

export interface BusinessCol {
  /** SQL column name. */ col: string;
  /** Graph field name in the object. */ field: string;
  kind: "string" | "bool";
}

export interface CollectionSpec {
  fn: string;
  collection: Collection;
  defaultSelect: string;
  description: string;
  business: BusinessCol[];
}

export const USERS: CollectionSpec = {
  fn: "directory_users_delta",
  collection: "users",
  defaultSelect: "id,userPrincipalName,displayName,accountEnabled",
  description: "Entra ID users via Microsoft Graph delta (incremental change feed with removals).",
  business: [
    { col: "user_principal_name", field: "userPrincipalName", kind: "string" },
    { col: "display_name", field: "displayName", kind: "string" },
    { col: "account_enabled", field: "accountEnabled", kind: "bool" },
  ],
};

export const GROUPS: CollectionSpec = {
  fn: "directory_groups_delta",
  collection: "groups",
  defaultSelect: "id,displayName,mail,securityEnabled",
  description: "Entra ID groups via Microsoft Graph delta.",
  business: [
    { col: "display_name", field: "displayName", kind: "string" },
    { col: "mail", field: "mail", kind: "string" },
    { col: "security_enabled", field: "securityEnabled", kind: "bool" },
  ],
};

export const DEVICES: CollectionSpec = {
  fn: "directory_devices_delta",
  collection: "devices",
  defaultSelect: "id,displayName,operatingSystem,accountEnabled",
  description: "Entra ID devices via Microsoft Graph delta.",
  business: [
    { col: "display_name", field: "displayName", kind: "string" },
    { col: "operating_system", field: "operatingSystem", kind: "string" },
    { col: "account_enabled", field: "accountEnabled", kind: "bool" },
  ],
};

export const SPECS: readonly CollectionSpec[] = [USERS, GROUPS, DEVICES];

export function schemaFor(spec: CollectionSpec): Schema {
  return new Schema([
    new Field("id", new Utf8(), true),
    new Field("change_type", new Utf8(), true),
    new Field("removed_reason", new Utf8(), true),
    ...spec.business.map((b) => new Field(b.col, b.kind === "bool" ? new Bool() : new Utf8(), true)),
    new Field(ROW_KIND, new Utf8(), true),
    new Field(DELTA_NEXT, new Utf8(), true),
  ]);
}

/**
 * Build one Arrow batch: the change rows (with `_row_kind` null) followed by
 * exactly ONE marker row (all business columns null, `_row_kind='marker'`,
 * `_delta_next` = the verbatim deltaLink). Consumers read data via
 * `WHERE _row_kind IS NULL` and the cursor from the marker row — the graph-core §D
 * contract. Emitting N+1 rows in one batch keeps the marker atomic with its data.
 */
export function buildDeltaBatch(spec: CollectionSpec, schema: Schema, rows: DirectoryRow[], deltaNext: string) {
  const cols: Record<string, unknown[]> = { id: [], change_type: [], removed_reason: [], [ROW_KIND]: [], [DELTA_NEXT]: [] };
  for (const b of spec.business) cols[b.col] = [];

  for (const r of rows) {
    cols.id!.push(r.id);
    cols.change_type!.push(r.changeType);
    cols.removed_reason!.push(r.removedReason);
    for (const b of spec.business) {
      const v = r.fields[b.field];
      cols[b.col]!.push(v == null ? null : b.kind === "bool" ? Boolean(v) : String(v));
    }
    cols[ROW_KIND]!.push(null);
    cols[DELTA_NEXT]!.push(null);
  }

  // The single marker row.
  cols.id!.push(null);
  cols.change_type!.push(null);
  cols.removed_reason!.push(null);
  for (const b of spec.business) cols[b.col]!.push(null);
  cols[ROW_KIND]!.push(MARKER);
  cols[DELTA_NEXT]!.push(deltaNext);

  return batchFromColumns(cols as Record<string, unknown[]>, schema);
}
