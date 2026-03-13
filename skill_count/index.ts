/**
 * OpenClaw Skill Counter Plugin
 *
 * Tracks and records skill usage statistics via lifecycle hooks.
 * Outputs structured JSON data with skill names, invocation counts, and timestamps.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SKILL_USAGE_FILE = "skill-usage.json";

type SkillUsageRecord = {
  skillName: string;
  invocationType: "tool_dispatch" | "prompt_injection" | "command";
  timestamp: number;
  agentId?: string;
  sessionKey?: string;
  workspaceDir?: string;
  messageProvider?: string;
  params?: Record<string, unknown>;
};

type SkillUsageStats = {
  version: string;
  createdAt: number;
  updatedAt: number;
  totalInvocations: number;
  skills: Record<
    string,
    {
      name: string;
      count: number;
      firstInvokedAt: number;
      lastInvokedAt: number;
      invocationTypes: {
        tool_dispatch: number;
        prompt_injection: number;
        command: number;
      };
      recentInvocations: SkillUsageRecord[];
    }
  >;
};

const MAX_RECENT_INVOCATIONS = 100;

function resolveOutputPath(outputPath: string | undefined): string {
  if (outputPath) {
    if (outputPath.startsWith("~")) {
      return path.join(os.homedir(), outputPath.slice(1));
    }
    return outputPath;
  }
  return path.join(os.homedir(), ".openclaw", SKILL_USAGE_FILE);
}

function ensureParentDir(filePath: string): void {
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
}

function loadStats(filePath: string): SkillUsageStats {
  if (!fs.existsSync(filePath)) {
    return {
      version: "1.0.0",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalInvocations: 0,
      skills: {},
    };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SkillUsageStats;
  } catch {
    return {
      version: "1.0.0",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalInvocations: 0,
      skills: {},
    };
  }
}

function saveStats(filePath: string, stats: SkillUsageStats): void {
  ensureParentDir(filePath);
  stats.updatedAt = Date.now();
  fs.writeFileSync(filePath, JSON.stringify(stats, null, 2), "utf-8");
}

function recordInvocation(
  stats: SkillUsageStats,
  record: SkillUsageRecord,
): void {
  const { skillName, invocationType, timestamp } = record;

  if (!stats.skills[skillName]) {
    stats.skills[skillName] = {
      name: skillName,
      count: 0,
      firstInvokedAt: timestamp,
      lastInvokedAt: timestamp,
      invocationTypes: {
        tool_dispatch: 0,
        prompt_injection: 0,
        command: 0,
      },
      recentInvocations: [],
    };
  }

  const skillStats = stats.skills[skillName];
  skillStats.count += 1;
  skillStats.lastInvokedAt = timestamp;
  skillStats.invocationTypes[invocationType] += 1;

  skillStats.recentInvocations.push(record);
  if (skillStats.recentInvocations.length > MAX_RECENT_INVOCATIONS) {
    skillStats.recentInvocations = skillStats.recentInvocations.slice(
      -MAX_RECENT_INVOCATIONS,
    );
  }

  stats.totalInvocations += 1;
}

const skillCounterPlugin = {
  id: "skill_count",
  name: "Skill Counter",
  description: "Track and record skill usage statistics via lifecycle hooks",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const cfg = api.pluginConfig ?? {};
    const outputPath = resolveOutputPath(
      typeof cfg.outputPath === "string" ? cfg.outputPath : undefined,
    );
    const trackToolDispatch = cfg.trackToolDispatch !== false;
    const trackPromptInjection = cfg.trackPromptInjection !== false;

    api.logger.info(`skill_count: plugin registered (output: ${outputPath})`);

    api.registerService({
      id: "skill_count",
      start: () => {
        api.logger.info("skill_count: service started");
      },
      stop: () => {
        api.logger.info("skill_count: service stopped");
      },
    });

    if (trackToolDispatch) {
      api.on("after_tool_call", async (event, ctx) => {
        const { toolName, params, result, error } = event;

        const isSkillTool =
          toolName === "skill" ||
          toolName === "run_skill" ||
          toolName.startsWith("skill_") ||
          (params &&
            typeof params === "object" &&
            "skillName" in params &&
            typeof (params as Record<string, unknown>).skillName === "string");

        if (!isSkillTool) {
          return;
        }

        const skillName =
          toolName === "skill" || toolName === "run_skill"
            ? String((params as Record<string, unknown>)?.name ?? toolName)
            : toolName.startsWith("skill_")
              ? toolName.slice(6)
              : String((params as Record<string, unknown>).skillName);

        if (!skillName) {
          return;
        }

        const stats = loadStats(outputPath);
        recordInvocation(stats, {
          skillName,
          invocationType: "tool_dispatch",
          timestamp: Date.now(),
          agentId: ctx.agentId,
          sessionKey: ctx.sessionKey,
          params: params as Record<string, unknown>,
        });
        saveStats(outputPath, stats);

        api.logger.info?.(
          `skill_count: recorded tool_dispatch for "${skillName}" (total: ${stats.skills[skillName]?.count})`,
        );
      });
    }

    if (trackPromptInjection) {
      api.on("before_agent_start", async (event, ctx) => {
        const { prompt, messages } = event;

        if (!prompt && !messages) {
          return;
        }

        const skillPattern =
          /use the ["']([^"']+)["'] skill|skill[:\s]+([a-zA-Z0-9_-]+)|\/skill\s+([a-zA-Z0-9_-]+)/gi;

        const textToSearch = prompt || "";
        const matches = textToSearch.matchAll(skillPattern);

        const detectedSkills = new Set<string>();

        for (const match of matches) {
          const skillName = match[1] || match[2] || match[3];
          if (skillName && skillName.trim()) {
            detectedSkills.add(skillName.trim().toLowerCase());
          }
        }

        if (detectedSkills.size === 0) {
          return;
        }

        const stats = loadStats(outputPath);
        for (const skillName of detectedSkills) {
          recordInvocation(stats, {
            skillName,
            invocationType: "prompt_injection",
            timestamp: Date.now(),
            agentId: ctx.agentId,
            sessionKey: ctx.sessionKey,
            messageProvider: ctx.messageProvider,
          });
        }
        saveStats(outputPath, stats);

        api.logger.info?.(
          `skill_count: recorded prompt_injection for ${detectedSkills.size} skill(s)`,
        );
      });
    }

    api.registerCli(({ program }) => {
      const skillCount = program
        .command("skill-count")
        .description("Skill usage statistics commands");

      skillCount
        .command("stats")
        .description("Show skill usage statistics")
        .option("--json", "Output as JSON")
        .action((opts) => {
          const stats = loadStats(outputPath);

          if (opts.json) {
            console.log(JSON.stringify(stats, null, 2));
            return;
          }

          console.log(`\nSkill Usage Statistics`);
          console.log(`======================`);
          console.log(`Total Invocations: ${stats.totalInvocations}`);
          console.log(`Unique Skills: ${Object.keys(stats.skills).length}`);
          console.log(`\nTop Skills by Usage:`);

          const sortedSkills = Object.values(stats.skills).sort(
            (a, b) => b.count - a.count,
          );

          for (const skill of sortedSkills.slice(0, 10)) {
            const types = skill.invocationTypes;
            const typeStr = `tool:${types.tool_dispatch} prompt:${types.prompt_injection} cmd:${types.command}`;
            console.log(
              `  ${skill.name}: ${skill.count} invocations (${typeStr})`,
            );
          }

          if (sortedSkills.length > 10) {
            console.log(`  ... and ${sortedSkills.length - 10} more skills`);
          }
        });

      skillCount
        .command("list")
        .description("List all recorded skills")
        .action(() => {
          const stats = loadStats(outputPath);
          const skills = Object.values(stats.skills).sort(
            (a, b) => b.count - a.count,
          );

          console.log(`\nRecorded Skills (${skills.length}):`);
          for (const skill of skills) {
            console.log(
              `  ${skill.name}: ${skill.count} invocations (last: ${new Date(skill.lastInvokedAt).toISOString()})`,
            );
          }
        });

      skillCount
        .command("export")
        .description("Export statistics to a file")
        .argument("<file>", "Output file path")
        .action((file: string) => {
          const stats = loadStats(outputPath);
          const exportPath = file.startsWith("~")
            ? path.join(os.homedir(), file.slice(1))
            : file;

          fs.writeFileSync(exportPath, JSON.stringify(stats, null, 2), "utf-8");
          console.log(`Exported to ${exportPath}`);
        });

      skillCount
        .command("reset")
        .description("Reset all statistics")
        .option("--force", "Skip confirmation")
        .action((opts) => {
          if (!opts.force) {
            console.log(
              "This will delete all skill usage statistics. Use --force to confirm.",
            );
            return;
          }

          const emptyStats: SkillUsageStats = {
            version: "1.0.0",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            totalInvocations: 0,
            skills: {},
          };

          saveStats(outputPath, emptyStats);
          console.log("Skill usage statistics have been reset.");
        });
    }, { commands: ["skill-count"] });

    api.registerTool(
      {
        name: "skill_usage_stats",
        label: "Skill Usage Statistics",
        description:
          "Get statistics about skill usage. Shows which skills have been invoked and how many times.",
        parameters: {
          type: "object",
          properties: {
            skillName: {
              type: "string",
              description: "Optional skill name to get detailed stats for",
            },
          },
        },
        async execute(_toolCallId, params) {
          const { skillName } = params as { skillName?: string };
          const stats = loadStats(outputPath);

          if (skillName) {
            const skillStats = stats.skills[skillName.toLowerCase()];
            if (!skillStats) {
              return {
                content: [
                  {
                    type: "text",
                    text: `No usage data found for skill: ${skillName}`,
                  },
                ],
              };
            }
            return {
              content: [
                {
                  type: "text",
                  text: `Skill: ${skillStats.name}\nTotal Invocations: ${skillStats.count}\nBy Type: ${JSON.stringify(skillStats.invocationTypes)}\nFirst Used: ${new Date(skillStats.firstInvokedAt).toISOString()}\nLast Used: ${new Date(skillStats.lastInvokedAt).toISOString()}`,
                },
              ],
              details: skillStats,
            };
          }

          const summary = {
            totalInvocations: stats.totalInvocations,
            uniqueSkills: Object.keys(stats.skills).length,
            topSkills: Object.values(stats.skills)
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
              .map((s) => ({ name: s.name, count: s.count })),
          };

          return {
            content: [
              {
                type: "text",
                text: `Skill Usage Summary\nTotal Invocations: ${summary.totalInvocations}\nUnique Skills: ${summary.uniqueSkills}\n\nTop Skills:\n${summary.topSkills.map((s) => `  ${s.name}: ${s.count}`).join("\n")}`,
              },
            ],
            details: summary,
          };
        },
      },
      { name: "skill_usage_stats" },
    );
  },
};

export default skillCounterPlugin;
