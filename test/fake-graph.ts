// A stateful fake of Microsoft Graph's /delta endpoint — enough to prove the
// cursor contract: versioned snapshots, real add/change/delete diffs, multi-page
// paging via $skiptoken, verbatim deltaLink, and 410 resyncRequired on an expired
// token. No network. Used only by the cursor-proof test.

import { ResyncRequired, type FetchJson } from "@vgi-azure/graph-core";

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface FakeObj {
  id: string;
  [k: string]: unknown;
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function unb64(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

export class FakeGraph {
  private objs = new Map<string, FakeObj>();
  private version = 0;
  private snapshots = new Map<number, Map<string, FakeObj>>();
  private expired = new Set<string>();

  constructor(
    private readonly collection: string = "users",
    private readonly pageSize: number = 100,
  ) {
    this.snap();
  }

  private snap(): void {
    this.snapshots.set(this.version, new Map([...this.objs].map(([k, v]) => [k, { ...v }])));
  }
  private bump(): void {
    this.version++;
    this.snap();
  }

  upsert(o: FakeObj): void {
    this.objs.set(o.id, { ...o });
    this.bump();
  }
  remove(id: string): void {
    if (this.objs.delete(id)) this.bump();
  }
  /** Mark a delta token (version string) expired → next replay 410s. */
  expireToken(deltaLinkUrl: string): void {
    const tok = new URL(deltaLinkUrl).searchParams.get("$deltatoken");
    if (tok) this.expired.add(tok);
  }

  /** The changes to emit for a scan whose base snapshot is `fromVersion`
   *  (null = full sync → every current object as an upsert). */
  private changeList(fromVersion: number | null): Record<string, unknown>[] {
    if (fromVersion === null) {
      return [...this.objs.values()].map((o) => ({ ...o }));
    }
    const base = this.snapshots.get(fromVersion) ?? new Map<string, FakeObj>();
    const out: Record<string, unknown>[] = [];
    for (const [id, cur] of this.objs) {
      const prev = base.get(id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(cur)) out.push({ ...cur });
    }
    for (const id of base.keys()) {
      if (!this.objs.has(id)) out.push({ id, "@removed": { reason: "deleted" } });
    }
    return out;
  }

  fetch: FetchJson = async (url) => {
    const u = new URL(url);
    const dt = u.searchParams.get("$deltatoken");
    const sk = u.searchParams.get("$skiptoken");

    if (dt && this.expired.has(dt)) {
      throw new ResyncRequired(`resyncRequired: token ${dt} expired`);
    }

    let base: number | null;
    let offset: number;
    if (sk) {
      const parsed = JSON.parse(unb64(sk)) as { base: number | null; offset: number };
      base = parsed.base;
      offset = parsed.offset;
    } else if (dt) {
      base = Number(dt);
      offset = 0;
    } else {
      base = null; // full sync
      offset = 0;
    }

    const all = this.changeList(base);
    const slice = all.slice(offset, offset + this.pageSize);
    const nextOffset = offset + this.pageSize;

    if (nextOffset < all.length) {
      const skiptoken = b64(JSON.stringify({ base, offset: nextOffset }));
      return {
        value: slice,
        "@odata.nextLink": `${GRAPH}/${this.collection}/delta?$skiptoken=${skiptoken}`,
      };
    }
    // Final page → deltaLink carrying the current version as the token.
    return {
      value: slice,
      "@odata.deltaLink": `${GRAPH}/${this.collection}/delta?$deltatoken=${this.version}`,
    };
  };
}
