# todo-viewer

A small, file-based todo board. Every list is a plain-text `.todo` file that you can edit in any
editor; the web UI (board, backlog table, overview) picks up changes within a few seconds and a
watcher re-formats the file after every save. Optional two-way sync with Microsoft To Do.

## File format

```
# Garden
mow the lawn, to_do
build a raised bed, in_progress, [buy wood, done], [assemble, to_do]
```

`# group` starts a group; each line is `title, status` with optional `[task, status]` subtasks.
Statuses: `backlog` (default), `to_do`, `in_progress`, `on_hold`, `done`. See `examples/demo.todo`.

## Run locally (macOS)

```sh
git clone https://github.com/jantoebes/todo-viewer.git
cd todo-viewer
./scripts/install.sh          # npm ci, build, LaunchAgent (starts at login, restarts on crash)
open http://localhost:4243
```

Put your `.todo` files in `./data`. Update with `git pull && ./scripts/install.sh`; remove with
`./scripts/uninstall.sh`. Logs: `~/Library/Logs/todo-viewer.log`.

Without the LaunchAgent: `npm ci && npm run build && npm start` (or `npm run dev`).

## Run with Docker

```yaml
services:
  todo-viewer:
    build: https://github.com/jantoebes/todo-viewer.git#main
    restart: unless-stopped
    ports: ["4243:4243"]
    environment:
      MSFT_CLIENT_ID: ""      # optional
    volumes:
      - ./data:/data
      - ./state:/state
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TODO_DATA_DIR` | `./data` | The `.todo` files |
| `TODO_STATE_DIR` | `./.state` | Sync config/state, Microsoft login cache |
| `TODO_HISTORY_DIR` | `~/todo-history` | Local git repo with an automatic commit after every change |
| `PORT` / `HOST` | `4243` / `127.0.0.1` | Web server |
| `MSFT_CLIENT_ID` | – | Enables Microsoft To Do sync |

`install.sh` accepts `--data-dir` and `--state-dir`. Variables can also go in `.env.local`.

## Microsoft To Do sync (optional)

1. Register an app in Azure (personal Microsoft accounts, public client flows enabled,
   permission `Tasks.ReadWrite`) and set `MSFT_CLIENT_ID`.
2. Copy `examples/config.yaml` to `<state dir>/config.yaml`.
3. Open the UI and log in via the banner (device-code flow, works on headless servers too).

Only one machine should sync a given data directory; set `activeSyncHost` in `config.yaml` to its
hostname if the directory is shared between machines.

## License

MIT
