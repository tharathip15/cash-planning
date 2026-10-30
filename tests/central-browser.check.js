async (page) => {
  const seed = await (await page.request.get('http://localhost:3000/api/cash/workspace')).json();
  if (!seed.storage) throw Error('Central API did not return the workspace');
  const context = await page.context().browser().newContext();
  const check = await context.newPage();
  let revision = seed.revision, storage = {...seed.storage}, mode='ok';
  const receipts=new Map(), outcomes=[];
  await context.addInitScript(() => localStorage.setItem('profess-edits-v2','{"preservedBrowserData":true}'));
  await check.route('**/api/cash/workspace*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='GET')return route.fulfill({json:url.searchParams.get('revision')===String(revision)?{revision,unchanged:true}:{...seed,revision,storage}});
    const body=request.postDataJSON();
    if(mode==='offline')return route.abort('internetdisconnected');
    if(mode==='conflict') {mode='ok';revision++;return route.fulfill({status:409,json:{error:'VERSION_CONFLICT',revision}});}
    if(receipts.has(body.requestId))return route.fulfill({json:{revision:receipts.get(body.requestId),replayed:true}});
    if(body.revision!==revision)return route.fulfill({status:409,json:{error:'VERSION_CONFLICT',revision}});
    for(const[key,value]of Object.entries(body.changes)){if(value===null)delete storage[key];else storage[key]=value;}
    revision++;receipts.set(body.requestId,revision);
    if(mode==='lost-response'){mode='ok';return route.abort('internetdisconnected');}
    return route.fulfill({json:{revision}});
  });
  try {
    await check.goto('http://localhost:3000');
    await check.waitForFunction(()=>document.querySelector('.cash-central-status span')?.textContent.includes('ฐานกลางแล้ว'));
    if(await check.evaluate(()=>localStorage['profess-edits-v2'])!=='{"preservedBrowserData":true}')throw Error('Original browser data was overwritten');
    outcomes.push('Original localStorage remains unchanged');
    mode='offline';
    await check.evaluate(()=>localStorage.setItem('profess-customer-behavior-v1','{"browserTest":{"paymentBehavior":"on_due"}}'));
    await check.waitForFunction(()=>document.querySelector('.cash-central-status span')?.textContent.includes('ยังไม่ได้บันทึก'));
    if(storage['profess-customer-behavior-v1']?.includes('browserTest'))throw Error('Offline write was reported as saved');
    const queued=await check.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('pfig-cash-pending');request.onsuccess=()=>{const read=request.result.transaction('outbox').objectStore('outbox').getAll();read.onsuccess=()=>resolve(read.result.length);read.onerror=()=>reject(read.error);};}));
    if(!queued)throw Error('Pending changes were not durable');
    outcomes.push('Offline writes stay visibly unsaved and durable in IndexedDB');
    mode='ok';await check.locator('[data-retry]').click();
    await check.waitForFunction(()=>document.querySelector('.cash-central-status span')?.textContent.includes('บันทึกในฐานกลางแล้ว'));
    if(!storage['profess-customer-behavior-v1'].includes('browserTest'))throw Error('Retry did not save');
    outcomes.push('Retry persists queued changes');
    const before=revision;mode='lost-response';
    await check.evaluate(()=>localStorage.setItem('profess-customer-behavior-v1','{"browserTest":{"paymentBehavior":"usually_late"}}'));
    await check.waitForFunction(()=>document.querySelector('.cash-central-status span')?.textContent.includes('ยังไม่ได้บันทึก'));
    await check.locator('[data-retry]').click();
    await check.waitForFunction(()=>document.querySelector('.cash-central-status span')?.textContent.includes('บันทึกในฐานกลางแล้ว'));
    if(revision!==before+1)throw Error('Lost response created a duplicate revision');
    outcomes.push('Lost-response retry uses the same request ID');
    mode='conflict';
    await check.evaluate(()=>localStorage.setItem('profess-customer-behavior-v1','{"browserTest":{"paymentBehavior":"early"}}'));
    await check.waitForFunction(()=>document.getElementById('profess-workspace').inert===true);
    if(!(await check.locator('[data-export]').isVisible()))throw Error('Conflict has no recovery export');
    outcomes.push('Concurrent changes freeze editing and offer recovery');
    await check.locator('[data-retry]').click();
    await check.waitForFunction(()=>document.querySelector('.cash-central-status span')?.textContent.includes('ฐานกลางแล้ว'));
    if(await check.evaluate(()=>document.getElementById('profess-workspace').inert))throw Error('Reload did not resume from central data');
    if(await check.getByRole('button',{name:'สำรองรายการรอบันทึกก่อนหน้า'}).count()!==1)throw Error('Conflict recovery copy was lost on reload');
    if((await check.evaluate(()=>localStorage.getItem('profess-customer-behavior-v1'))).includes('early'))throw Error('Conflict overwritten remote changes');
    outcomes.push('Reload preserves a recovery copy and loads central state');
    return {checks:outcomes.length,outcomes,realDatabaseMutations:false};
  } catch(error) { throw Error(error.message+'; completed checks: '+outcomes.join('; ')+'; status: '+await check.locator('.cash-central-status span').textContent()); }
  finally { await context.close(); }
}
