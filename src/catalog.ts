// The `azure` catalog descriptor + the azure_graph secret type. Directory is the
// graph-core seam owner, so this secret shape (app-only client-credentials) is the
// freeze the other eight workers reuse.

import { Schema, Field, Utf8 } from "@query-farm/apache-arrow";
import type { CatalogDescriptor, SecretTypeDescriptor, VgiFunction } from "@query-farm/vgi";

export const AZURE_GRAPH_SECRET: SecretTypeDescriptor = {
  name: "azure_graph",
  description: "Microsoft Entra app-only (client-credentials) credentials for Microsoft Graph",
  schema: new Schema([
    new Field("tenant_id", new Utf8(), true),
    new Field("client_id", new Utf8(), true),
    new Field("client_secret", new Utf8(), true, new Map([["redact", "true"]])),
  ]),
};

export function makeCatalog(functions: VgiFunction[]): CatalogDescriptor {
  return {
    name: "azure",
    defaultSchema: "main",
    comment: "Microsoft Entra directory (users/groups/devices) via Graph delta — vgi-azure-directory",
    sourceUrl: "https://query.farm",
    secretTypes: [AZURE_GRAPH_SECRET],
    schemas: [{ name: "main", functions }],
  };
}
