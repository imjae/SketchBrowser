import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { INK_SCRIPT, commandScript } from '../src/ink/engine.ts';
import { captureQuestionImage } from '../src/ask/capture.ts';
import { handleQuestionRequest, SketchQuestions } from '../../imjae.github.io/server/sketch-question.mjs';

await mkdir('test-results/question',{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const context=await browser.newContext({viewport:{width:800,height:600},deviceScaleFactor:2});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
let image;
const send=command=>page.evaluate(commandScript(command));
const selection=()=>page.evaluate(()=>window.messages.filter(m=>m.channel==='sketch-question').at(-1)?.selection);
async function outline(points=[[80,80],[480,80],[80,380],[80,80]]) {
  await page.mouse.move(...points[0]);await page.mouse.down();
  for(const p of points.slice(1))await page.mouse.move(...p,{steps:12});
  await page.mouse.up();
  await expect.poll(selection).not.toBeNull();
  return selection();
}
const exchange=async(command)=>{
  await send(command);
  await expect.poll(()=>page.evaluate(nonce=>window.messages.filter(m=>m.channel==='sketch-question-capture'&&m.nonce===nonce).at(-1),command.nonce)).toBeTruthy();
  if(command.type==='questionMask')await expect.poll(()=>page.evaluate(nonce=>{const m=window.messages.filter(m=>m.channel==='sketch-question-capture'&&m.nonce===nonce).at(-1);return !!(m?.image||m?.error);},command.nonce)).toBe(true);
  const m=await page.evaluate(nonce=>window.messages.filter(m=>m.channel==='sketch-question-capture'&&m.nonce===nonce).at(-1),command.nonce);
  if(m.error)throw new Error(m.error);return m;
};
try {
  await page.route('https://article.test/**',r=>r.fulfill({headers:{'Content-Security-Policy':"img-src 'none'"},contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:rgb(220,60,50);min-height:1800px;font:24px sans-serif}#sample{position:absolute;left:105px;top:110px;background:rgb(40,180,90);width:170px;padding:12px;color:#111}</style><p id="sample">질문: 1 + 1은?</p>'}));
  await page.goto('https://article.test/read');
  await page.evaluate(()=>{window.messages=[];window.ReactNativeWebView={postMessage:raw=>window.messages.push(JSON.parse(raw))};});
  await page.evaluate(INK_SCRIPT);
  const ink={id:'original',tool:'pen',color:'#315de8',width:4,anchor:null,points:[{x:110,y:100,pressure:.5},{x:260,y:100,pressure:.5}]};
  const highlight={...ink,id:'highlight',tool:'highlighter',color:'#ffc107',width:2,points:[{x:110,y:116,pressure:.5},{x:200,y:116,pressure:.5}]};
  await send({type:'restore',strokes:[ink,highlight]});
  await send({type:'settings',settings:{tool:'question',color:'#315de8',width:3,penOnly:false}});
  await page.waitForTimeout(100);
  let q=await outline();
  assert.equal(await page.evaluate(()=>window.messages.some(m=>m.type==='change')),false,'outlines are not saved ink');
  await page.screenshot({path:'test-results/question/selected-region.png'});
  let pageOnly;
  image=await captureQuestionImage({nonce:'capture-1',selectionId:q.id,signal:new AbortController().signal,
    exchange,snapshot:async()=>{
      assert.equal(await page.locator('canvas').evaluate(el=>getComputedStyle(el).opacity),'0','native snapshot must exclude ink to prevent double compositing');
      pageOnly=(await page.screenshot()).toString('base64');return pageOnly;
    },release:command=>{void send(command);}});
  await writeFile('test-results/question/masked-region.png',Buffer.from(image,'base64'));
  const inspect=value=>page.evaluate(async value=>{
    const img=await createImageBitmap(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);img.close();
    return {width:c.width,height:c.height,outside:[...ctx.getImageData(c.width-10,c.height-10,1,1).data],inside:[...ctx.getImageData(12,12,1,1).data],ink:[...ctx.getImageData(80,40,1,1).data],highlight:[...ctx.getImageData(80,72,1,1).data],originalInkPosition:[...ctx.getImageData(240,200,1,1).data]};
  },value);
  const pixels=await inspect(image);
  assert.equal(pixels.width,800);assert.equal(pixels.height,600);
  assert.deepEqual(pixels.outside,[255,255,255,255],'outside freehand polygon must be white');
  assert.deepEqual(pixels.inside,[220,60,50,255],'the selection highlight must not be captured');
  assert.equal(pixels.ink[2]>pixels.ink[0],true,'original ink must remain in captured image');
  assert.deepEqual((await inspect(pageOnly)).originalInkPosition,[220,60,50,255],'raw native-equivalent snapshot has no ink');
  for(const [index,value] of [230,100,37,255].entries())assert.ok(Math.abs(pixels.highlight[index]-value)<=1,'highlighter must be composited exactly once');
  await expect(page.locator('canvas')).toHaveCSS('opacity','1');

  // Cancellation before the paint acknowledgement cannot leave invisible ink
  // or emit a stale ready response. A snapshot failure must also restore ink.
  await page.evaluate(commandScript({type:'questionCapture',nonce:'cancel-before-ready',selectionId:q.id})+'\n'+commandScript({type:'questionClear'}));
  await page.waitForTimeout(60);
  await expect(page.locator('canvas')).toHaveCSS('opacity','1');
  assert.equal(await page.evaluate(()=>window.messages.some(m=>m.nonce==='cancel-before-ready'&&m.ready)),false);
  q=await outline();
  await assert.rejects(captureQuestionImage({nonce:'snapshot-failure',selectionId:q.id,signal:new AbortController().signal,
    exchange,snapshot:async()=>{throw new Error('snapshot unavailable');},release:command=>{void send(command);}}),/snapshot unavailable/);
  await expect(page.locator('canvas')).toHaveCSS('opacity','1');

  await send({type:'questionRelease',nonce:'capture-1'});
  await page.evaluate(()=>scrollTo(0,100));await expect.poll(selection).toBeNull();
  await page.evaluate(()=>scrollTo(0,0));q=await outline();
  await exchange({type:'questionCapture',nonce:'changed',selectionId:q.id});
  await page.evaluate(()=>{document.getElementById('sample').textContent='본문이 바뀜';});
  await assert.rejects(exchange({type:'questionMask',nonce:'changed',image}),/화면이 바뀌었어요/);
  await send({type:'questionRelease',nonce:'changed'});
  q=await outline();await page.setViewportSize({width:810,height:600});await expect.poll(selection).toBeNull();
  await page.setViewportSize({width:800,height:600});
  await page.evaluate(()=>{
    const scroller=document.createElement('div');scroller.id='nested';scroller.style='position:absolute;left:550px;top:100px;width:150px;height:150px;overflow:auto';
    scroller.innerHTML='<div style="height:500px">내부 스크롤 내용</div>';document.body.append(scroller);
  });
  await page.waitForTimeout(50);q=await outline();
  await page.locator('#nested').evaluate(el=>{el.scrollTop=80;});await expect.poll(selection).toBeNull();
  q=await outline();await page.locator('#sample').evaluate(el=>{el.style.transform='translateX(20px)';});await expect.poll(selection).toBeNull();

  // Actual Android packet route: entering question mode must not auto-switch to pen.
  const points=[[80,80],[280,80],[280,280],[80,280],[80,80]];
  await page.evaluate(points=>{
    let stream=1;const packet=(type,p,start=false,end=false)=>window.__sketchBrowserInk.nativeInput({stream,start,end,width:1600,height:1200,events:[{kind:'pen',id:0,type,x:p[0]*2,y:p[1]*2,pressure:.6,pressed:false}]});
    packet('down',points[0],true);for(const p of points.slice(1))packet('move',p);packet('up',points.at(-1),false,true);
  },points);
  await expect.poll(selection).not.toBeNull();
  assert.equal(await page.evaluate(()=>window.messages.some(m=>m.type==='change'||m.type==='pen')),false);
  await send({type:'questionClear'});await expect.poll(selection).toBeNull();
  // Open lines and touch/palm input must not produce a question selection.
  await page.mouse.move(80,80);await page.mouse.down();await page.mouse.move(400,280,{steps:20});await page.mouse.up();
  assert.equal(await selection(),null);
  await page.evaluate(()=>{
    const canvas=document.querySelector('canvas');
    canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:21,clientX:100,clientY:100}));
    canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',pointerId:21,clientX:100,clientY:100}));
  });
  assert.equal(await selection(),null);
  await send({type:'settings',settings:{tool:'pen',color:'#315de8',width:3,penOnly:false}});

  // Handwritten 7 + 5 = ? enters through actual Android pen packets, while
  // the printed page asks a different question. Keep this synthetic fixture
  // available for optional live model checks; production questions are unsaved.
  await page.evaluate(()=>{
    document.body.style.background='#fff';
    const sample=document.getElementById('sample');sample.textContent='인쇄된 질문: 1 + 1은?';sample.style.cssText='position:absolute;left:100px;top:105px;width:300px;background:#f0f0f0';
  });
  const handwriting=[
    [[125,200],[153,200],[137,240]],
    [[177,208],[177,233]],[[165,220],[189,220]],
    [[230,200],[204,200],[202,218],[220,216],[230,222],[230,234],[220,241],[204,238]],
    [[250,213],[275,213]],[[250,227],[275,227]],
    [[295,208],[300,201],[313,200],[322,206],[322,215],[310,223],[309,230]],[[309,240]],
  ];
  await page.evaluate(strokes=>{
    strokes.forEach((points,index)=>{
      const packet=(type,p,start=false,end=false)=>window.__sketchBrowserInk.nativeInput({stream:100+index,start,end,width:1600,height:1200,events:[{kind:'pen',id:0,type,x:p[0]*2,y:p[1]*2,pressure:.65,pressed:false}]});
      packet('down',points[0],true);for(const p of points.slice(1))packet('move',p);packet('up',points.at(-1),false,true);
    });
  },handwriting);
  assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.type==='change').length),handwriting.length);
  await send({type:'settings',settings:{tool:'question',color:'#315de8',width:3,penOnly:false}});
  await page.waitForTimeout(80);q=await outline([[80,80],[480,80],[480,330],[80,330],[80,80]]);
  const handwrittenImage=await captureQuestionImage({nonce:'handwritten',selectionId:q.id,signal:new AbortController().signal,
    exchange,snapshot:async()=>{
      await page.screenshot({path:'test-results/question/printed-only.png',clip:{x:80,y:80,width:400,height:250}});
      return (await page.screenshot()).toString('base64');
    },release:command=>{void send(command);}});
  await writeFile('test-results/question/handwritten-question.png',Buffer.from(handwrittenImage,'base64'));
  const handwritingPixel=await page.evaluate(async value=>{
    const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))],{type:'image/png'}));
    const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
    return [...ctx.getImageData(180,280,1,1).data];
  },handwrittenImage);
  assert.ok(handwritingPixel[2]>handwritingPixel[0]+50,'native pen handwriting must survive composition');
  await expect(page.locator('canvas')).toHaveCSS('opacity','1');

  // Real question endpoint + real UI, with a simulated model response only.
  let result={status:'answer',answer:'1 + 1은 2입니다.'},fail=false,requests=0,delay=0;
  const socket={readyState:1,send(raw){const m=JSON.parse(raw);if(m.type!=='question')return;
    const output={type:'result',id:m.id,...(fail?{error:'failed'}:{result})};fail=false;
    setTimeout(()=>hub.webSocketMessage(socket,JSON.stringify(output)),delay);
  }};
  const hub=new SketchQuestions({getWebSockets:()=>[socket]});
  const env={ALLOWED_GITHUB_ID:'1',SKETCH_QUESTIONS:{idFromName:x=>x,get:()=>({fetch:r=>hub.fetch(r)})}};
  await page.route('https://owner.test/**',async route=>{
    const r=route.request(),headers=r.headers();if(r.method()==='POST')headers.origin='https://owner.test';
    if(r.url().endsWith('/api/sketch/ask'))requests++;
    hub.starts=[]; // This UI suite exercises more than the production minute quota.
    const response=await handleQuestionRequest(new Request(r.url(),{method:r.method(),headers,body:r.postData()||undefined}),env,{ownerId:'1'});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()}).catch(()=>{});
  });
  await page.addInitScript(()=>{window.nativeMessages=[];window.ReactNativeWebView={postMessage:raw=>window.nativeMessages.push(JSON.parse(raw))};});
  const open=async()=>{await page.goto('https://owner.test/sketch/ask/');await page.evaluate(value=>window.receiveSketchQuestion(value),{id:crypto.randomUUID(),image});};
  await open();await expect(page.locator('#answer')).toHaveText('1 + 1은 2입니다.');
  assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
  await page.evaluate(value=>window.receiveSketchQuestion(value),{id:crypto.randomUUID(),image});assert.equal(requests,1,'repeated bridge readiness must not resubmit');
  await page.screenshot({path:'test-results/question/answer.png'});
  await page.reload();await expect(page.locator('#answer')).toBeHidden();assert.equal(requests,1,'reload cannot restore or resend an image');
  result={status:'no_content',answer:''};await open();await expect(page.locator('#status')).toHaveText('선택한 영역에서 질문이나 설명할 내용을 찾지 못했어요.');await expect(page.locator('#answer')).toBeHidden();
  result={status:'unreadable',answer:''};await open();await expect(page.locator('#status')).toHaveText('내용을 읽기 어려워요. 영역을 다시 지정해 주세요.');
  result={status:'answer',answer:'<img src=x onerror="window.hacked=true">는 평문입니다.'};fail=true;await open();await expect(page.getByRole('button',{name:'다시 시도'})).toBeVisible();await page.getByRole('button',{name:'다시 시도'}).click();await expect(page.locator('#answer')).toContainText('<img');assert.equal(await page.locator('img').count(),0);
  delay=300;result={status:'answer',answer:'늦은 답변'};await open();await page.evaluate(()=>window.disposeSketchQuestion());await page.waitForTimeout(450);await expect(page.locator('#status')).toHaveText('질문을 종료했어요.');await expect(page.locator('#answer')).toBeHidden();
  assert.deepEqual(errors,[]);
  console.log('Question region capture, masking, native pen, ephemeral answer UI and recovery passed.');
} finally {await browser.close();}
