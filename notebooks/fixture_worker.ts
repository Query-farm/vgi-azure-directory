/** Synthetic client injected through the worker's existing tested factory seam.
 * This runs the pinned real VGI function and schema; no Azure network client is used.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { pinnedCheckout } from "./pinned_checkout.ts";

const [repository, revision] = process.argv.slice(2);
if (repository !== "Query-farm/vgi-azure-directory" || !revision) {
  throw new Error(
    "Usage: bun run fixture_worker.ts Query-farm/vgi-azure-directory FULL_SHA",
  );
}
const checkout = await pinnedCheckout(repository, revision);
const source = (path: string) =>
  import(pathToFileURL(join(checkout, path)).href);
const require = createRequire(join(checkout, "package.json"));
const { Worker, FunctionRegistry, ReadOnlyCatalogInterface } = await import(
  pathToFileURL(require.resolve("@query-farm/vgi")).href
);
const { makeDeltaFunction } = await source("src/functions.ts");
const { USERS } = await source("src/schema.ts");
const { makeCatalog } = await source("src/catalog.ts");
const { FakeGraph } = await source("test/fake-graph.ts");

const removals = Number(process.env.NOTEBOOK_REMOVALS ?? "1");
if (!Number.isInteger(removals) || removals < 1 || removals > 2) {
  throw new Error("NOTEBOOK_REMOVALS must be 1 or 2.");
}
const original = new FakeGraph("users", 2);
const changed = new FakeGraph("users", 2);
const person = (id: number, enabled: boolean) => ({
  id: `synthetic-user-${id}`,
  userPrincipalName: `user${id}@example.invalid`,
  displayName: `Synthetic user ${id}`,
  accountEnabled: enabled,
});
for (let id = 1; id <= 6; id++) {
  original.upsert(person(id, id !== 6));
  changed.upsert(person(id, id !== 6));
}
changed.upsert(person(3, false));
changed.upsert(person(7, true));
changed.upsert(person(8, false));
for (let id = 1; id <= removals; id++) changed.remove(`synthetic-user-${id}`);

const fetchJson = async (address: string) => {
  const url = new URL(address);
  if (
    url.origin !== "https://graph.microsoft.com" ||
    url.pathname !== "/v1.0/users/delta"
  ) {
    throw new Error("The synthetic fixture supports only the users delta URL.");
  }
  const skip = url.searchParams.get("$skiptoken");
  const base = skip
    ? JSON.parse(Buffer.from(skip, "base64url").toString("utf8")).base
    : null;
  // The initial full scan reads the original snapshot. A delta cursor (including
  // its continuation pages) reads the prepared later snapshot. Replays are stable.
  const incremental = url.searchParams.has("$deltatoken") || base !== null;
  return (incremental ? changed : original).fetch(address);
};

const functions = [makeDeltaFunction(USERS, () => ({ fetchJson }))];
const registry = new FunctionRegistry();
for (const fn of functions) registry.register(fn);
const catalogInterface = new ReadOnlyCatalogInterface(
  makeCatalog(functions),
  registry,
);
await new Worker({ functions, catalogInterface }).run();
