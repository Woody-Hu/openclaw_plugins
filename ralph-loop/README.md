# Ralph Wiggum Loop Plugin

A self-referential AI agent loop plugin for OpenClaw, implementing Geoffrey Huntley's **Ralph Wiggum technique**.

## Concept

> **"Ralph is a Bash loop"** - A simple `while true` loop that continuously feeds the same prompt to an AI agent, allowing it to see its own work and iteratively improve.

Named after the Simpsons character, this technique embodies the philosophy of persistent iteration despite setbacks.

### Core Principles

- **Self-referential feedback loop**: Keep the prompt unchanged, let the AI see its own work
- **State persistence**: AI's work is saved in the file system, forming trackable history
- **Progressive improvement**: Through multiple iterations, the AI gradually refines solutions
- **Controlled termination**: Terminate via completion promise or max iterations

## Features

- **Automatic Loop Continuation**: Uses `agent_end` hook to detect completion and trigger next iteration
- **Completion Promise Detection**: Detects `<promise>text</promise>` tags to know when task is done
- **Iteration Tracking**: Records history of each iteration with timing and status
- **Session-Scoped State**: Each session has its own independent loop state
- **CLI Tools**: Command-line interface for monitoring and managing loops
- **Agent Tools**: Tools for agents to start, check, and stop loops

## Installation

The plugin is located in `extensions/ralph-loop/`. OpenClaw automatically loads bundled plugins.

## Configuration

Add to `openclaw.json`:

```json
{
  "plugins": {
    "ralph-loop": {
      "stateDir": "~/.openclaw/ralph-loop",
      "maxIterations": 0,
      "autoContinue": true,
      "continueDelayMs": 1000
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stateDir` | string | `~/.openclaw/ralph-loop` | Directory for loop state files |
| `maxIterations` | number | `0` | Default max iterations (0 = unlimited) |
| `autoContinue` | boolean | `true` | Auto-trigger next iteration after agent ends |
| `continueDelayMs` | number | `1000` | Delay before auto-continuing |

## How It Works

### Flow Diagram

```
User starts loop with task
        ↓
Agent receives task + iteration context
        ↓
Agent works on task
        ↓
Agent finishes (agent_end hook)
        ↓
Check completion conditions:
  - Promise tag detected? → Stop loop ✓
  - Max iterations reached? → Stop loop ✓
  - Neither? → Continue loop
        ↓
Increment iteration counter
        ↓
Enqueue continuation prompt via system events
        ↓
Agent receives same task again (with history visible)
        ↓
[Loop continues...]
```

### Hook Mechanism

1. **`agent_end` hook**: Detects when agent finishes, checks completion conditions, enqueues continuation
2. **`before_agent_start` hook**: Injects iteration context into the prompt

## Agent Tools

### ralph_start

Start a new Ralph loop:

```
Use the ralph_start tool with:
- prompt: "Refactor the authentication module"
- maxIterations: 10 (optional, 0 = unlimited)
- completionPromise: "DONE" (optional)
```

### ralph_status

Check current loop status:

```
Use the ralph_status tool to see:
- Current iteration
- Active/inactive state
- Task prompt
- Elapsed time
```

### ralph_stop

Stop the current loop:

```
Use the ralph_stop tool to terminate the loop early
```

### ralph_complete

Mark loop as complete:

```
Use the ralph_complete tool with:
- summary: "Authentication module refactored successfully"
```

## CLI Commands

### View Status

```bash
# View all active loops
openclaw ralph status

# View specific session
openclaw ralph status session:telegram:12345
```

### Stop Loop

```bash
openclaw ralph stop session:telegram:12345
```

### Clear State

```bash
# Clear specific session
openclaw ralph clear session:telegram:12345

# Clear all states (requires --force)
openclaw ralph clear-all --force
```

## Usage Examples

### Basic Loop

```
User: Start a Ralph loop to refactor the cache layer

Agent: [Uses ralph_start tool]
🔄 Ralph loop started!
**Task:** Refactor the cache layer
**Max Iterations:** unlimited

[Agent works on refactoring...]

[Agent finishes → Loop continues automatically]

[Iteration 2: Agent sees previous work and improves...]

[Loop continues until task is truly complete]
```

### With Completion Promise

```
User: Start a Ralph loop to build the todo API. 
      Output <promise>API_COMPLETE</promise> when done.

Agent: [Uses ralph_start with completionPromise: "API_COMPLETE"]

[Agent iterates on the API...]

[Eventually outputs: <promise>API_COMPLETE</promise>]

✅ Ralph loop completed after 5 iteration(s). 
   Promise "API_COMPLETE" detected.
```

### With Max Iterations

```
User: Start a Ralph loop to fix the auth bug, max 15 iterations

Agent: [Uses ralph_start with maxIterations: 15]

[Agent iterates...]

⏹️ Ralph loop stopped after 15 iteration(s). 
   Max iterations reached.
```

## State File Format

State files are stored in JSON format:

```json
{
  "version": "1.0.0",
  "active": true,
  "iteration": 3,
  "maxIterations": 10,
  "completionPromise": "DONE",
  "prompt": "Refactor the authentication module",
  "sessionKey": "session:telegram:12345",
  "startedAt": 1234567890000,
  "lastIterationAt": 1234567895000,
  "history": [
    {
      "iteration": 1,
      "timestamp": 1234567891000,
      "success": true,
      "durationMs": 5000
    },
    {
      "iteration": 2,
      "timestamp": 1234567893000,
      "success": true,
      "durationMs": 4500
    }
  ]
}
```

## Use Cases

### Code Development & Refactoring

- **Code refactoring**: Iteratively improve code structure
- **Test writing**: Gradually add and refine test cases
- **Code review**: Multiple passes to catch issues

### Content Creation

- **Creative writing**: Improve content quality through iteration
- **Documentation**: Progressively enhance structure and content
- **Design proposals**: Refine designs through multiple iterations

### Problem Solving

- **Bug fixing**: Try different approaches until resolved
- **Performance optimization**: Iteratively test and improve
- **Algorithm design**: Refine algorithms through multiple attempts

## Technical Implementation

### Key Components

```typescript
// State management
type LoopState = {
  active: boolean;
  iteration: number;
  maxIterations: number;
  completionPromise: string | null;
  prompt: string;
  sessionKey: string;
  history: Array<{...}>;
};

// Hook handlers
api.on("agent_end", async (event, ctx) => {
  // Check completion conditions
  // Update iteration counter
  // Enqueue continuation prompt
});

api.on("before_agent_start", async (event, ctx) => {
  // Inject iteration context
});
```

### Completion Detection

The plugin detects completion in two ways:

1. **Promise tag**: Agent outputs `<promise>text</promise>`
2. **Max iterations**: Counter reaches configured limit

## Notes

- Each session has its own independent loop state
- State persists across restarts
- Auto-continue uses system events to trigger next iteration
- History is limited to prevent excessive memory usage

## License

MIT
