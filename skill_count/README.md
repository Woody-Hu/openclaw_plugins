# Skill Counter Plugin

An OpenClaw plugin that tracks and records skill usage statistics.

## Features

- **Automatic Tracking** - Records skill invocations via lifecycle hooks
- **Multiple Tracking Methods** - Supports both tool dispatch and prompt injection
- **Structured Data** - Outputs JSON formatted statistics file
- **CLI Commands** - Provides command-line tools to view and export statistics
- **Agent Tool** - Provides `skill_usage_stats` tool for Agent queries

## Installation

The plugin is located in `extensions/skill_count/` directory. OpenClaw automatically loads bundled plugins.

## Configuration

Add configuration to `openclaw.json`:

```json
{
  "plugins": {
    "skill_count": {
      "outputPath": "~/.openclaw/skill-usage.json",
      "trackToolDispatch": true,
      "trackPromptInjection": true
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputPath` | string | `~/.openclaw/skill-usage.json` | Output file path for statistics data |
| `trackToolDispatch` | boolean | `true` | Track skill invocations via tool dispatch |
| `trackPromptInjection` | boolean | `true` | Track skill invocations via prompt injection |

## Tracking Mechanisms

### Tool Dispatch Tracking

Records invocations when Agent calls these tools:

- `skill` tool
- `run_skill` tool
- Tools starting with `skill_`
- Tools with `skillName` in parameters

### Prompt Injection Tracking

Detects skill references in prompts matching these patterns:

- `Use the "skill-name" skill`
- `skill: name`
- `/skill name`

## Data Format

Statistics are saved in JSON format:

```json
{
  "version": "1.0.0",
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000,
  "totalInvocations": 42,
  "skills": {
    "github": {
      "name": "github",
      "count": 15,
      "firstInvokedAt": 1234567890000,
      "lastInvokedAt": 1234567900000,
      "invocationTypes": {
        "tool_dispatch": 10,
        "prompt_injection": 5,
        "command": 0
      },
      "recentInvocations": [
        {
          "skillName": "github",
          "invocationType": "tool_dispatch",
          "timestamp": 1234567890000,
          "agentId": "default",
          "sessionKey": "session:xxx",
          "params": {}
        }
      ]
    }
  }
}
```

### Field Descriptions

| Field | Description |
|-------|-------------|
| `version` | Data format version |
| `createdAt` | Data creation timestamp |
| `updatedAt` | Last update timestamp |
| `totalInvocations` | Total invocation count |
| `skills` | Detailed statistics per skill |
| `skills[name].count` | Invocation count for this skill |
| `skills[name].invocationTypes` | Count by invocation type |
| `skills[name].recentInvocations` | Last 100 invocation records |

## CLI Commands

### View Statistics

```bash
# Show statistics summary
openclaw skill-count stats

# JSON format output
openclaw skill-count stats --json
```

Output example:

```
Skill Usage Statistics
======================
Total Invocations: 42
Unique Skills: 5

Top Skills by Usage:
  github: 15 invocations (tool:10 prompt:5 cmd:0)
  weather: 12 invocations (tool:8 prompt:4 cmd:0)
  slack: 8 invocations (tool:6 prompt:2 cmd:0)
```

### List All Skills

```bash
openclaw skill-count list
```

### Export Data

```bash
openclaw skill-count export ./my-stats.json
```

### Reset Statistics

```bash
# Requires confirmation
openclaw skill-count reset --force
```

## Agent Tool

The plugin registers a `skill_usage_stats` tool that Agents can query:

```
# Get overall statistics
skill_usage_stats

# Get details for a specific skill
skill_usage_stats --skillName github
```

## Usage Examples

### View Most Used Skills

```bash
openclaw skill-count stats
```

### Export for Custom Analysis

```bash
openclaw skill-count export ~/skill-analysis.json

# Analyze with jq
cat ~/skill-analysis.json | jq '.skills | to_entries | sort_by(.value.count) | reverse | .[0:5]'
```

### Query from Agent

```
User: Tell me which skills are used the most

Agent: [calls skill_usage_stats tool]
Based on statistics, the most used skills are:
1. github - 15 times
2. weather - 12 times
3. slack - 8 times
```

## Technical Implementation

### Hook Listeners

```typescript
// Listen for tool calls
api.on("after_tool_call", async (event, ctx) => {
  // Detect if it's a skill tool
  // Record invocation info
});

// Listen for prompt injection
api.on("before_agent_start", async (event, ctx) => {
  // Parse skill references in prompt
  // Record invocation info
});
```

### Data Persistence

- Uses Node.js `fs` module for synchronous JSON writes
- Saves immediately after each invocation to prevent data loss
- Automatically creates parent directories

## Notes

- Statistics file grows with usage
- Each skill keeps at most 100 recent invocation records
- Reset is irreversible, use with caution

## License

MIT
