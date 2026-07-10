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

export interface FnExample {
  sql: string;
  description: string;
}

/** One entry of a static vgi.result_columns_schema — {name, type, description}. */
export interface ResultColumn {
  name: string;
  /** A real DuckDB type (VARCHAR / BOOLEAN / …). */ type: string;
  description: string;
}

export interface CollectionSpec {
  fn: string;
  collection: Collection;
  defaultSelect: string;
  description: string;
  business: BusinessCol[];
  /** vgi.title — human display name (multi-word so it doesn't equal the machine name). */
  title: string;
  /** vgi.keywords — search terms / synonyms. */
  keywords: string[];
  /** vgi.doc_llm — LLM-oriented "what is it / when to use it" prose. */
  docLlm: string;
  /** vgi.doc_md — richer human Markdown narrative. */
  docMd: string;
  /** vgi.result_columns_schema — the static result columns as {name,type,description}. */
  resultColumns: ResultColumn[];
  /** Per-function examples surfaced via the function descriptor. */
  examples: FnExample[];
}

// The control/cursor columns are common to every collection's output; only the
// three business columns in the middle differ. This shared head/tail keeps every
// result_columns_schema aligned with schemaFor()'s field order.
const RESULT_COLUMNS_HEAD: ResultColumn[] = [
  { name: "id", type: "VARCHAR", description: "The directory object's id (GUID). NULL on the marker row." },
  {
    name: "change_type",
    type: "VARCHAR",
    description: "'upsert' (created/updated) or 'removed' (deleted). NULL on the marker row.",
  },
  {
    name: "removed_reason",
    type: "VARCHAR",
    description: "For removed rows, the @removed.reason ('changed' or 'deleted'); NULL otherwise.",
  },
];
const RESULT_COLUMNS_TAIL: ResultColumn[] = [
  {
    name: "_row_kind",
    type: "VARCHAR",
    description: "NULL for data rows; 'marker' for the single trailing cursor row.",
  },
  {
    name: "_delta_next",
    type: "VARCHAR",
    description:
      "On the marker row, the verbatim @odata.deltaLink to persist and replay as the next cursor; NULL on data rows.",
  },
];

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
  title: "Entra Users Delta Feed",
  keywords: ["entra id", "azure ad", "users", "user", "accounts", "upn", "delta", "change feed", "identity"],
  docLlm:
    "Incremental change feed of Microsoft Entra ID (Azure AD) users via Microsoft Graph delta query. " +
    "Each scan returns users created or updated since the supplied delta_token (change_type 'upsert') " +
    "and users deleted (change_type 'removed'), followed by a marker row whose _delta_next is the " +
    "cursor to persist. Call with no delta_token for a full sync. Columns: user_principal_name, " +
    "display_name, and account_enabled by default (adjust with the select argument).",
  docMd:
    "## directory_users_delta\n\n" +
    "Entra ID users as an incremental change feed backed by Microsoft Graph's `users/delta` query. " +
    "Read data rows with `WHERE _row_kind IS NULL`; take the next cursor from the marker row's " +
    "`_delta_next`. See the examples for full, runnable queries.",
  resultColumns: [
    ...RESULT_COLUMNS_HEAD,
    { name: "user_principal_name", type: "VARCHAR", description: "The user's UPN (sign-in name)." },
    { name: "display_name", type: "VARCHAR", description: "The user's display name." },
    { name: "account_enabled", type: "BOOLEAN", description: "Whether the account is enabled for sign-in." },
    ...RESULT_COLUMNS_TAIL,
  ],
  examples: [
    {
      sql: "SELECT id, user_principal_name, display_name, account_enabled FROM azure.main.directory_users_delta() WHERE _row_kind IS NULL",
      description: "Full sync of all users (data rows only)",
    },
    {
      sql: "SELECT id, change_type, display_name FROM azure.main.directory_users_delta(delta_token := '<@odata.deltaLink>')",
      description: "Incremental sync replaying a previously saved delta cursor",
    },
    {
      sql: "SELECT _delta_next FROM azure.main.directory_users_delta() WHERE _row_kind = 'marker'",
      description: "Read the delta cursor to persist for the next sync",
    },
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
  title: "Entra Groups Delta Feed",
  keywords: ["entra id", "azure ad", "groups", "group", "security group", "distribution", "mail", "delta", "change feed"],
  docLlm:
    "Incremental change feed of Microsoft Entra ID (Azure AD) groups via Microsoft Graph delta query. " +
    "Each scan returns groups created or updated since the supplied delta_token (change_type 'upsert') " +
    "and groups deleted (change_type 'removed'), followed by a marker row whose _delta_next is the " +
    "cursor to persist. Call with no delta_token for a full sync. Columns: display_name, mail, and " +
    "security_enabled by default.",
  docMd:
    "## directory_groups_delta\n\n" +
    "Entra ID groups as an incremental change feed backed by Microsoft Graph's `groups/delta` query. " +
    "Read data rows with `WHERE _row_kind IS NULL`; take the next cursor from the marker row's " +
    "`_delta_next`. See the examples for full, runnable queries.",
  resultColumns: [
    ...RESULT_COLUMNS_HEAD,
    { name: "display_name", type: "VARCHAR", description: "The group's display name." },
    { name: "mail", type: "VARCHAR", description: "The group's mail address, if mail-enabled." },
    { name: "security_enabled", type: "BOOLEAN", description: "Whether the group is a security group." },
    ...RESULT_COLUMNS_TAIL,
  ],
  examples: [
    {
      sql: "SELECT id, display_name, mail, security_enabled FROM azure.main.directory_groups_delta() WHERE _row_kind IS NULL",
      description: "Full sync of all groups (data rows only)",
    },
    {
      sql: "SELECT id, display_name FROM azure.main.directory_groups_delta() WHERE _row_kind IS NULL AND security_enabled",
      description: "Security-enabled groups only",
    },
    {
      sql: "SELECT _delta_next FROM azure.main.directory_groups_delta() WHERE _row_kind = 'marker'",
      description: "Read the delta cursor to persist for the next sync",
    },
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
  title: "Entra Devices Delta Feed",
  keywords: ["entra id", "azure ad", "devices", "device", "operating system", "endpoints", "delta", "change feed"],
  docLlm:
    "Incremental change feed of Microsoft Entra ID (Azure AD) registered devices via Microsoft Graph " +
    "delta query. Each scan returns devices created or updated since the supplied delta_token " +
    "(change_type 'upsert') and devices deleted (change_type 'removed'), followed by a marker row " +
    "whose _delta_next is the cursor to persist. Call with no delta_token for a full sync. Columns: " +
    "display_name, operating_system, and account_enabled by default.",
  docMd:
    "## directory_devices_delta\n\n" +
    "Entra ID devices as an incremental change feed backed by Microsoft Graph's `devices/delta` query. " +
    "Read data rows with `WHERE _row_kind IS NULL`; take the next cursor from the marker row's " +
    "`_delta_next`. See the examples for full, runnable queries.",
  resultColumns: [
    ...RESULT_COLUMNS_HEAD,
    { name: "display_name", type: "VARCHAR", description: "The device's display name." },
    {
      name: "operating_system",
      type: "VARCHAR",
      description: "The device's operating system (e.g. Windows, iOS).",
    },
    { name: "account_enabled", type: "BOOLEAN", description: "Whether the device account is enabled." },
    ...RESULT_COLUMNS_TAIL,
  ],
  examples: [
    {
      sql: "SELECT id, display_name, operating_system, account_enabled FROM azure.main.directory_devices_delta() WHERE _row_kind IS NULL",
      description: "Full sync of all devices (data rows only)",
    },
    {
      sql: "SELECT operating_system, count(*) FROM azure.main.directory_devices_delta() WHERE _row_kind IS NULL GROUP BY operating_system",
      description: "Device count by operating system",
    },
    {
      sql: "SELECT _delta_next FROM azure.main.directory_devices_delta() WHERE _row_kind = 'marker'",
      description: "Read the delta cursor to persist for the next sync",
    },
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
