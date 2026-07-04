// The VGI table functions: directory_{users,groups,devices}_delta. All three come
// from one factory over the proven collectDelta driver. The GraphClient is injected
// so the worker wires the real MSAL-backed client and tests inject a fake.

import { defineTableFunction, secretsOfType, type OutputCollector } from "@query-farm/vgi";
import { Utf8 } from "@query-farm/apache-arrow";
import { collectDelta, deltaStartUrl } from "./users-delta.js";
import { schemaFor, buildDeltaBatch, type CollectionSpec } from "./schema.js";
import type { GraphClient } from "@vgi-azure/graph-core";

export type ClientFactory = (secret: Record<string, unknown>) => GraphClient;

interface Args {
  /** A previously persisted @odata.deltaLink (replayed verbatim), or "" for a full sync. */
  delta_token: string;
  /** $select projection — pinned for the life of a delta token. */
  select: string;
}
interface State {
  done: boolean;
  startUrl: string;
}

export function makeDeltaFunction(spec: CollectionSpec, clientFactory: ClientFactory) {
  const schema = schemaFor(spec);
  return defineTableFunction<Args, State>({
    name: spec.fn,
    description: spec.description,
    args: { delta_token: new Utf8(), select: new Utf8() },
    argDefaults: { delta_token: "", select: spec.defaultSelect },
    onBind: () => ({ outputSchema: schema }),
    initialState: (p) => ({
      done: false,
      startUrl: p.args.delta_token ? p.args.delta_token : deltaStartUrl(spec.collection, p.args.select),
    }),
    process: async (p, state: State, out: OutputCollector) => {
      if (state.done) {
        out.finish();
        return;
      }
      const secret = secretsOfType(p.secrets, "azure_graph")[0];
      if (!secret) throw new Error(`${spec.fn}: attach an 'azure_graph' secret (TYPE azure_graph)`);
      const client = clientFactory(secret as Record<string, unknown>);
      const { rows, deltaNext } = await collectDelta(client.fetchJson, state.startUrl);
      out.emit(buildDeltaBatch(spec, schema, rows, deltaNext));
      state.done = true; // next process() call hits the done branch and finishes.
    },
  });
}
