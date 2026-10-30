import { readFile } from 'node:fs/promises';
import { validateStorage, SHARED_KEYS } from './cash-model.mjs';
import { projectStorage } from './cash-store.mjs';

export async function readSeed(root = new URL('../public/', import.meta.url)) {
  const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
  const snapshot = await read('workspace-snapshot.json');
  const storage = Object.fromEntries(Object.entries(snapshot.storage).filter(([key]) => SHARED_KEYS.includes(key)));
  validateStorage(storage);
  return { storage, assets: { 'data.json': await read('data.json'), 'debtor-status-seed.json': await read('debtor-status-seed.json') } };
}
export async function installTables(tx, seed, ownerRole = 'pfig_cash_owner', appRole = 'pfig_cash_app') {
  if (!/^[a-z_][a-z_0-9]{0,62}$/.test(ownerRole) || !/^[a-z_][a-z_0-9]{0,62}$/.test(appRole)) throw Error('INVALID_INSTALL_ROLE');
  const schema = (await readFile(new URL('./schema.sql', import.meta.url), 'utf8')).replaceAll('pfig_cash_owner', ownerRole).replaceAll('pfig_cash_app', appRole);
  await tx.unsafe(schema);
  for (const [name, payload] of Object.entries(seed.assets)) await tx`insert into pfig_cash.assets(name,payload) values(${name},${tx.json(payload)})`;
  await tx`insert into pfig_cash.workspaces(id,revision,storage) values('main',1,${tx.json(seed.storage)})`;
  return projectStorage(tx, seed.storage);
}
