import "server-only";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Client } from "@agentclientprotocol/sdk";
import { type AgentLaunch, initialize, modelOption, spawnAgent } from "../acp";
import { writeAtomic } from "../files";
import { DATA_DIR } from "../paths";
import { queue } from "../queue";
import { type AgentId, AGENTS, availableAgents, fallbackAgent, isAgentId, launchFor } from "./agents";
import { type AgentModels, type ModelSettings, modelRef, parseModel, sanitizeModelSettings } from "./models";

// The models Construct can run on here, and the one new chats start on: the
// last one picked in the panel, kept in BOOKX_DIR/.bookx-construct.json.

const SETTINGS = () => path.join(DATA_DIR, ".bookx-construct.json");

async function readSettings(): Promise<ModelSettings> {
  try {
    return sanitizeModelSettings(JSON.parse(await readFile(SETTINGS(), "utf8")));
  } catch {
    return {};
  }
}

/** Remember `agent`'s `model` for new chats. */
export function rememberModel(agent: AgentId, model?: string): Promise<void> {
  return queue("construct-settings")(async () => {
    const next = { ...(await readSettings()), chat: modelRef(agent, model) };
    await writeAtomic(SETTINGS(), JSON.stringify(next, null, 2));
  });
}

/** The agent and model new chats start on; an agent that can't run here falls back to the default. */
export async function modelForChats(): Promise<{ agent: AgentId; model?: string }> {
  const { agent, model } = parseModel((await readSettings()).chat);
  if (isAgentId(agent) && AGENTS[agent].available()) return { agent, model };
  return { agent: fallbackAgent() };
}

// Not a book id (those can't start with a dot), so never one of Construct's homes.
const CWD = path.join(os.tmpdir(), "bookx-construct", ".probe");

const refuse: Client["requestPermission"] = async () => ({ outcome: { outcome: "cancelled" } });

/** The models an agent offers (its model picker), from a session opened and closed right away. */
async function probeModels(launch: AgentLaunch): Promise<{ value: string; name: string }[]> {
  const agent = await spawnAgent(launch, { requestPermission: refuse, sessionUpdate: async () => {} });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const failed = new Promise<never>((_, reject) => {
    void agent.exited.then((why) => reject(new Error(`the agent ${why}${agent.stderrTail() ? `: ${agent.stderrTail()}` : ""}`)));
    timer = setTimeout(() => reject(new Error("the agent took too long to answer")), 60_000);
  });
  try {
    return await Promise.race([
      (async () => {
        await initialize(agent.conn);
        const session = await agent.conn.newSession({ cwd: launch.cwd, mcpServers: [], _meta: launch.sessionMeta });
        const picker = modelOption(session.configOptions);
        return (picker?.options.flatMap((o) => ("group" in o ? o.options : [o])) ?? []).map(({ value, name }) => ({ value, name }));
      })(),
      failed,
    ]);
  } finally {
    clearTimeout(timer);
    failed.catch(() => {}); // the exit we cause below isn't news
    agent.stop();
  }
}

const CACHE_MS = 10 * 60_000;
let cached: { at: number; list: Promise<AgentModels[]> } | null = null;

/** Every agent that can run here, with its models; asked once every 10 minutes. */
export function listModels(fresh = false): Promise<AgentModels[]> {
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.list;
  const list = Promise.all(
    availableAgents().map(async (agent): Promise<AgentModels> => {
      const { name } = AGENTS[agent];
      try {
        return { agent, name, models: await probeModels(await launchFor(agent, { cwd: CWD, systemPrompt: "You are Construct." })) };
      } catch (err) {
        return { agent, name, models: [], error: (err as Error).message };
      }
    }),
  );
  cached = { at: Date.now(), list };
  // A failed probe is asked again next time rather than remembered.
  list.then((l) => l.some((a) => a.error) && cached?.list === list && (cached = null));
  return list;
}
