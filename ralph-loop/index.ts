/**
 * Ralph Wiggum Loop Plugin for OpenClaw
 *
 * Implements a self-referential AI agent loop based on Geoffrey Huntley's Ralph Wiggum technique.
 * The core idea: "Ralph is a Bash loop" - keep feeding the same prompt to the AI agent,
 * letting it see its own work and iteratively improve.
 *
 * Key mechanism:
 * - Uses agent_end hook to detect when agent finishes
 * - Uses enqueueSystemEvent to inject continuation prompt
 * - Tracks iteration count and completion state
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STATE_DIR_NAME = "ralph-loop";
const STATE_FILE_NAME = "loop-state.json";

type LoopState = {
  version: string;
  active: boolean;
  iteration: number;
  maxIterations: number;
  completionPromise: string | null;
  prompt: string;
  sessionKey: string;
  startedAt: number;
  lastIterationAt: number;
  history: Array<{
    iteration: number;
    timestamp: number;
    success: boolean;
    error?: string;
    durationMs?: number;
  }>;
};

type LoopConfig = {
  stateDir?: string;
  maxIterations?: number;
  autoContinue?: boolean;
  continueDelayMs?: number;
};

function resolveStateDir(config: LoopConfig): string {
  if (config.stateDir) {
    return config.stateDir.startsWith("~")
      ? path.join(os.homedir(), config.stateDir.slice(1))
      : config.stateDir;
  }
  return path.join(os.homedir(), ".openclaw", STATE_DIR_NAME);
}

function getStateFilePath(sessionKey: string, config: LoopConfig): string {
  const stateDir = resolveStateDir(config);
  const safeKey = sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(stateDir, `${safeKey}.json`);
}

function ensureStateDir(config: LoopConfig): void {
  const stateDir = resolveStateDir(config);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
}

function loadState(sessionKey: string, config: LoopConfig): LoopState | null {
  const filePath = getStateFilePath(sessionKey, config);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as LoopState;
  } catch {
    return null;
  }
}

function saveState(state: LoopState, config: LoopConfig): void {
  ensureStateDir(config);
  const filePath = getStateFilePath(state.sessionKey, config);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

function deleteState(sessionKey: string, config: LoopConfig): void {
  const filePath = getStateFilePath(sessionKey, config);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function extractPromiseTag(text: string, promiseValue: string): boolean {
  if (!promiseValue || !text) return false;
  const pattern = new RegExp(
    `<promise>\\s*${escapeRegex(promiseValue)}\\s*</promise>`,
    "i"
  );
  return pattern.test(text);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTextFromMessages(messages: unknown[]): string {
  let text = "";
  for (const msg of messages) {
    if (typeof msg === "object" && msg !== null) {
      const m = msg as Record<string, unknown>;
      if (typeof m.content === "string") {
        text += m.content + "\n";
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (typeof part === "object" && part !== null) {
            const p = part as Record<string, unknown>;
            if (p.type === "text" && typeof p.text === "string") {
              text += p.text + "\n";
            }
          }
        }
      }
    }
  }
  return text;
}

const ralphLoopPlugin = {
  id: "ralph-loop",
  name: "Ralph Wiggum Loop",
  description:
    "Self-referential AI agent loop for iterative improvement - keeps the same prompt and lets the agent see its own work",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const cfg: LoopConfig = (api.pluginConfig as LoopConfig) ?? {};
    const maxIterationsDefault = cfg.maxIterations ?? 0;
    const autoContinue = cfg.autoContinue ?? true;
    const continueDelayMs = cfg.continueDelayMs ?? 1000;

    api.logger.info("ralph-loop: plugin registered");

    api.registerService({
      id: "ralph-loop",
      start: () => {
        api.logger.info("ralph-loop: service started");
      },
      stop: () => {
        api.logger.info("ralph-loop: service stopped");
      },
    });

    api.on("agent_end", async (event, ctx) => {
      const { messages, success, error, durationMs } = event;
      const sessionKey = ctx.sessionKey;

      if (!sessionKey) {
        return;
      }

      const state = loadState(sessionKey, cfg);
      if (!state || !state.active) {
        return;
      }

      api.logger.info?.(
        `ralph-loop: agent_end detected (iteration ${state.iteration}, success: ${success})`
      );

      state.history.push({
        iteration: state.iteration,
        timestamp: Date.now(),
        success,
        error,
        durationMs,
      });
      state.lastIterationAt = Date.now();

      if (state.completionPromise) {
        const outputText = extractTextFromMessages(messages as unknown[]);
        if (extractPromiseTag(outputText, state.completionPromise)) {
          api.logger.info?.(
            `ralph-loop: completion promise detected: "${state.completionPromise}"`
          );
          state.active = false;
          saveState(state, cfg);

          api.runtime.system.enqueueSystemEvent(
            `✅ Ralph loop completed after ${state.iteration} iteration(s). Promise "${state.completionPromise}" detected.`,
            { sessionKey }
          );
          return;
        }
      }

      if (state.maxIterations > 0 && state.iteration >= state.maxIterations) {
        api.logger.info?.(
          `ralph-loop: max iterations reached (${state.maxIterations})`
        );
        state.active = false;
        saveState(state, cfg);

        api.runtime.system.enqueueSystemEvent(
          `⏹️ Ralph loop stopped after ${state.iteration} iteration(s). Max iterations reached.`,
          { sessionKey }
        );
        return;
      }

      state.iteration += 1;
      saveState(state, cfg);

      if (autoContinue) {
        const continuePrompt = `\n\n---\n🔄 **Ralph Loop Iteration ${state.iteration}**\n\nContinue working on the same task. Review your previous work and improve upon it.\n\n**Original Task:**\n${state.prompt}\n\n---\n`;

        api.runtime.system.enqueueSystemEvent(continuePrompt, { sessionKey });

        api.logger.info?.(
          `ralph-loop: enqueued continuation for iteration ${state.iteration}`
        );
      } else {
        api.logger.info?.(
          `ralph-loop: iteration ${state.iteration} ready (auto-continue disabled)`
        );
      }
    });

    api.on("before_agent_start", async (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) {
        return;
      }

      const state = loadState(sessionKey, cfg);
      if (!state || !state.active) {
        return;
      }

      const iterationInfo = `[Ralph Loop - Iteration ${state.iteration}/${state.maxIterations > 0 ? state.maxIterations : "∞"}]`;
      const taskReminder = `Continue working on: ${state.prompt}`;

      if (state.completionPromise) {
        return {
          prependContext: `${iterationInfo}\n${taskReminder}\n\nTo complete the loop, output: <promise>${state.completionPromise}</promise>`,
        };
      }

      return {
        prependContext: `${iterationInfo}\n${taskReminder}`,
      };
    });

    api.registerTool(
      {
        name: "ralph_start",
        label: "Start Ralph Loop",
        description:
          "Start a Ralph Wiggum loop with a task prompt. The agent will iterate on the task until completion.",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The task prompt for the loop",
            },
            maxIterations: {
              type: "number",
              description: "Maximum iterations (0 = unlimited)",
            },
            completionPromise: {
              type: "string",
              description: "Text to output in <promise> tags to complete the loop",
            },
          },
          required: ["prompt"],
        },
        async execute(_toolCallId, params) {
          const {
            prompt,
            maxIterations = maxIterationsDefault,
            completionPromise = null,
          } = params as {
            prompt: string;
            maxIterations?: number;
            completionPromise?: string | null;
          };

          const sessionKey = api.config.sessionKey;
          if (!sessionKey) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: No session key available. Ralph loop requires an active session.",
                },
              ],
            };
          }

          const state: LoopState = {
            version: "1.0.0",
            active: true,
            iteration: 1,
            maxIterations,
            completionPromise,
            prompt,
            sessionKey,
            startedAt: Date.now(),
            lastIterationAt: Date.now(),
            history: [],
          };

          saveState(state, cfg);

          let statusMsg = `🔄 Ralph loop started!\n**Task:** ${prompt}\n**Max Iterations:** ${maxIterations > 0 ? maxIterations : "unlimited"}`;
          if (completionPromise) {
            statusMsg += `\n**Completion Promise:** Output \`<promise>${completionPromise}</promise>\` to complete.`;
          }

          return {
            content: [{ type: "text", text: statusMsg }],
            details: { state },
          };
        },
      },
      { name: "ralph_start" }
    );

    api.registerTool(
      {
        name: "ralph_status",
        label: "Ralph Loop Status",
        description:
          "Check the status of the current Ralph Wiggum loop.",
        parameters: {
          type: "object",
          properties: {},
        },
        async execute(_toolCallId, _params) {
          const sessionKey = api.config.sessionKey;
          if (!sessionKey) {
            return {
              content: [
                { type: "text", text: "No active session." },
              ],
            };
          }

          const state = loadState(sessionKey, cfg);
          if (!state) {
            return {
              content: [
                { type: "text", text: "No Ralph loop active for this session." },
              ],
            };
          }

          const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
          const status = state.active ? "🟢 Active" : "🔴 Inactive";

          return {
            content: [
              {
                type: "text",
                text: `${status}\n**Iteration:** ${state.iteration}/${state.maxIterations > 0 ? state.maxIterations : "∞"}\n**Task:** ${state.prompt}\n**Elapsed:** ${elapsed}s\n**History:** ${state.history.length} completed iterations`,
              },
            ],
            details: { state },
          };
        },
      },
      { name: "ralph_status" }
    );

    api.registerTool(
      {
        name: "ralph_stop",
        label: "Stop Ralph Loop",
        description: "Stop the current Ralph Wiggum loop.",
        parameters: {
          type: "object",
          properties: {},
        },
        async execute(_toolCallId, _params) {
          const sessionKey = api.config.sessionKey;
          if (!sessionKey) {
            return {
              content: [
                { type: "text", text: "No active session." },
              ],
            };
          }

          const state = loadState(sessionKey, cfg);
          if (!state) {
            return {
              content: [
                { type: "text", text: "No Ralph loop active for this session." },
              ],
            };
          }

          state.active = false;
          saveState(state, cfg);

          return {
            content: [
              {
                type: "text",
                text: `⏹️ Ralph loop stopped after ${state.iteration} iteration(s).`,
              },
            ],
          };
        },
      },
      { name: "ralph_stop" }
    );

    api.registerTool(
      {
        name: "ralph_complete",
        label: "Complete Ralph Loop",
        description:
          "Mark the Ralph loop as complete. Use this when the task is fully done.",
        parameters: {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "Brief summary of what was accomplished",
            },
          },
        },
        async execute(_toolCallId, params) {
          const sessionKey = api.config.sessionKey;
          if (!sessionKey) {
            return {
              content: [
                { type: "text", text: "No active session." },
              ],
            };
          }

          const state = loadState(sessionKey, cfg);
          if (!state) {
            return {
              content: [
                { type: "text", text: "No Ralph loop active for this session." },
              ],
            };
          }

          const { summary = "Task completed" } = params as { summary?: string };

          state.active = false;
          saveState(state, cfg);

          return {
            content: [
              {
                type: "text",
                text: `✅ Ralph loop completed after ${state.iteration} iteration(s).\n**Summary:** ${summary}`,
              },
            ],
          };
        },
      },
      { name: "ralph_complete" }
    );

    api.registerCli(({ program }) => {
      const ralph = program
        .command("ralph")
        .description("Ralph Wiggum loop commands");

      ralph
        .command("status [sessionKey]")
        .description("Show loop status for a session")
        .action((sessionKey?: string) => {
          if (!sessionKey) {
            const stateDir = resolveStateDir(cfg);
            if (!fs.existsSync(stateDir)) {
              console.log("No Ralph loop states found.");
              return;
            }
            const files = fs.readdirSync(stateDir).filter((f) => f.endsWith(".json"));
            if (files.length === 0) {
              console.log("No Ralph loop states found.");
              return;
            }
            console.log(`\nRalph Loop States (${files.length}):\n`);
            for (const file of files) {
              try {
                const raw = fs.readFileSync(path.join(stateDir, file), "utf-8");
                const state = JSON.parse(raw) as LoopState;
                const status = state.active ? "🟢" : "🔴";
                console.log(
                  `  ${status} ${state.sessionKey}: iter ${state.iteration}/${state.maxIterations > 0 ? state.maxIterations : "∞"} - "${state.prompt.slice(0, 50)}..."`
                );
              } catch {
                console.log(`  ⚠️ ${file}: unable to read`);
              }
            }
            return;
          }

          const state = loadState(sessionKey, cfg);
          if (!state) {
            console.log(`No Ralph loop found for session: ${sessionKey}`);
            return;
          }

          const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
          console.log(`\nRalph Loop Status`);
          console.log(`=================`);
          console.log(`Session: ${state.sessionKey}`);
          console.log(`Active: ${state.active ? "Yes" : "No"}`);
          console.log(`Iteration: ${state.iteration}/${state.maxIterations > 0 ? state.maxIterations : "unlimited"}`);
          console.log(`Prompt: ${state.prompt}`);
          if (state.completionPromise) {
            console.log(`Completion Promise: ${state.completionPromise}`);
          }
          console.log(`Started: ${new Date(state.startedAt).toISOString()}`);
          console.log(`Elapsed: ${elapsed}s`);
          console.log(`History: ${state.history.length} iterations`);
        });

      ralph
        .command("stop <sessionKey>")
        .description("Stop a Ralph loop")
        .action((sessionKey: string) => {
          const state = loadState(sessionKey, cfg);
          if (!state) {
            console.log(`No Ralph loop found for session: ${sessionKey}`);
            return;
          }
          state.active = false;
          saveState(state, cfg);
          console.log(`✓ Ralph loop stopped for session: ${sessionKey}`);
        });

      ralph
        .command("clear <sessionKey>")
        .description("Clear Ralph loop state")
        .action((sessionKey: string) => {
          deleteState(sessionKey, cfg);
          console.log(`✓ Ralph loop state cleared for session: ${sessionKey}`);
        });

      ralph
        .command("clear-all")
        .description("Clear all Ralph loop states")
        .option("--force", "Skip confirmation")
        .action((opts: { force?: boolean }) => {
          if (!opts.force) {
            console.log("This will delete all Ralph loop states. Use --force to confirm.");
            return;
          }
          const stateDir = resolveStateDir(cfg);
          if (fs.existsSync(stateDir)) {
            const files = fs.readdirSync(stateDir).filter((f) => f.endsWith(".json"));
            for (const file of files) {
              fs.unlinkSync(path.join(stateDir, file));
            }
            console.log(`✓ Cleared ${files.length} Ralph loop state(s)`);
          } else {
            console.log("No Ralph loop states to clear.");
          }
        });
    }, { commands: ["ralph"] });
  },
};

export default ralphLoopPlugin;
