import { query, InMemorySessionStore, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as api from './spacetraders-api.js';

const ok = (data) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

const spacetradersTools = [
  tool(
    'register_agent',
    'Register a new SpaceTraders agent. Only call this if the user has not registered yet.',
    {
      symbol: z.string().min(3).max(14).describe('Agent callsign (3-14 chars, letters/numbers)'),
      faction: z.string().default('COSMIC').describe('Starting faction (e.g. COSMIC, VOID, GALACTIC)'),
      email: z.string().email().optional().describe('Optional email for account recovery'),
    },
    async (args) => ok(await api.registerAgent(args))
  ),

  tool('get_agent', 'Get current agent info including credits and headquarters', {}, async () =>
    ok(await api.getAgent())
  ),

  tool('list_ships', 'List all ships owned by the agent', {}, async () =>
    ok(await api.listShips())
  ),

  tool(
    'get_ship',
    'Get detailed info about a specific ship including nav status, cargo, and fuel',
    { shipSymbol: z.string().describe('Ship symbol, e.g. AGENT-1') },
    async ({ shipSymbol }) => ok(await api.getShip(shipSymbol))
  ),

  tool('list_contracts', 'List all contracts (accepted and available)', {}, async () =>
    ok(await api.listContracts())
  ),

  tool(
    'accept_contract',
    'Accept a contract by ID',
    { contractId: z.string().describe('The contract ID to accept') },
    async ({ contractId }) => ok(await api.acceptContract(contractId))
  ),

  tool(
    'navigate_ship',
    'Navigate a ship to a waypoint. Ship must be in orbit first.',
    {
      shipSymbol: z.string().describe('Ship symbol'),
      waypointSymbol: z.string().describe('Destination waypoint symbol, e.g. X1-AB42-12345A'),
    },
    async ({ shipSymbol, waypointSymbol }) => ok(await api.navigateShip(shipSymbol, waypointSymbol))
  ),

  tool(
    'orbit_ship',
    'Put a ship into orbit around its current waypoint',
    { shipSymbol: z.string() },
    async ({ shipSymbol }) => ok(await api.orbitShip(shipSymbol))
  ),

  tool(
    'dock_ship',
    'Dock a ship at its current waypoint',
    { shipSymbol: z.string() },
    async ({ shipSymbol }) => ok(await api.dockShip(shipSymbol))
  ),

  tool(
    'extract_resources',
    'Mine resources from an asteroid. Ship must be in orbit at an asteroid waypoint and not on cooldown.',
    { shipSymbol: z.string() },
    async ({ shipSymbol }) => ok(await api.extractResources(shipSymbol))
  ),

  tool(
    'sell_cargo',
    'Sell cargo at the current docked waypoint',
    {
      shipSymbol: z.string(),
      symbol: z.string().describe('Trade good symbol, e.g. IRON_ORE'),
      units: z.number().int().positive().describe('Number of units to sell'),
    },
    async ({ shipSymbol, symbol, units }) => ok(await api.sellCargo(shipSymbol, symbol, units))
  ),

  tool(
    'get_ship_cargo',
    "Get a ship's current cargo manifest",
    { shipSymbol: z.string() },
    async ({ shipSymbol }) => ok(await api.getShipCargo(shipSymbol))
  ),

  tool(
    'get_ship_nav',
    "Get a ship's current navigation status including location and travel ETA",
    { shipSymbol: z.string() },
    async ({ shipSymbol }) => ok(await api.getShipNav(shipSymbol))
  ),

  tool(
    'refuel_ship',
    'Refuel a ship. Ship must be docked at a waypoint with a marketplace.',
    { shipSymbol: z.string() },
    async ({ shipSymbol }) => ok(await api.refuelShip(shipSymbol))
  ),

  tool(
    'get_waypoints',
    'List waypoints in a star system, including asteroid fields and markets',
    { systemSymbol: z.string().describe('System symbol, e.g. X1-AB42') },
    async ({ systemSymbol }) => ok(await api.getWaypoints(systemSymbol))
  ),
];

const spacetradersServer = createSdkMcpServer({
  name: 'spacetraders',
  version: '1.0.0',
  tools: spacetradersTools,
});

const store = new InMemorySessionStore();

const SYSTEM_PROMPT = `You are a SpaceTraders.io automation assistant. You help manage a SpaceTraders account through natural language commands.

You have two ways to act:
1. **MCP tools** (mcp__spacetraders__*): For direct API operations like checking status, navigating ships, accepting contracts, mining, and selling cargo. Use these for all simple commands and queries.
2. **Code tools** (Read, Write, Edit, Bash): For complex multi-step automation. Write Node.js scripts in /workspace/ and run them with Bash. Use the built-in fetch API (Node.js 18+) if you need HTTP calls beyond what the MCP tools provide.

Guidelines:
- Always use MCP tools for direct operations (status, single actions, queries) — don't write code for things a tool can handle.
- The MCP tools enforce 1 req/sec rate limiting automatically.
- If a ship is on cooldown, the extract tool will return an error with the remaining cooldown seconds — wait and retry.
- Ship must be orbiting to navigate or extract; must be docked to sell or refuel.
- For mining loops or multi-ship automation, write and run a Node.js script.
- Keep responses concise and focused on what the user asked.`;

export async function* runAgent(prompt, sessionId) {
  const options = {
    systemPrompt: SYSTEM_PROMPT,
    cwd: '/workspace',
    permissionMode: 'bypassPermissions',
    sessionStore: store,
    mcpServers: { spacetraders: spacetradersServer },
  };
  if (sessionId) options.resume = sessionId;

  yield* query({ prompt, options });
}
