import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../imjae.github.io/package.json',import.meta.url));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const source=new URL('../../imjae.github.io/server/sketch-question.mjs',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1');
const code=`import {handleQuestionRequest} from ${JSON.stringify(source)};export {SketchQuestions} from ${JSON.stringify(source)};
export default {fetch(request,env){return handleQuestionRequest(request,env,{ownerId:'1',runner:new URL(request.url).pathname.includes('question-runner')});}};`;
const bundle=await build({stdin:{contents:code,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'question-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-23',durableObjects:{SKETCH_QUESTIONS:{className:'SketchQuestions',useSQLite:true}},bindings:{ALLOWED_GITHUB_ID:'1',SKETCH_RUNNER_TOKEN:'fixture-only'}}]}));
const origin='https://owner.test',image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZAAAAABJRU5ErkJggg==';
const post=(path,body)=>mf.dispatchFetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Sketch-Request':'1'},body:JSON.stringify(body)});
try{
  assert.equal((await mf.dispatchFetch(origin+'/api/sketch/question-runner/connect',{headers:{Upgrade:'websocket',Authorization:'Bearer wrong'}})).status,401);
  const connected=await mf.dispatchFetch(origin+'/api/sketch/question-runner/connect',{headers:{Upgrade:'websocket',Authorization:'Bearer fixture-only'}});
  assert.equal(connected.status,101);const socket=connected.webSocket;socket.accept();
  let cancelId;socket.addEventListener('message',e=>{if(e.data==='pong')return;const m=JSON.parse(e.data);if(m.type==='cancel'){cancelId=m.id;return;}if(m.type==='question'&&m.id!==holding)socket.send(JSON.stringify({type:'result',id:m.id,result:{status:'answer',answer:'2입니다.'}}));});
  let holding='';
  assert.equal((await (await mf.dispatchFetch(origin+'/api/sketch/ask/status')).json()).online,true);
  const reply=await post('/api/sketch/ask',{id:crypto.randomUUID(),image});assert.equal(reply.status,200);assert.equal((await reply.json()).message,'2입니다.');
  holding=crypto.randomUUID();const pending=post('/api/sketch/ask',{id:holding,image});
  for(let i=0;i<30;i++){if((await (await mf.dispatchFetch(origin+'/api/sketch/ask/status')).json()).busy)break;await new Promise(r=>setTimeout(r,10));}
  await post('/api/sketch/ask/cancel',{id:holding});assert.equal((await pending).status,499);
  await new Promise(r=>setTimeout(r,30));assert.equal(cancelId,holding);
  socket.close();await new Promise(r=>setTimeout(r,50));
  assert.equal((await post('/api/sketch/ask',{id:crypto.randomUUID(),image})).status,503);
  console.log('Cloudflare runtime: authenticated WebSocket relay, in-memory response, cancellation and offline handling passed.');
}finally{await mf.dispose();}
