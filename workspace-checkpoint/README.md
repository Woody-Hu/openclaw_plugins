# Workspace Checkpoint Plugin

Automatically creates workspace checkpoints on OpenClaw gateway start, backing up core files like `AGENTS.md`, `SOUL.md`, `MEMORY.md`, etc.

## Features

- **Automatic Checkpoints**: Creates checkpoints automatically when the gateway starts
- **Core File Backup**: Backs up essential workspace files
- **Date-Based Naming**: Uses date format for checkpoint directories (`YYMMDD_workspace_checkpoint`)
- **Error Handling**: Gracefully handles missing files and errors

## Backed Up Files

The plugin backs up these core files:

- `AGENTS.md`
- `SOUL.md`
- `MEMORY.md`
- `memory.md`
- `TOOLS.md`
- `IDENTITY.md`
- `USER.md`
- `HEARTBEAT.md`
- `BOOTSTRAP.md`

## Installation

The plugin is located in `extensions/workspace-checkpoint/`. OpenClaw automatically loads bundled plugins.

## Configuration

Add to `openclaw.json`:

```json
{
  "plugins": {
    "workspace-checkpoint": {}
  }
}
```

## How It Works

1. **Gateway Start**: The plugin listens for the `gateway_start` event
2. **Workspace Detection**: Uses the configured workspace directory or defaults to `~/.openclaw/workspace`
3. **Checkpoint Creation**: Creates a new checkpoint directory in `workspace/checkpoints/` with date-based naming
4. **File Backup**: Copies core files to the checkpoint directory
5. **Logging**: Logs the number of files copied or skips if no core files are found

## Checkpoint Location

Checkpoints are stored in:
- `~/.openclaw/workspace/checkpoints/` (default profile)
- `~/.openclaw/workspace-{profile}/checkpoints/` (for named profiles)

## Example Checkpoint

```
~/.openclaw/workspace/checkpoints/
└── 260320_workspace_checkpoint/
    ├── AGENTS.md
    ├── SOUL.md
    └── MEMORY.md
```

## Technical Implementation

```typescript
// Core functionality
api.on("gateway_start", async (event, ctx) => {
  const workspaceDir = api.config?.agents?.defaults?.workspace ?? resolveDefaultWorkspaceDir();
  await createCheckpoint(workspaceDir, api.logger);
});

// Checkpoint creation
async function createCheckpoint(workspaceDir: string, logger: OpenClawPluginApi["logger"]): Promise<void> {
  const now = new Date();
  const checkpointName = formatCheckpointName(now);
  const checkpointsDir = path.join(workspaceDir, "checkpoints");
  const checkpointDir = path.join(checkpointsDir, checkpointName);
  
  await fs.mkdir(checkpointDir, { recursive: true });
  
  // Copy core files...
}
```

## License

MIT
