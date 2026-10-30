import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import postgres from 'postgres';
const execFile=promisify(callback);
const [centralPath,privatePath,verifyFlag]=process.argv.slice(2);
if(!centralPath||!privatePath||verifyFlag!=='--verify')throw Error('USAGE: node scripts/backup-cash.mjs CENTRAL_RUNTIME CASH_PRIVATE_DIRECTORY --verify');
const settings=JSON.parse(await readFile(centralPath,'utf8')),cash=JSON.parse(await readFile(join(privatePath,'cash-runtime.secret.json'),'utf8'));
const key=Buffer.from(JSON.parse(await readFile(join(privatePath,'backup-key.secret.json'),'utf8')).keyHex,'hex');
const url=new URL(settings.databaseUrl);
if(url.hostname!=='127.0.0.1'||url.port!=='55445'||url.pathname!=='/pfig_central_production'||settings.adminUser!=='pfig_central_admin'||key.length!==32)throw Error('INVALID_BACKUP_TARGET');
url.username=settings.adminUser;url.password=settings.adminPassword;
const sql=postgres(url.href,{max:1,prepare:false,onnotice(){}});
const docker=async args=>(await execFile('docker',args,{encoding:'buffer',windowsHide:true,maxBuffer:100*1024*1024,timeout:120000})).stdout;
async function inventory(db){
  const tables=await db`select tablename from pg_tables where schemaname='pfig_cash' order by tablename`,rows=[];
  for(const table of tables){if(!/^[a-z_]+$/.test(table.tablename))throw Error('INVALID_BACKUP_TABLE');const [item]=await db.unsafe(`select count(*)::text as rows,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by md5(row_to_json(t)::text)),'')) as hash from pfig_cash.${table.tablename} t`);rows.push({name:table.tablename,...item});}
  return rows;
}
try{
  const snapshot=await sql.begin('isolation level repeatable read read only',async tx=>{
    if((await tx`select product from pfig_core.storage_identity where id=1`)[0]?.product!=='PFIG_CENTRAL_V1')throw Error('CENTRAL_IDENTITY_REQUIRED');
    const [snapshot]=await tx`select pg_export_snapshot() as id`;
    const data=await docker(['exec',settings.container,'pg_dump','-U',settings.adminUser,'-d','pfig_central_production','--format=custom','--schema=pfig_cash','--snapshot='+snapshot.id]);
    return {data,inventory:await inventory(tx)};
  });
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(snapshot.data),cipher.final()]);
  const file=Buffer.concat([Buffer.from('PFIGCASH1'),iv,cipher.getAuthTag(),encrypted]);
  const directory=resolve(privatePath,'backups');await mkdir(directory,{recursive:true});
  const filename=join(directory,'pfig-cash-'+new Date().toISOString().replaceAll(':','-')+'.dump.enc');
  await writeFile(filename,file,{flag:'wx',mode:0o600});
  const saved=await readFile(filename),decipher=createDecipheriv('aes-256-gcm',key,saved.subarray(9,21));decipher.setAuthTag(saved.subarray(21,37));
  const decrypted=Buffer.concat([decipher.update(saved.subarray(37)),decipher.final()]);
  if(!decrypted.equals(snapshot.data))throw Error('CASH_BACKUP_READBACK_FAILED');
  const testName='pfig_central_cash_test_'+randomBytes(8).toString('hex'),temp=join(directory,'.restore-'+testName+'.dump');
  let created=false,check,app;
  try{
    await docker(['exec',settings.container,'createdb','-U',settings.adminUser,testName]);created=true;
    await writeFile(temp,decrypted,{flag:'wx',mode:0o600});
    await docker(['cp',temp,settings.container+':/tmp/'+testName+'.dump']);
    await docker(['exec',settings.container,'pg_restore','--exit-on-error','-U',settings.adminUser,'-d',testName,'/tmp/'+testName+'.dump']);
    const checkUrl=new URL(url);checkUrl.pathname='/'+testName;check=postgres(checkUrl.href,{max:1,prepare:false,onnotice(){}});
    if(JSON.stringify(await inventory(check))!==JSON.stringify(snapshot.inventory))throw Error('CASH_RESTORE_FINGERPRINT_MISMATCH');
    const appUrl=new URL(cash.databaseUrl);appUrl.pathname='/'+testName;app=postgres(appUrl.href,{max:1,prepare:false,onnotice(){}});
    await app`select revision from pfig_cash.workspaces where id='main'`;
    await app.begin(async tx=>{await tx`update pfig_cash.workspaces set updated_at=updated_at where id='main'`;throw Error('TEST_ROLLBACK');}).catch(error=>{if(error.message!=='TEST_ROLLBACK')throw error});
    let denied=false;try{await app`delete from pfig_cash.workspace_events`}catch(error){denied=error.code==='42501'}if(!denied)throw Error('CASH_RESTORE_AUDIT_PRIVILEGES_FAILED');
  }finally{
    await app?.end();await check?.end();
    if(dirname(resolve(temp))!==directory||!/^pfig_central_cash_test_[a-f0-9]+$/.test(testName))throw Error('UNSAFE_RESTORE_CLEANUP');
    await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error});
    if(created)await docker(['exec',settings.container,'dropdb','-U',settings.adminUser,testName]);
    await docker(['exec',settings.container,'rm','-f','/tmp/'+testName+'.dump']);
  }
  const result={schema:'pfig_cash',createdAt:new Date().toISOString(),encryptedReadBackVerified:true,restoreVerified:true,runtimePrivilegesVerified:true,tables:snapshot.inventory.length,sha256:createHash('sha256').update(file).digest('hex'),bytes:file.length,file:filename,inventory:snapshot.inventory};
  await writeFile(filename+'.json',JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  await writeFile(join(directory,'latest-backup-status.json'),JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify({...result,inventory:undefined},null,2));
}finally{await sql.end();}
