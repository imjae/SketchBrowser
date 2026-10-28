// Inserted in the ink engine's closure. Question outlines never enter strokes,
// undo/redo or the notebook bridge. Only the masked image leaves this closure.
export const QUESTION_SCRIPT = String.raw`
  var questionActive = null, questionSelection = null, questionHidden = false, questionVersion = 0;
  function questionViewport() {
    var v = window.visualViewport;
    return { x: scrollX, y: scrollY, w: v ? v.width : innerWidth, h: v ? v.height : innerHeight,
      ox: v ? v.offsetLeft : 0, oy: v ? v.offsetTop : 0, scale: v ? v.scale : 1,
      height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth,
      version: questionVersion, revision: revision, documentId: documentId };
  }
  function questionStable(a) { return JSON.stringify(a) === JSON.stringify(questionViewport()); }
  function questionMessage(notice) {
    var q = questionSelection;
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({channel:'sketch-question',documentId:documentId,
      selection:q ? {id:q.id,documentId:documentId,bounds:{x:q.box.x/q.view.w,y:q.box.y/q.view.h,width:q.box.width/q.view.w,height:q.box.height/q.view.h}} : null,
      notice:notice || ''}));
  }
  function questionClear(notice) {
    questionActive = null; questionSelection = null; questionMessage(notice); requestDraw();
  }
  function questionPoint(event) {
    var r = canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(r.width,event.clientX-r.left)),y:Math.max(0,Math.min(r.height,event.clientY-r.top))};
  }
  function questionDown(event) {
    questionSelection = null; questionMessage();
    questionActive = {pointerId:event.pointerId,points:[questionPoint(event)],view:questionViewport(),overflow:false};
    requestDraw();
  }
  function questionMove(event) {
    if (!questionActive || questionActive.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    var samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
    if (!samples.length) samples = [event];
    samples.forEach(function(e) {
      var p = questionPoint(e), list = questionActive.points, last = list[list.length-1];
      if (Math.hypot(p.x-last.x,p.y-last.y) < 1.5) return;
      if (list.length >= 2048) { questionActive.overflow = true; return; }
      list.push(p);
    });
    requestDraw();
  }
  function questionFinish(event, cancelled) {
    if (!questionActive || (event && questionActive.pointerId !== event.pointerId)) return;
    if (event && !cancelled) questionMove(event);
    var q = questionActive; questionActive = null;
    if (cancelled) { requestDraw(); return; }
    if (!questionStable(q.view)) { questionClear('화면이 바뀌었어요. 질문 영역을 다시 지정해 주세요.'); return; }
    var p = q.points, xs = p.map(function(v){return v.x;}), ys = p.map(function(v){return v.y;});
    var x = Math.min.apply(null,xs), y = Math.min.apply(null,ys), w = Math.max.apply(null,xs)-x, h = Math.max.apply(null,ys)-y;
    var area = 0;
    for(var i=0;i<p.length;i++){var a=p[i],b=p[(i+1)%p.length];area+=a.x*b.y-b.x*a.y;}
    var gap = Math.hypot(p[0].x-p[p.length-1].x,p[0].y-p[p.length-1].y);
    if(q.overflow || p.length<4 || w<32 || h<32 || Math.abs(area)/2<500 || gap>Math.max(28,Math.min(w,h)*.3)) {
      questionClear('질문할 내용을 펜으로 한 바퀴 둘러싸 주세요.'); return;
    }
    questionSelection = {id:newId(),points:p,box:{x:x,y:y,width:w,height:h},view:q.view};
    questionMessage(); requestDraw();
  }
  function questionPath(ctx, points, x, y, scaleX, scaleY) {
    ctx.beginPath();points.forEach(function(p,i){var px=(p.x-x)*scaleX,py=(p.y-y)*scaleY;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);});ctx.closePath();
  }
  function questionDraw() {
    if(questionSelection && !questionStable(questionSelection.view)) questionClear('화면이 바뀌었어요. 질문 영역을 다시 지정해 주세요.');
    if(questionHidden) return;
    var q=questionActive||questionSelection;if(!q)return;
    context.save();context.strokeStyle='#247b65';context.fillStyle='rgba(36,123,101,.12)';context.lineWidth=2;
    questionPath(context,q.points,0,0,1,1);
    if(!questionActive){context.fill('evenodd');context.setLineDash([6,4]);}
    context.stroke();context.restore();
  }
  function questionReply(nonce, value) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({channel:'sketch-question-capture',nonce:nonce},value)));
  }
  function questionRelease(nonce) {
    if(!captureLock || captureLock.kind!=='question' || captureLock.nonce!==nonce)return;
    captureLock=null;questionHidden=false;clearTimeout(captureTimer);requestDraw();
  }
  function questionCapture(command) {
    if(!/^[a-zA-Z0-9-]{1,100}$/.test(command.nonce))return;
    var q=questionSelection;
    if(!hydrated||captureLock||questionActive||!q||q.id!==command.selectionId||!questionStable(q.view)) {
      questionReply(command.nonce,{error:'질문 영역을 다시 지정해 주세요.'});return;
    }
    captureLock={kind:'question',nonce:command.nonce,selection:q};questionHidden=true;draw();
    clearTimeout(captureTimer);captureTimer=setTimeout(function(){questionRelease(command.nonce);},15000);
    questionReply(command.nonce,{ready:true});
  }
  async function questionMask(command) {
    var lock=captureLock;
    if(!lock||lock.kind!=='question'||lock.nonce!==command.nonce)return;
    if(typeof command.image!=='string'||command.image.length>12000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(command.image)) {
      questionReply(command.nonce,{error:'영역 이미지를 준비하지 못했어요.'});return;
    }
    var image;
    try {
        // Decode memory bytes directly: page img-src CSP can block data: URLs.
        var bytes=Uint8Array.from(atob(command.image),function(c){return c.charCodeAt(0);});
        image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
        if(captureLock!==lock)return;
        var q=lock.selection;
        if(!questionStable(q.view))throw new Error('캡처 중 화면이 바뀌었어요. 영역을 다시 지정해 주세요.');
        if(!image.width||!image.height||image.width*image.height>24000000||Math.abs((image.width/image.height)/(q.view.w/q.view.h)-1)>.02)throw new Error('화면 크기가 바뀌었어요. 영역을 다시 지정해 주세요.');
        var sx=image.width/q.view.w,sy=image.height/q.view.h,b=q.box,out=document.createElement('canvas');
        out.width=Math.ceil(b.width*sx);out.height=Math.ceil(b.height*sy);
        var c=out.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,out.width,out.height);c.save();
        questionPath(c,q.points,b.x,b.y,sx,sy);c.clip('evenodd');
        c.drawImage(image,-b.x*sx,-b.y*sy);c.restore();
        var result=out.toDataURL('image/png').split(',')[1];out.width=0;out.height=0;
        if(result.length>4000000)throw new Error('영역이 너무 커요. 더 작게 지정해 주세요.');
        questionReply(command.nonce,{image:result});
    } catch(e) {
      if(captureLock===lock)questionReply(command.nonce,{error:image ? e.message : '영역 이미지를 준비하지 못했어요.'});
    } finally {if(image)image.close();}
  }
`;
