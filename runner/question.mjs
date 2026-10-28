import { join } from 'node:path';
import { homedir } from 'node:os';
import { WebSocket } from 'ws';
import { loadConfig } from './main.mjs';
import { answerQuestion, QuestionCodex } from './codex-question.mjs';

const config=await loadConfig(join(homedir(),'.sketch-browser-runner/config.json'));
const probe=new QuestionCodex(config);
try{await probe.start();}catch{console.error('Codex의 ChatGPT 로그인을 확인한 뒤 질문 실행기를 다시 시작해 주세요.');process.exitCode=1;}
finally{probe.close();}
if(process.exitCode)process.exit(process.exitCode);
let stopped=false,current=null,socket=null;
const stop=()=>{stopped=true;current?.controller.abort();socket?.close();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
const endpoint=config.server.replace('https:','wss:')+'/api/sketch/question-runner/connect';
let retryMs=1000;
while(!stopped){
  await new Promise(resolve=>{
    socket=new WebSocket(endpoint,{headers:{Authorization:'Bearer '+config.token},maxPayload:4_001_000,handshakeTimeout:15000,followRedirects:false});
    let lastPong=Date.now();const heartbeat=setInterval(()=>{if(Date.now()-lastPong>60000)socket.terminate();else if(socket.readyState===WebSocket.OPEN)socket.send('ping');},20000);
    socket.on('open',()=>{retryMs=1000;console.log('PC 질문 연결 완료. ChatGPT 구독 계정으로 요청을 기다립니다.');});
    socket.on('message',raw=>{
      if(raw.toString()==='pong'){lastPong=Date.now();return;}
      let m;try{m=JSON.parse(raw.toString());}catch{return;}
      if(m.type==='cancel'&&current?.id===m.id){current.controller.abort();return;}
      if(m.type!=='question'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(m.id)||typeof m.image!=='string'||m.image.length>4000000||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(m.image))return;
      if(current){socket.send(JSON.stringify({type:'result',id:m.id,error:'failed'}));return;}
      const job={id:m.id,controller:new AbortController()},connection=socket;current=job;
      void answerQuestion(config,m.image,job.controller.signal).then(result=>{
        if(!job.controller.signal.aborted && connection.readyState===WebSocket.OPEN)connection.send(JSON.stringify({type:'result',id:job.id,result}));
      },error=>{if(!job.controller.signal.aborted&&connection.readyState===WebSocket.OPEN)connection.send(JSON.stringify({type:'result',id:job.id,error:error.code||'failed'}));})
        .finally(()=>{if(current===job)current=null;});
    });
    socket.on('error',()=>{});
    socket.on('close',()=>{clearInterval(heartbeat);current?.controller.abort();resolve();});
  });
  if(!stopped){console.log('PC 질문 연결이 끊겼습니다. 다시 연결합니다.');await new Promise(resolve=>setTimeout(resolve,retryMs));retryMs=Math.min(retryMs*2,30000);}
}
