import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore JavaScript runner is intentionally usable outside Metro.
import { applyReplacements, normalizedHash, inside } from '../runner/core.mjs';
import { parseCapture, transferScript } from '../src/review/transfer';

const source='---\ntitle: 예시\ndraft: false\n---\n첫 문장입니다.\n두 번째 문장입니다.\n';
const result=(before:string,after:string)=>({summary:'문장을 다듬었습니다.',questions:[],replacements:[{before,after}]});
test('AI 제안은 본문만 정확히 교체하고 메타데이터를 보존한다',()=>{
  assert.equal(applyReplacements(source,result('첫 문장입니다.','첫 문장.')).source,source.replace('첫 문장입니다.','첫 문장.'));
  assert.throws(()=>applyReplacements(source,result('draft: false','draft: true')));
  assert.throws(()=>applyReplacements(source,result('문장입니다.','문장.')));
  assert.throws(()=>applyReplacements(source,{...result('첫 문장입니다.','첫 문장.'),replacements:[{before:'첫 문장입니다.',after:'a'},{before:'첫 문장',after:'b'}]}));
  assert.deepEqual(applyReplacements(source,{summary:'',questions:['어떤 뜻인가요?'],replacements:[]}),{questions:['어떤 뜻인가요?']});
});
test('실행 HTML과 새 외부 링크를 막고 코드 예시는 유지한다',()=>{
  for(const text of ['<script>alert(1)</script>','<img src=x onerror="alert(1)">','[외부](https://example.com/)'])assert.throws(()=>applyReplacements(source,result('첫 문장입니다.',text)));
  assert.ok(applyReplacements(source,result('첫 문장입니다.','`<script>` 태그 예시입니다.')).source);
  assert.equal(normalizedHash(source),normalizedHash(source.replaceAll('\n','\r\n')));
  assert.throws(()=>inside('C:/safe','C:/other/file'));
});
test('필기 캡처는 문서·nonce·원문 버전과 실제 필기를 확인한다',()=>{
  const context={documentId:'d1',revision:1,url:'https://imjae.github.io/writing/example/',title:'글',sourceHash:null,currentSourceHash:'a'.repeat(64),visibleText:'원문',strokes:[{id:'s1',tool:'pen',color:'#315de8',width:3,points:[{x:1,y:1,pressure:.5}],anchor:null}],viewport:{x:0,y:0,width:100,height:100,scale:1}};
  const raw=JSON.stringify({channel:'sketch-review',nonce:'n1',context});
  assert.ok(parseCapture(raw,'n1',context.url));
  assert.equal(parseCapture(raw,'other',context.url),null);
  assert.equal(parseCapture(raw,'n1','https://evil.test/writing/example/'),null);
  assert.equal(parseCapture(raw.replace('"strokes":[','"strokes":[],"ignored":['),'n1',context.url),null);
  const script=transferScript({version:1,id:'x',capturedAt:'now',context:context as any,image:'x',instruction:'</script>'});
  assert.ok(script.includes("location.pathname === '/sketch/'"));assert.ok(!script.includes('</script>'));
});
