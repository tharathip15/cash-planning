import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const tests = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(name => /\.test\.(cjs|mjs)$/.test(name))
  .map(name => new URL('../tests/' + name, import.meta.url).pathname)
  .map(path => process.platform === 'win32' ? decodeURIComponent(path.replace(/^\//, '')) : decodeURIComponent(path));
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
