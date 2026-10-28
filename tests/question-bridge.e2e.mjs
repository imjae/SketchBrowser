import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {AUTHOR_ORIGIN} from '../src/review/transfer.ts';
import {questionTransferScript,parseQuestionPanelMessage,isQuestionPage} from '../src/ask/protocol.ts';

// Match Wrangler's keepNames transform on every run. An optional real dry-run
// Worker bundle verifies the complete auth -> HTML -> WebView handoff too.
const require=createRequire(new URL('../../imjae.github.io/package.json',import.meta.url));
const {build}=require('esbuild');
const output=process.env.SKETCH_QUESTION_BUNDLE ? null : await build({entryPoints:[fileURLToPath(new URL('../../imjae.github.io/server/author-auth.mjs',import.meta.url))],bundle:true,keepNames:true,write:false,format:'esm',platform:'browser'});
const module=await import(process.env.SKETCH_QUESTION_BUNDLE ? pathToFileURL(process.env.SKETCH_QUESTION_BUNDLE).href : 'data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZAAAAABJRU5ErkJggg==';
let requests=0,pendingImage=null,received=false,sourceMode='origin',dropReady=false;
const socket={readyState:1,send(raw){const value=JSON.parse(raw);if(value.type==='question')queueMicrotask(()=>hub.webSocketMessage(socket,JSON.stringify({type:'result',id:value.id,result:{status:'answer',answer:'2입니다.'}})));}};
const hub=new module.SketchQuestions({getWebSockets:()=>[socket]});
const env={GITHUB_CLIENT_ID:'fixture',GITHUB_CLIENT_SECRET:'fixture',ALLOWED_GITHUB_ID:'1',ASSETS:{fetch(){throw Error('Unexpected asset')}},
  AUTHOR_SESSIONS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({id:'1',login:'fixture',expiresAt:Date.now()+60000})})},
  SKETCH_QUESTIONS:{idFromName:x=>x,get:()=>({fetch:r=>hub.fetch(r)})}};
async function send(){if(pendingImage&&!received)await page.evaluate(questionTransferScript(pendingImage));}
try{
  await page.route(AUTHOR_ORIGIN+'/**',async route=>{
    const r=route.request(),headers=r.headers();headers.cookie='__Host-imjae_author='+'f'.repeat(43);
    if(r.method()==='POST')headers.origin=AUTHOR_ORIGIN;
    if(r.url().endsWith('/api/sketch/ask'))requests++;
    const response=await module.handleAuthorRequest(new Request(r.url(),{method:r.method(),headers,body:r.postData()||undefined}),env);
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  await page.exposeFunction('nativeQuestionMessage',async(raw,source)=>{
    const message=parseQuestionPanelMessage(raw,source);
    if(message?.type==='sketch-question-received'&&message.id===pendingImage?.id)received=true;
    if(message?.type==='sketch-question-ready'&&!dropReady)await send();
  });
  await page.addInitScript(()=>{window.ReactNativeWebView={postMessage:raw=>window.nativeQuestionMessage(raw,window.name==='legacy'?location.href:location.origin)};});
  for(const scenario of ['origin','legacy','load-end-fallback']) {
    sourceMode=scenario;dropReady=scenario==='load-end-fallback';received=false;pendingImage={id:crypto.randomUUID(),image};
    await page.evaluate(mode=>{window.name=mode;},sourceMode);
    const before=requests;await page.goto(AUTHOR_ORIGIN+'/sketch/ask/');
    if(dropReady){await expect(page.locator('#status')).toHaveText('선택한 영역을 기다리고 있어요.');assert(isQuestionPage(page.url()));await send();}
    await expect(page.locator('#answer')).toHaveText('2입니다.');await expect.poll(()=>received).toBe(true);
    await page.evaluate(questionTransferScript(pendingImage));await page.waitForTimeout(30);assert.equal(requests,before+1,'readiness/load-end/ack retries must not submit twice');
  }
  const before=requests;pendingImage=null;await page.reload();await expect(page.locator('#status')).toHaveText('선택한 영역을 기다리고 있어요.');assert.equal(requests,before);
  assert.deepEqual(errors,[]);
  console.log('Bundled Worker UI, Android origin-only bridge, full-URL bridge, load-end fallback, receipt and duplicate prevention passed.');
}finally{await browser.close();}
