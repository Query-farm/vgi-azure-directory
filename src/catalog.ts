// The `azure` catalog descriptor + the azure_graph secret type. Directory is the
// graph-core seam owner, so this secret shape (app-only client-credentials) is the
// freeze the other eight workers reuse.
//
// This file also carries the catalog- and schema-level vgi.* documentation/discovery
// tags that vgi-lint grades. Tag shapes follow vgi-lint's TAGS.md: JSON-valued tags
// (keywords/categories/executable_examples/agent_test_tasks/example_queries) are JSON
// strings; every example SQL is catalog-qualified (azure.main.<fn>) so it binds when the
// catalog is attached. The directory functions require an `azure_graph` secret to RUN,
// so the executable examples and agent-test tasks are catalog-qualified, syntactically
// valid, and credential-gated (they execute once an azure_graph secret is attached).

import { Schema, Field, Utf8 } from "@query-farm/apache-arrow";
import type { CatalogDescriptor, SecretTypeDescriptor, ViewDescriptor, VgiFunction } from "@query-farm/vgi";

const REPO = "https://github.com/Query-farm/vgi-azure-directory";
const ISSUES = `${REPO}/issues`;

export const AZURE_GRAPH_SECRET: SecretTypeDescriptor = {
  name: "azure_graph",
  description: "Microsoft Entra app-only (client-credentials) credentials for Microsoft Graph",
  schema: new Schema([
    new Field("tenant_id", new Utf8(), true),
    new Field("client_id", new Utf8(), true),
    new Field("client_secret", new Utf8(), true, new Map([["redact", "true"]])),
  ]),
};

