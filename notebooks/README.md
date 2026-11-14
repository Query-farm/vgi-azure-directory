# Executable SQL examples

| Notebook | Question |
| --- | --- |
| [Rebuild a directory from its changes](01_rebuild_directory_from_changes.ipynb) | How do change rows, cursor markers and user identities combine into a current directory state? |

The notebook uses explicitly synthetic users and the real pinned directory
function through Haybarn/VGI. It captures a full scan, consumes its returned
cursor, applies incremental deletes/upserts in SQL, and replays the same window
to verify idempotence. Two charts distinguish returned change rows from the
reconstructed population and compare enabled/disabled user counts.

## Run from this folder

Install [uv](https://docs.astral.sh/uv/getting-started/installation/),
[Bun](https://bun.sh/) and Git, then copy or download the entire `notebooks/`
directory. The verified Bun version is 1.3.14; Python and all notebook dependencies
are managed separately by uv.

```sh
cd notebooks
uv sync --frozen
uv run --frozen python execute.py
```

No local worker checkout, root environment, Azure tenant or credentials are
required. Internet access is needed to fetch packages, the community VGI
extension and the pinned worker sources. The literal visible launcher is:

```text
bun run fixture_worker.ts Query-farm/vgi-azure-directory 9c2dcde4df370127818d7e88ecfb1143a4f093e8
```

`pinned_checkout.ts` fetches and verifies that exact public Git revision and
installs its frozen Bun lock. It caches sources and dependencies under
`~/.cache/vgi-notebook-workers` (or `XDG_CACHE_HOME`), with Bun-version separation
and an install lock. Setup output goes to stderr; stdout remains the Arrow
protocol channel. No repository code or dependencies are rewritten. To upgrade,
change the visible Git pin and rerun the default and experiment against the new
source before replacing saved outputs.

## What the fixture exercises

The source's tested `makeDeltaFunction(spec, clientFactory)` interface permits
client injection. `fixture_worker.ts` imports that function factory, its original
user schema/catalog and `test/fake-graph.ts` from the pinned checkout. It supplies
two invented snapshots with two-object pages. The real worker performs paging,
change conversion, marker construction and VGI transport. Only the users
function is exposed by this fixture harness.

The harness replaces authentication and Graph HTTP access with the explicit fake
client. Its Graph-shaped cursor URLs are synthetic and never fetched from the
network. Dummy secret values merely satisfy the real function's secret
requirement. The example does not exercise tenant permissions, live API behavior,
groups or devices. It uses sequential in-memory SQL statements to demonstrate checkpoint
ordering. JupySQL gives separate statements separate cursors, so this notebook
does not implement an atomic or durable production sink. Such a sink must commit
state and checkpoint together.

For an interactive editor, select `notebooks/.venv/bin/python`, or register it:

```sh
uv run --frozen python -m ipykernel install --user --name vgi-azure-directory-notebooks --display-name "Python (directory notebooks)"
```

The runner uses a temporary kernel specification and the notebook directory as
its working directory. It saves the default only after all cells succeed.

## Experiment

```sh
uv run --frozen python execute.py --parameters '{"REMOVED_USERS": 2}' --output-dir validation/two-removals
```

The default removes one synthetic user; the experiment removes two. Compare
delta row counts, current user totals and account states. Both runs should pass
the replay checks. Reset `REMOVED_USERS = 1` for the default. Overrides require a
separate destination; copies include the assets, helpers, launcher, runner and
locked environment files so the folder remains independently runnable. Generated
charts and logs are ignored; the main notebook retains its embedded outputs.

See [STANDARD.md](STANDARD.md) for the presentation conventions.
