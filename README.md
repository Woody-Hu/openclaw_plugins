# OpenClaw Plugins

Official open-source plugin repository for OpenClaw, providing various plugins to extend OpenClaw's functionality.

## Plugin List

| Plugin Name | Version | Description | Documentation |
|-------------|---------|-------------|---------------|
| [skill_count](./skill_count) | 1.0.0 | Track and record skill usage statistics with multiple tracking methods and CLI commands | [README](./skill_count/README.md) |
| [ralph-loop](./ralph-loop) | 1.0.0 | Self-referential AI agent loop for iterative improvement using the Ralph Wiggum technique | [README](./ralph-loop/README.md) |
| [workspace-checkpoint](./workspace-checkpoint) | 1.0.0 | Automatically creates workspace checkpoints on gateway start, backing up core files | [README](./workspace-checkpoint/README.md) |

## Installation

Plugins are located in the `extensions/` directory. OpenClaw automatically loads bundled plugins.

Configure plugins in `openclaw.json`:

```json
{
  "plugins": {
    "skill_count": {
      "outputPath": "~/.openclaw/skill-usage.json",
      "trackToolDispatch": true,
      "trackPromptInjection": true
    },
    "ralph-loop": {
      "stateDir": "~/.openclaw/ralph-loop",
      "maxIterations": 0,
      "autoContinue": true,
      "continueDelayMs": 1000
    },
    "workspace-checkpoint": {}
  }
}
```

## Contributing

Contributions are welcome! Feel free to submit Pull Requests for new plugins or improvements.

## License

[MIT](./LICENSE)