/** Catalog-level tags: docs, discovery, provenance, and the agent-test suite. */
const CATALOG_TAGS: Record<string, string> = {
  "vgi.title": "Microsoft Entra Directory",
  "vgi.doc_llm":
    "Microsoft Entra ID (Azure AD) directory objects as SQL delta table functions over Microsoft " +
    "Graph. Reach for it to sync the tenant's users, groups, and devices as an incremental change " +
    "feed: each scan returns the objects that were created/updated (change_type 'upsert') or " +
    "deleted (change_type 'removed') since the last cursor, plus a marker row carrying the next " +
    "delta cursor to persist. A first call with no delta_token performs a full sync; passing a " +
    "previously saved delta_token returns only what changed. Requires an app-only (client-" +
    "credentials) 'azure_graph' secret (tenant_id, client_id, client_secret) with Graph read " +
    "permission for the objects being queried (e.g. User.Read.All, Group.Read.All, Device.Read.All).",
  "vgi.doc_md":
    "## Microsoft Entra Directory\n\n" +
    "Incremental (delta) access to Microsoft Entra ID (Azure AD) directory objects via Microsoft " +
    "Graph, exposed as three DuckDB table functions.\n\n" +
    "- **`directory_users_delta`** — Entra ID users as an incremental change feed (with removals).\n" +
    "- **`directory_groups_delta`** — Entra ID groups as an incremental change feed.\n" +
    "- **`directory_devices_delta`** — Entra ID devices as an incremental change feed.\n\n" +
    "Each function returns changed objects plus a single marker row (`_row_kind = 'marker'`) whose " +
    "`_delta_next` column holds the verbatim `@odata.deltaLink` to persist and replay on the next " +
    "scan. Call with no arguments for a full sync; pass `delta_token := '<link>'` for an " +
    "incremental sync. An app-only `azure_graph` secret (Microsoft Entra client credentials) is " +
    "required.",
  "vgi.keywords": JSON.stringify([
    "azure",
    "entra id",
    "azure ad",
    "microsoft graph",
    "directory",
    "users",
    "groups",
    "devices",
    "delta",
    "change feed",
    "identity",
    "iam",
  ]),
  "vgi.author": "Query Farm LLC",
  "vgi.copyright": "Copyright 2026 Query Farm LLC",
  "vgi.license": "MIT",
  "vgi.support_contact": ISSUES,
  "vgi.support_policy_url": ISSUES,
  // Guaranteed-runnable, catalog-qualified examples (VGI509/VGI906). A LIVE sync needs
  // an attached azure_graph secret and a network call to Microsoft Graph, so these are
  // credential-free `LIMIT 0` schema/bind probes: they verify each function binds and
  // expose its exact result columns without fetching (and without credentials). Drop the
  // `LIMIT 0` and attach an azure_graph secret to pull real rows — the fuller, data-
  // returning queries live in each function's `examples` and the schema `example_queries`.
  "vgi.executable_examples": JSON.stringify([
    {
      name: "users_bind_probe",
      description:
        "Bind directory_users_delta and expose its result columns (credential-free; drop LIMIT 0 and attach an azure_graph secret to sync real users)",
      sql: "SELECT id, user_principal_name, display_name, account_enabled FROM azure.main.directory_users_delta() LIMIT 0",
    },
    {
      name: "groups_bind_probe",
      description:
        "Bind directory_groups_delta and expose its result columns (credential-free; attach an azure_graph secret to sync real groups)",
      sql: "SELECT id, display_name, mail, security_enabled FROM azure.main.directory_groups_delta() LIMIT 0",
    },
    {
      name: "devices_bind_probe",
      description:
        "Bind directory_devices_delta and expose its result columns (credential-free; attach an azure_graph secret to sync real devices)",
      sql: "SELECT id, display_name, operating_system, account_enabled FROM azure.main.directory_devices_delta() LIMIT 0",
    },
  ]),
  // The agent-suitability suite (VGI520/VGI920), catalog only. Every worker object is
  // exercised by exactly one task. `reference_sql` is the canonical fully-qualified
  // solution (grader-only) — it drives static coverage (VGI520) and authenticated
  // reference grading; `success_criteria` is the LLM-judge rubric used when the sim
  // runs unauthenticated (a live directory scan needs an azure_graph secret and returns
  // tenant-specific data, so an exact-compare reference can only be graded with real
  // credentials). None of reference_sql / success_criteria is ever shown to the analyst.
  "vgi.agent_test_tasks": JSON.stringify([
    {
      name: "list_enabled_users",
      prompt: "List the enabled users in the Entra ID tenant with their user principal name and display name.",
      reference_sql:
        "SELECT user_principal_name, display_name FROM azure.main.directory_users_delta() WHERE _row_kind IS NULL AND account_enabled ORDER BY user_principal_name",
      success_criteria:
        "The answer queries directory_users_delta(), filters to data rows (_row_kind IS NULL) with account_enabled = true, and returns user_principal_name and display_name.",
    },
    {
      name: "save_delta_cursor",
      prompt: "After syncing users, how do I get the cursor to use for the next incremental sync?",
      reference_sql:
        "SELECT _delta_next FROM azure.main.directory_users_delta() WHERE _row_kind = 'marker'",
      success_criteria:
        "The answer selects _delta_next from the marker row (_row_kind = 'marker') of directory_users_delta() and explains it should be replayed via the delta_token argument.",
    },
    {
      name: "security_groups",
      prompt: "Which groups in the directory are security-enabled?",
      reference_sql:
        "SELECT display_name FROM azure.main.directory_groups_delta() WHERE _row_kind IS NULL AND security_enabled ORDER BY display_name",
      success_criteria:
        "The answer queries directory_groups_delta(), filters to data rows where security_enabled = true, and returns the group display_name.",
    },
    {
      name: "devices_by_os",
      prompt: "How many registered devices are there of each operating system?",
      reference_sql:
        "SELECT operating_system, count(*) AS device_count FROM azure.main.directory_devices_delta() WHERE _row_kind IS NULL GROUP BY operating_system ORDER BY device_count DESC, operating_system",
      success_criteria:
        "The answer queries directory_devices_delta(), filters to data rows (_row_kind IS NULL), groups by operating_system and returns a per-OS device count.",
    },
    {
      name: "browse_collections",
      prompt: "What directory object types can I sync, and which table function serves each?",
      reference_sql:
        "SELECT collection, table_function FROM azure.main.directory_collections ORDER BY collection",
      success_criteria:
        "The answer reads directory_collections and lists the object types (users, groups, devices) alongside their table functions.",
    },
  ]),
};

/** Schema-level tags: docs, discovery, the category registry, and shown examples. */
const SCHEMA_TAGS: Record<string, string> = {
  "vgi.title": "Entra Directory",
  "vgi.doc_llm":
    "The Microsoft Entra ID directory delta functions. Each function is an incremental change feed " +
    "for one object type — users, groups, or devices — driven by Microsoft Graph's delta query. A " +
    "scan returns rows for objects created/updated (change_type 'upsert') or deleted (change_type " +
    "'removed') since the supplied delta_token, followed by one marker row whose _delta_next column " +
    "is the cursor to persist for the next scan. Omit delta_token for a full sync; the $select " +
    "projection is pinned for the life of a token.",
  "vgi.doc_md":
    "## Entra directory delta functions\n\n" +
    "| Function | Object type | Returns |\n" +
    "| --- | --- | --- |\n" +
    "| `directory_users_delta` | Users | changed users + delta cursor |\n" +
    "| `directory_groups_delta` | Groups | changed groups + delta cursor |\n" +
    "| `directory_devices_delta` | Devices | changed devices + delta cursor |\n\n" +
    "All three share the same shape: read data rows with `WHERE _row_kind IS NULL`, and take the " +
    "next cursor from the single marker row's `_delta_next`. Each requires an app-only " +
    "`azure_graph` secret.",
  "vgi.keywords": JSON.stringify([
    "entra id",
    "azure ad",
    "directory",
    "users",
    "groups",
    "devices",
    "delta query",
    "change feed",
    "identity",
  ]),
  domain: "identity",
  // Ordered navigation registry; each `name` is referenced by an object's vgi.category.
  "vgi.categories": JSON.stringify([
    {
      name: "discovery",
      title: "Discovery",
      description:
        "Browsable, credential-free entry points for finding your way around the directory catalog.",
    },
    {
      name: "directory-delta",
      title: "Directory Delta Feeds",
      description:
        "Incremental change feeds for Microsoft Entra ID directory objects (users, groups, devices) via Microsoft Graph delta query.",
    },
  ]),
  "vgi.example_queries": JSON.stringify([
    {
      description: "Full sync of enabled users",
      sql: "SELECT id, user_principal_name, display_name FROM azure.main.directory_users_delta() WHERE _row_kind IS NULL AND account_enabled",
    },
    {
      description: "Incremental sync from a saved cursor",
      sql: "SELECT id, change_type, display_name FROM azure.main.directory_users_delta(delta_token := '<@odata.deltaLink>')",
    },
    {
      description: "Security-enabled groups",
      sql: "SELECT id, display_name, mail FROM azure.main.directory_groups_delta() WHERE _row_kind IS NULL AND security_enabled",
    },
  ]),
};

