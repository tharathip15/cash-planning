// Windows Scheduled Task entry. Restart only owned child processes; never publish source.
import { readFile, writeFile, open, unlink } from 'node:fs/promises';
import { openSync, closeSync, writeSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { validateBackend } from '../server/cash-discovery.mjs';

const settingsFile = process.argv[2];
if (!settingsFile) throw Error('CASH_OPERATIONS_SETTINGS_REQUIRED');
const settings = JSON.parse(await readFile(settingsFile,'utf8'));
const root = resolve(settings.privateDirectory), lockPath = join(root,'service.lock'), statePath = join(root,'service-state.json');
if (!root.startsWith(resolve(process.env.USERPROFILE,'.codex/private-data/CASH_PLANNING') + '\\') || settings.project !== 'cash-planning' ||
    settings.scope !== 'pfig' || !/^ecfg_[a-zA-Z0-9]+$/.test(settings.edgeConfigId)) throw Error('INVALID_CASH_OPERATIONS_SETTINGS');
let lock;
try {lock = await open(lockPath,'wx');}
catch(error) {
  if(error.code!=='EEXIST') throw error;
  const old=JSON.parse(await readFile(lockPath,'utf8'));
  try{process.kill(old.pid,0);throw Error('CASH_SUPERVISOR_ALREADY_RUNNING');}catch(e){if(e.code!=='ESRCH')throw e;}
  await unlink(lockPath);lock=await open(lockPath,'wx');
}
await lock.writeFile(JSON.stringify({pid:process.pid}));await lock.close();
const runtime=JSON.parse(await readFile(settings.runtimeFile,'utf8'));
const manifest=JSON.parse(await readFile(settings.manifestFile,'utf8'));
for(const[name,hash]of Object.entries(manifest)){
  const file=resolve(settings.release,name),path=relative(settings.release,file);
  if(path.startsWith('..')||createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw Error('CASH_RELEASE_CHANGED');
}
let backend,tunnel,currentUrl=null,publishedUrl=null,shuttingDown=false,ticking=false,tunnelStarted=0;
const log = message => console.log(JSON.stringify({at:new Date().toISOString(),message}));
async function save(extra={}) {
  await writeFile(statePath,JSON.stringify({supervisorPid:process.pid,backendPid:backend?.pid,tunnelPid:tunnel?.pid,backendUrl:currentUrl,publishedUrl,checkedAt:new Date().toISOString(),...extra},null,2),{mode:0o600});
}
async function cli(args,input) {
  return new Promise((resolve,reject)=>{
    const child=spawn(settings.node,[settings.vercelCli,...args,'--scope',settings.scope],{cwd:settings.release,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',()=>{});
    const timeout=setTimeout(()=>child.kill(),45000);
    child.once('error',error=>{clearTimeout(timeout);reject(error);});
    child.once('exit',code=>{clearTimeout(timeout);if(code===0)resolve(output);else reject(Error('CASH_CONFIGURATION_UPDATE_FAILED'));});child.stdin.end(input);
  });
}
function startBackend() {
  const stdout=openSync(join(root,'backend.stdout.log'),'a'),stderr=openSync(join(root,'backend.stderr.log'),'a');
  backend=spawn(settings.node,[join(settings.release,'server/start-central.mjs'),settings.runtimeFile],{cwd:settings.release,windowsHide:true,stdio:['ignore',stdout,stderr]});
  closeSync(stdout);closeSync(stderr);
  backend.once('error',()=>log('backend start failed'));backend.once('exit',()=>log('backend exited'));log('backend started');
}
function startTunnel() {
  currentUrl=null;tunnelStarted=Date.now();
  const logfile=openSync(join(root,'tunnel.log'),'a');
  tunnel=spawn(settings.cloudflared,['tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:8792'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let text='';
  const accept=chunk=>{
    // Cloudflared is deliberately not run at debug level; request headers are not logged.
    writeSync(logfile,chunk);text=(text+chunk.toString()).slice(-16000);
    const url=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if(url)currentUrl=validateBackend(url[0],true).origin;
  };
  tunnel.stdout.on('data',accept);tunnel.stderr.on('data',accept);
  tunnel.once('close',()=>closeSync(logfile));
  tunnel.once('error',()=>log('tunnel start failed'));tunnel.once('exit',()=>{currentUrl=null;log('tunnel exited');});log('tunnel started');
}
async function healthy(url) {
  try {const response=await fetch(new URL('/api/cash/health',url),{headers:{'x-cash-backend-key':runtime.backendKey},redirect:'error',signal:AbortSignal.timeout(8000)});return response.ok&&(await response.json()).status==='ready';}catch{return false;}
}
async function tick() {
  if(ticking||shuttingDown)return;ticking=true;
  try {
    if(!backend?.pid||backend.exitCode!==null)startBackend();
    if(!tunnel?.pid||tunnel.exitCode!==null)startTunnel();
    if(!currentUrl&&Date.now()-tunnelStarted>90000){tunnel.kill();await save({status:'tunnel-restarting'});return;}
    if(!currentUrl||!await healthy(currentUrl)){await save({status:'starting'});return;}
    if(currentUrl!==publishedUrl){
      await cli(['api','/v1/edge-config/'+settings.edgeConfigId+'/items','--method','PATCH','--input','-','--raw'],JSON.stringify({items:[{operation:'upsert',key:'cashBackendUrl',value:currentUrl}]}));
      publishedUrl=currentUrl;log('runtime endpoint updated');
    }
    await save({status:'ready'});
  }catch(error){await save({status:'attention',error:/^[A-Z_]+$/.test(error.message)?error.message:'CASH_SERVICE_RECOVERY_FAILED'});log('service recovery will retry');}
  finally{ticking=false;}
}
async function stop(){if(shuttingDown)return;shuttingDown=true;backend?.kill();tunnel?.kill();await unlink(lockPath).catch(()=>{});process.exit();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
await tick();setInterval(tick,15000);
