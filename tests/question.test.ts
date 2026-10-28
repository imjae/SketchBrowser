import test from 'node:test';
import assert from 'node:assert/strict';
import { captureQuestionImage } from '../src/ask/capture';
import { parseQuestionMessage, questionTransferScript, isQuestionPage, parseQuestionPanelMessage } from '../src/ask/protocol';
import { AUTHOR_ORIGIN } from '../src/review/transfer';

test('question panel accepts Android source origins and legacy page URLs while keeping the image page guarded',()=>{
  const ready=JSON.stringify({type:'sketch-question-ready'});
  for(const source of [AUTHOR_ORIGIN,AUTHOR_ORIGIN+'/',AUTHOR_ORIGIN+'/sketch/ask/'])assert.equal(parseQuestionPanelMessage(ready,source)?.type,'sketch-question-ready');
  for(const source of ['https://github.com',AUTHOR_ORIGIN+'/auth/callback',AUTHOR_ORIGIN+'/sketch/',AUTHOR_ORIGIN+'.attacker.test/sketch/ask/','null'])assert.equal(parseQuestionPanelMessage(ready,source),null);
  assert.equal(isQuestionPage(AUTHOR_ORIGIN),false);assert.equal(isQuestionPage(AUTHOR_ORIGIN+'/sketch/ask/'),true);
  const id='12345678-1234-1234-1234-123456789abc';
  assert.deepEqual(parseQuestionPanelMessage(JSON.stringify({type:'sketch-question-received',id}),AUTHOR_ORIGIN),{type:'sketch-question-received',id});
  assert.equal(parseQuestionPanelMessage(JSON.stringify({type:'sketch-question-received',id:'bad'}),AUTHOR_ORIGIN),null);
});

test('question bridge accepts bounded regions and rejects malformed page messages', () => {
  const m={channel:'sketch-question',documentId:'doc',selection:{id:'region',documentId:'doc',bounds:{x:.1,y:.2,width:.4,height:.3}}};
  assert.ok(parseQuestionMessage(JSON.stringify(m)));
  for(const value of [null,{}, {...m,selection:undefined},{...m,selection:{...m.selection,documentId:'other'}},
    {...m,selection:{...m.selection,bounds:{x:.9,y:0,width:.4,height:.3}}},{...m,notice:'x'.repeat(201)}]) assert.equal(parseQuestionMessage(JSON.stringify(value)),null);
  assert.ok(parseQuestionMessage(JSON.stringify({...m,selection:null})));
  const script=questionTransferScript({id:'id',image:'</script>'});
  assert.ok(script.includes("location.pathname===\"/sketch/ask/\""));
  assert.ok(!script.includes('</script>'));
});

test('only a completed masked image can leave the capture transaction', async () => {
  const events:string[]=[];
  const result=await captureQuestionImage({nonce:'nonce',selectionId:'selection',signal:new AbortController().signal,
    exchange:async command=>{events.push(command.type);return command.type==='questionCapture'?{ready:true}:{image:'iVBORw0KGgoAAA=='};},
    snapshot:async()=>{events.push('snapshot');return 'full-screen';},release:command=>events.push(command.type)});
  assert.equal(result,'iVBORw0KGgoAAA==');
  assert.deepEqual(events,['questionCapture','snapshot','questionMask','questionRelease']);
});

test('closing during screenshot prevents masking and always releases the hidden outline', async () => {
  const abort=new AbortController(),events:string[]=[];
  await assert.rejects(captureQuestionImage({nonce:'nonce',selectionId:'selection',signal:abort.signal,
    exchange:async command=>{events.push(command.type);return {ready:true};},
    snapshot:async()=>{abort.abort();return 'full-screen';},release:command=>events.push(command.type)}));
  assert.deepEqual(events,['questionCapture','questionRelease']);
});

test('capture failures release the transaction and never return the full screenshot', async () => {
  for(const failure of ['prepare','snapshot','mask','invalid']) {
    let released=false;
    await assert.rejects(captureQuestionImage({nonce:'nonce',selectionId:'selection',signal:new AbortController().signal,
      exchange:async command=>{
        if(command.type==='questionCapture'){if(failure==='prepare')throw new Error('changed');return {ready:true};}
        if(failure==='mask')throw new Error('changed');return {image:'full-screen'};
      },snapshot:async()=>{if(failure==='snapshot')throw new Error('view gone');return 'full-screen';},release:()=>{released=true;}}));
    assert.equal(released,true);
  }
});

test('closing releases a capture even when the native screenshot never returns', async () => {
  const abort=new AbortController();let started!:()=>void,released=false;
  const ready=new Promise<void>(resolve=>{started=resolve;});
  const pending=captureQuestionImage({nonce:'nonce',selectionId:'selection',signal:abort.signal,
    exchange:async()=>({ready:true}),snapshot:()=>{started();return new Promise(()=>{});},release:()=>{released=true;}});
  await ready;abort.abort();
  await assert.rejects(pending,/취소/);assert.equal(released,true);
});
