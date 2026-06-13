import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

const CONFIG_PATH = process.env.DATA_DIR
  ? `${process.env.DATA_DIR}/config.json`
  : '/data/config.json';
const BASE_URL = 'https://api.spacetraders.io/v2';

let cachedConfig = null;

export async function getConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    cachedConfig = JSON.parse(raw);
  } catch {
    if (process.env.SPACETRADERS_TOKEN) {
      cachedConfig = { token: process.env.SPACETRADERS_TOKEN };
    }
  }
  return cachedConfig;
}

export async function saveConfig(data) {
  cachedConfig = data;
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// Simple 1 req/sec rate limiter
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100;

async function request(path, options = {}) {
  const now = Date.now();
  const wait = Math.max(0, lastRequestTime + MIN_INTERVAL_MS - now);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();

  const config = await getConfig();
  const headers = { 'Content-Type': 'application/json' };
  if (config?.token && path !== '/register') {
    headers['Authorization'] = `Bearer ${config.token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    return request(path, options);
  }

  const json = await res.json();

  if (!res.ok) {
    const msg = json?.error?.message ?? `SpaceTraders API error ${res.status}`;
    const err = new Error(msg);
    err.code = json?.error?.code;
    err.data = json?.error?.data;
    throw err;
  }

  return json.data ?? json;
}

const get = (path) => request(path, { method: 'GET' });
const post = (path, body = {}) => request(path, {
  method: 'POST',
  body: JSON.stringify(body),
});

// ── API functions ───────────────────────────────────────────────────────────

export async function registerAgent({ symbol, faction = 'COSMIC', email }) {
  const body = { symbol, faction };
  if (email) body.email = email;
  const result = await post('/register', body);
  await saveConfig({
    token: result.token,
    agentSymbol: result.agent.symbol,
    faction: result.agent.startingFaction,
    email: email ?? null,
    registeredAt: new Date().toISOString(),
  });
  return result;
}

export const getAgent = () => get('/my/agent');

export const listShips = () => get('/my/ships');
export const getShip = (shipSymbol) => get(`/my/ships/${shipSymbol}`);

export const listContracts = () => get('/my/contracts');
export const acceptContract = (contractId) => post(`/my/contracts/${contractId}/accept`);

export const navigateShip = (shipSymbol, waypointSymbol) =>
  post(`/my/ships/${shipSymbol}/navigate`, { waypointSymbol });

export const orbitShip = (shipSymbol) => post(`/my/ships/${shipSymbol}/orbit`);
export const dockShip = (shipSymbol) => post(`/my/ships/${shipSymbol}/dock`);

export const extractResources = (shipSymbol, survey) =>
  post(`/my/ships/${shipSymbol}/extract`, survey ? { survey } : {});

export const sellCargo = (shipSymbol, symbol, units) =>
  post(`/my/ships/${shipSymbol}/sell`, { symbol, units });

export const getWaypoints = (systemSymbol) =>
  get(`/systems/${systemSymbol}/waypoints`);

export const getShipCargo = (shipSymbol) => get(`/my/ships/${shipSymbol}/cargo`);
export const getShipNav = (shipSymbol) => get(`/my/ships/${shipSymbol}/nav`);
export const refuelShip = (shipSymbol) => post(`/my/ships/${shipSymbol}/refuel`);
