import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server = await createServer({ server: {host:'127.0.0.1',port:0} });
await server.listen();
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
const page = await context.newPage();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const phase = value => page.locator(`[data-phase="${value}"]`).waitFor({timeout:180000});
const settled = () => page.locator('.save-status').waitFor({state:'hidden'});
const back = async () => {await settled(); await page.locator('[data-step-back]').click(); await settled();};
const forward = async () => {await settled(); await page.evaluate(()=>document.activeElement?.blur()); await page.keyboard.press('Enter');};
const state = () => page.evaluate(async()=>{const {BrowserStore}=await import('/src/storage/index.ts'); const store=new BrowserStore({broadcast:false}); return store.load();});
try {
 await page.goto(base); await page.getByRole('button',{name:'Start CompSim',exact:true}).waitFor();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('switch',{name:'Wait between solves',exact:true}).click(); await settled();
 await page.getByRole('radio',{name:'Random Duration',exact:true}).click(); await settled();
 await page.getByRole('textbox',{name:'Minimum wait (MM:SS)',exact:true}).fill('00:15');
 await page.getByRole('textbox',{name:'Maximum wait (MM:SS)',exact:true}).fill('00:35'); await settled();
 await page.reload(); await page.getByRole('button',{name:'Settings',exact:true}).click();
 assert.equal((await state()).settings.waitMaxSeconds,35);
 assert.equal((await state()).settings.waitMinSeconds,15);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await forward(); await phase('scramble'); const notation=await page.locator('.scramble-notation').textContent();
 await forward(); await phase('waiting'); await back(); await phase('scramble');
 assert.equal(await page.locator('.scramble-notation').textContent(),notation);
 // Disable waiting, then walk through inspection, timer and recorded result.
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('switch',{name:'Wait between solves',exact:true}).click(); await settled();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await forward(); await phase('ready'); await forward(); await phase('inspection');
 await back(); await phase('ready'); await forward(); await phase('inspection');
 await page.evaluate(()=>document.activeElement?.blur()); await page.keyboard.down('Space'); await page.waitForTimeout(650); await page.keyboard.up('Space'); await phase('solving');
 await back(); await phase('inspection');
 await page.evaluate(()=>document.activeElement?.blur()); await page.keyboard.down('Space'); await page.waitForTimeout(650); await page.keyboard.up('Space'); await phase('solving');
 await page.keyboard.press('Enter'); await phase('confirm'); await settled();
 assert.equal((await state()).rounds[0].attempts.length,1);
 await back(); await phase('solving'); assert.equal((await state()).rounds[0].attempts.length,0);
 await page.evaluate(()=>document.activeElement?.blur()); await page.keyboard.press('Enter'); await phase('confirm'); await settled();
 assert.equal((await state()).rounds[0].attempts.length,1);
 await forward(); await phase('scramble'); await back(); await phase('confirm');
 assert.equal((await state()).rounds[0].attempts.length,1);
 await page.reload(); await phase('home'); assert.equal((await state()).rounds[0].attempts.length,1);
 await page.evaluate(async () => {
   const {BrowserStore} = await import('/src/storage/index.ts'); const store = new BrowserStore({broadcast:false});
   let current = await store.load(); current = await store.discardActiveRound(current.revision);
   await store.saveSettings({...current.settings,inputMethod:'manual',inspection:false,waitEnabled:false},current.revision);
 });
 await page.reload(); await phase('home'); await forward(); await phase('scramble');
 for (let i=0;i<5;i++) {
   await forward(); await phase('ready'); await forward(); await phase('entry');
   await page.locator('#manual-time').fill('1234'); await forward();
   await phase(i===4?'complete':'scramble');
 }
 await back(); await phase('entry');
 assert.equal(await page.locator('#manual-time').inputValue(),'1234');
 assert.equal((await state()).rounds[0].attempts.length,4);
 assert.equal((await state()).rounds[0].completedAt,undefined);
 await forward(); await phase('complete');
 assert.equal((await state()).rounds[0].attempts.length,5);
 console.log('PASS: immediate wait persistence, same scramble, inspection/timer back, result rollback, next scramble back, reload retains times.');
} finally {await browser.close(); await server.close();}
