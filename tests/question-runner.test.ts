import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { QuestionCodex } from '../runner/codex-question.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture({auth='chatgpt',tool=false,hold=false}={}){
  const commands:any[]=[];let child:any;
  const spawnProcess=(_exe:string,_args:string[],options:any)=>{
    assert.equal(options.shell,false);assert.equal(options.windowsHide,true);
    child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()});
    child.stdin.on('data',(b:Buffer)=>{
      const m=JSON.parse(b.toString());commands.push(m);if(!m.id)return;
      const out=(v:any)=>child.stdout.write(JSON.stringify(v)+'\n');
      let result:any={};if(m.method==='account/read')result={account:{type:auth}};
      if(m.method==='config/read')result={config:{mcp_servers:{sample:{enabled:true}}}};
      if(m.method==='thread/start'){assert.equal(m.params.ephemeral,true);assert.deepEqual(m.params.environments,[]);assert.deepEqual(m.params.dynamicTools,[]);result={thread:{id:'test',ephemeral:true,path:null}};}
      out({id:m.id,result});
      if(m.method==='turn/start'&&!hold)queueMicrotask(()=>{
        out({method:'item/started',params:{threadId:'test',item:{type:tool?'commandExecution':'agentMessage'}}});
        if(!tool){out({method:'item/completed',params:{threadId:'test',item:{type:'agentMessage',text:JSON.stringify({status:'answer',answer:'2입니다.'})}}});out({method:'turn/completed',params:{threadId:'test',turn:{status:'completed'}}});}
      });
    });return child;
  };
  const client=new QuestionCodex({codex:'fixture.js',root:join(tmpdir(),'sketch-question-test'),model:'fixture'},{spawnProcess:spawnProcess as unknown as typeof import('node:child_process').spawn});
  return {client,commands};
}
test('question runner only uses ChatGPT auth and sends an ephemeral in-memory image',async()=>{
  const {client,commands}=fixture();try{await client.start();assert.equal((await client.ask('iVBORw0KGgoAAA==',new AbortController().signal)).answer,'2입니다.');
    const turn=commands.find(m=>m.method==='turn/start');assert.equal(turn.params.input[1].type,'image');assert.match(turn.params.input[1].url,/^data:image\/png;base64,/);
    assert.equal(commands.find(m=>m.method==='thread/start').params.config['mcp_servers.sample.enabled'],false);
  }finally{client.close();}
  const api=fixture({auth:'apiKey'}).client;try{await assert.rejects(api.start(),/auth/);}finally{api.close();}
});
test('question runner rejects tool execution and cancels an unfinished answer',async()=>{
  const tool=fixture({tool:true}).client;try{await tool.start();await assert.rejects(tool.ask('image',new AbortController().signal),/failed/);}finally{tool.close();}
  const hold=fixture({hold:true}).client;try{await hold.start();const abort=new AbortController();const pending=hold.ask('image',abort.signal);abort.abort();await assert.rejects(pending,/cancelled/);}finally{hold.close();}
});
