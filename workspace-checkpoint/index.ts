import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "../../src/plugins/types.js";

const CORE_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "MEMORY.md",
  "memory.md",
  "TOOLS.md",
  "IDENTITY.md",
  "USER.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
];

function resolveDefaultWorkspaceDir(): string {
  const home = os.homedir();
  const profile = process.env.OPENCLAW_PROFILE?.trim();
  if (profile && profile.toLowerCase() !== "default") {
    return path.join(home, ".openclaw", `workspace-${profile}`);
  }
  return path.join(home, ".openclaw", "workspace");
}

function formatCheckpointName(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}${month}${day}_workspace_checkpoint`;
}

async function createCheckpoint(workspaceDir: string, logger: OpenClawPluginApi["logger"]): Promise<void> {
  const now = new Date();
  const checkpointName = formatCheckpointName(now);
  const checkpointsDir = path.join(workspaceDir, "checkpoints");
  const checkpointDir = path.join(checkpointsDir, checkpointName);

  await fs.mkdir(checkpointDir, { recursive: true });

  let copiedCount = 0;
  for (const file of CORE_FILES) {
    const srcPath = path.join(workspaceDir, file);
    try {
      const stat = await fs.stat(srcPath);
      if (stat.isFile()) {
        const destPath = path.join(checkpointDir, file);
        await fs.copyFile(srcPath, destPath);
        copiedCount++;
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  if (copiedCount > 0) {
    logger.info(`Workspace checkpoint created: ${checkpointName} (${copiedCount} files)`);
  } else {
    logger.warn(`No core files found in workspace, checkpoint skipped`);
    await fs.rmdir(checkpointDir).catch(() => {});
  }
}

export default function register(api: OpenClawPluginApi): void {
  api.on("gateway_start", async (event, ctx) => {
    const workspaceDir = api.config?.agents?.defaults?.workspace ?? resolveDefaultWorkspaceDir();

    try {
      await createCheckpoint(workspaceDir, api.logger);
    } catch (err) {
      api.logger.error(`Failed to create checkpoint: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