// A browsable, credential-free discovery view: the three delta collections, the table
// function that serves each, and a one-line description. Its definition is a self-
// contained VALUES relation evaluated entirely by DuckDB (no worker call, no secret), so
// an agent can `SELECT * FROM azure.main.directory_collections` to learn the surface
// before it ever needs Microsoft Graph credentials. This is the worker's browsable entry
// point (VGI146): every other object here is a credential-gated table function.
const DIRECTORY_COLLECTIONS_VIEW: ViewDescriptor = {
  name: "directory_collections",
  definition:
    "SELECT collection, object_type, table_function, description FROM (VALUES " +
    "('users', 'user', 'directory_users_delta', 'Microsoft Entra ID users as an incremental Graph delta change feed'), " +
    "('groups', 'group', 'directory_groups_delta', 'Microsoft Entra ID groups as an incremental Graph delta change feed'), " +
    "('devices', 'device', 'directory_devices_delta', 'Microsoft Entra ID registered devices as an incremental Graph delta change feed')" +
    ") AS t(collection, object_type, table_function, description)",
  comment:
    "The directory collections this catalog exposes (users, groups, devices) and the delta table function that serves each. Browsable without credentials.",
  columnComments: {
    collection: "The collection slug (users / groups / devices).",
    object_type: "The singular Microsoft Entra object type the collection contains.",
    table_function: "The catalog table function that syncs this collection as a delta feed.",
    description: "A one-line description of the collection.",
  },
  tags: {
    "vgi.title": "Directory Collection Index",
    "vgi.category": "discovery",
    domain: "identity",
    "vgi.doc_llm":
      "A static, credential-free catalog of the directory collections this worker exposes: one row per " +
      "collection (users, groups, devices) giving its object type, the table function that syncs it as an " +
      "incremental Microsoft Graph delta feed, and a short description. Query it to discover the worker's " +
      "surface before attaching an azure_graph secret.",
    "vgi.doc_md":
      "## directory_collections\n\n" +
      "A browsable, credential-free index of the directory collections this catalog exposes. One row per " +
      "collection, naming the delta table function that syncs it. Start here, then call the named function " +
      "(with an `azure_graph` secret attached) to sync that collection.",
    "vgi.keywords": JSON.stringify([
      "directory",
      "collections",
      "catalog",
      "discovery",
      "users",
      "groups",
      "devices",
      "table functions",
    ]),
    "vgi.example_queries": JSON.stringify([
      {
        description: "List every collection and the table function that serves it",
        sql: "SELECT collection, table_function FROM azure.main.directory_collections ORDER BY collection",
      },
      {
        description: "Find the table function for a given object type",
        sql: "SELECT table_function FROM azure.main.directory_collections WHERE object_type = 'group'",
      },
    ]),
  },
};

export function makeCatalog(functions: VgiFunction[]): CatalogDescriptor {
  return {
    name: "azure",
    defaultSchema: "main",
    comment: "Microsoft Entra directory (users/groups/devices) via Graph delta — vgi-azure-directory",
    sourceUrl: REPO,
    tags: CATALOG_TAGS,
    secretTypes: [AZURE_GRAPH_SECRET],
    schemas: [
      {
        name: "main",
        comment: "Microsoft Entra ID directory objects (users, groups, devices) as incremental Graph delta feeds.",
        tags: SCHEMA_TAGS,
        views: [DIRECTORY_COLLECTIONS_VIEW],
        functions,
      },
    ],
  };
}
