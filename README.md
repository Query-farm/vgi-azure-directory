# vgi-azure-directory

A [VGI](https://query.farm) worker (**Microsoft Entra Directory**) for DuckDB. Microsoft Entra ID (Azure AD) directory objects as incremental (delta) DuckDB table functions over Microsoft Graph: `directory_users_delta`, `directory_groups_delta` and `directory_devices_delta`. Each scan returns the objects created or updated (`change_type = 'upsert'`) or deleted (`'removed'`) since the last cursor, plus a single marker row (`_row_kind = 'marker'`) whose `_delta_next` holds the `@odata.deltaLink` to persist. Call with no arguments for a full sync; pass `delta_token := '<link>'` for an incremental one.

## Quick start

Every [GitHub release](https://github.com/Query-farm/vgi-azure-directory/releases) ships a prebuilt worker binary. The `vgi` extension downloads the one for your platform, checks its SHA-256 and caches it, so there is nothing to install besides DuckDB:

```sql
INSTALL vgi FROM community;
LOAD vgi;

ATTACH 'azure' AS azure (TYPE vgi, LOCATION 'github-auto://Query-farm/vgi-azure-directory@v0.4.0');

-- Bind directory_users_delta and expose its result columns (credential-free; drop LIMIT
-- 0 and attach an azure_graph secret to sync real users)
SELECT id, user_principal_name, display_name, account_enabled FROM azure.main.directory_users_delta() LIMIT 0;

-- Bind directory_groups_delta and expose its result columns (credential-free; attach an
-- azure_graph secret to sync real groups)
SELECT id, display_name, mail, security_enabled FROM azure.main.directory_groups_delta() LIMIT 0;
```

The examples are credential-free `LIMIT 0` bind probes: they check that each function binds and show its result columns without calling Azure. To pull real rows, create an `azure_graph` secret (see [Credentials](#credentials)) and drop the `LIMIT 0`.

All the Query Farm Azure workers use the catalog name `azure`. To attach more than one in the same session, give each its own alias (for example `ATTACH 'azure' AS azure_directory (...)`) and qualify queries with that alias instead of `azure`.

Prebuilt binaries cover macOS (Apple silicon), Linux (x86-64 and arm64). `github-auto://` needs an explicit release tag; change `@v0.4.0` to move to a newer release.

### Other ways to run it

- **Docker** (the image bundles the worker; needs a container runtime):

  ```sql
  ATTACH 'azure' AS azure (TYPE vgi, LOCATION 'docker://ghcr.io/query-farm/vgi-azure-directory:0.4.0');
  ```

- **Manual download.** Download the archive for your platform from the [releases page](https://github.com/Query-farm/vgi-azure-directory/releases), verify it against its `.sha256` file (a cosign `.cosign.bundle` is published alongside), unpack it, and set `LOCATION` to the path of the extracted worker executable.

### Build from source

To build and test the worker yourself, see [Development](#development).

## Credentials

Live queries authenticate with an `azure_graph` secret holding app-only Microsoft Entra client credentials for a service principal: `TENANT_ID`, `CLIENT_ID` and `CLIENT_SECRET` (the client secret is redacted when secrets are listed). The worker registers the `azure_graph` secret type when it is attached, so create the secret after the `ATTACH`:

```sql
ATTACH 'azure' AS azure (TYPE vgi, LOCATION 'github-auto://Query-farm/vgi-azure-directory@v0.4.0');
CREATE SECRET azure_sp (TYPE azure_graph, TENANT_ID '<tenant-guid>', CLIENT_ID '<app-guid>', CLIENT_SECRET '<secret>');
```

For this worker the service principal needs Microsoft Graph application read permission for the objects being queried (for example `User.Read.All`, `Group.Read.All`, `Device.Read.All`).

## Development

Requires [Bun](https://bun.sh). `bun install` also fetches the shared `@vgi-azure/graph-core` package from GitHub.

```bash
bun install && bun test
bun run typecheck
```

To attach a local checkout, point `LOCATION` at the launch wrapper:

```sql
ATTACH 'azure' AS azure (TYPE vgi, LOCATION '/path/to/vgi-azure-directory/bin/vgi-azure-directory-worker');
```

## License

MIT. See [LICENSE](LICENSE).
