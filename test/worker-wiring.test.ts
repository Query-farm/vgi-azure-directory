import { test, expect } from "bun:test";
import { FunctionRegistry, ReadOnlyCatalogInterface } from "@query-farm/vgi";
import { makeDeltaFunction } from "../src/functions.js";
import { SPECS } from "../src/schema.js";
import { makeCatalog, AZURE_GRAPH_SECRET } from "../src/catalog.js";
import { FakeGraph } from "./fake-graph.js";

test("all three functions register and the azure catalog advertises them", () => {
  const g = new FakeGraph();
  const clientFactory = () => ({ fetchJson: g.fetch });

  const functions = SPECS.map((s) => makeDeltaFunction(s, clientFactory));
  expect(functions.length).toBe(3);

  const registry = new FunctionRegistry();
  for (const f of functions) registry.register(f);

  const cat = makeCatalog(functions);
  expect(cat.name).toBe("azure");
  expect(cat.secretTypes?.[0]).toBe(AZURE_GRAPH_SECRET);
  expect(cat.schemas[0]!.functions!.map((f) => (f as { meta: { name: string } }).meta.name).sort()).toEqual([
    "directory_devices_delta",
    "directory_groups_delta",
    "directory_users_delta",
  ]);

  // Constructs the read-only catalog interface without throwing.
  new ReadOnlyCatalogInterface(cat, registry);
});
