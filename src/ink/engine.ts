// A self-contained script shared by the Android WebView and the local web preview.
// Keep it as source text: serializing a transpiled function can capture Babel helpers.
export const INK_SCRIPT = String.raw`
(function () {
  if (window.__sketchBrowserInk) return;
  var MAX_POINTS = 24000, MAX_STROKES = 600;
  var settings = { tool: 'browse', color: '#315de8', width: 3, penOnly: false };
  var strokes = [], undo = [], redo = [], active = null, erasedBefore = null;
  var hydrated = false, revision = 0, frame = 0, limited = false;
  var touchPoints = new Map(), touchNavigation = null, ignoreClicksUntil = 0;
  var penButtonDown = false, ignorePenContextUntil = 0;
  var documentId = newId(), lastRoute = route();
  var canvas = document.createElement('canvas');
  canvas.setAttribute('data-sketch-browser-ink', '');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;background:transparent;margin:0;padding:0;border:0;';
  document.documentElement.appendChild(canvas);
  var context = canvas.getContext('2d');

  function newId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 13); }
  function route() {
    var u = new URL(location.href);
    if (!u.hash.startsWith('#/') && !u.hash.startsWith('#!')) u.hash = '';
    return u.href;
  }
  function message(type) {
    var payload = { channel: 'sketch-browser', type: type, documentId: documentId,
      revision: revision, title: (document.title || location.hostname || '새 페이지').slice(0, 300),
      canUndo: undo.length > 0, canRedo: redo.length > 0 };
    if (type === 'change') payload.strokes = strokes;
    if (type === 'penButton') payload.pressed = penButtonDown;
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }
  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(function () { frame = 0; draw(); });
  }
  function normalText(element) { return (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80); }
  function selectorFor(element) {
    if (element.id && document.querySelectorAll('#' + CSS.escape(element.id)).length === 1) return '#' + CSS.escape(element.id);
    var path = [], current = element;
    while (current && current !== document.documentElement && path.length < 10) {
      var tag = current.tagName.toLowerCase(), nth = 1, previous = current.previousElementSibling;
      while (previous) { if (previous.tagName === current.tagName) nth++; previous = previous.previousElementSibling; }
      path.unshift(tag + ':nth-of-type(' + nth + ')');
      current = current.parentElement;
    }
    var selector = path.join(' > ');
    return document.querySelector(selector) === element ? selector : null;
  }
  function findAnchor(event) {
    canvas.style.pointerEvents = 'none';
    var element = document.elementFromPoint(event.clientX, event.clientY);
    canvas.style.pointerEvents = hydrated && (settings.tool !== 'browse' || penButtonDown) ? 'auto' : 'none';
    if (!element) return null;
    element = element.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,img,[id]') || element;
    if (element === document.body || element === document.documentElement || element === canvas) return null;
    var r = element.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    var selector = selectorFor(element);
    return selector ? { selector: selector, text: normalText(element), x: r.left + scrollX, y: r.top + scrollY, width: r.width } : null;
  }
  function transformFor(stroke, cache) {
    var anchor = stroke.anchor;
    if (!anchor) return null;
    if (cache.has(anchor.selector)) return cache.get(anchor.selector);
    var result = null;
    try {
      var element = document.querySelector(anchor.selector);
      if (element && normalText(element) === anchor.text) {
        var rect = element.getBoundingClientRect();
        if (rect.width > 0) result = { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width };
      }
    } catch (_) {}
    cache.set(anchor.selector, result);
    return result;
  }
  function positioned(point, stroke, transform) {
    if (!transform) return point;
    return { x: transform.x + (point.x - stroke.anchor.x) * transform.width / stroke.anchor.width,
      y: transform.y + point.y - stroke.anchor.y, pressure: point.pressure };
  }
  function drawStroke(stroke, rect, cache) {
    var t = transformFor(stroke, cache), points = stroke.points;
    if (!points.length) return;
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.lineCap = 'round'; context.lineJoin = 'round';
    context.globalAlpha = stroke.tool === 'highlighter' ? 0.3 : 1;
    var first = positioned(points[0], stroke, t);
    var width = stroke.width * (stroke.tool === 'highlighter' ? 6 : 1);
    if (points.length === 1) {
      context.beginPath(); context.arc(first.x - scrollX - rect.left, first.y - scrollY - rect.top, width / 2, 0, Math.PI * 2); context.fill();
    } else if (stroke.tool !== 'pen') {
      context.lineWidth = width;
      context.beginPath(); context.moveTo(first.x - scrollX - rect.left, first.y - scrollY - rect.top);
      for (var i = 1; i < points.length; i++) {
        var p = positioned(points[i], stroke, t);
        context.lineTo(p.x - scrollX - rect.left, p.y - scrollY - rect.top);
      }
      context.stroke();
    } else {
      for (var j = 1; j < points.length; j++) {
        var a = positioned(points[j - 1], stroke, t), b = positioned(points[j], stroke, t);
        context.lineWidth = width * (0.45 + (a.pressure + b.pressure) * 0.55);
        context.beginPath(); context.moveTo(a.x - scrollX - rect.left, a.y - scrollY - rect.top);
        context.lineTo(b.x - scrollX - rect.left, b.y - scrollY - rect.top); context.stroke();
      }
    }
    context.globalAlpha = 1;
  }
  function draw() {
    var viewport = window.visualViewport;
    var w = viewport ? viewport.width : innerWidth, h = viewport ? viewport.height : innerHeight;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.style.left = (viewport ? viewport.offsetLeft : 0) + 'px';
    canvas.style.top = (viewport ? viewport.offsetTop : 0) + 'px';
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    var pixelW = Math.ceil(w * dpr), pixelH = Math.ceil(h * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) { canvas.width = pixelW; canvas.height = pixelH; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, w, h);
    var rect = canvas.getBoundingClientRect(), cache = new Map();
    for (var i = 0; i < strokes.length; i++) drawStroke(strokes[i], rect, cache);
    if (active) drawStroke(active.stroke, rect, cache);
  }
  function point(event) {
    return { x: Math.round((event.clientX + scrollX) * 10) / 10,
      y: Math.round((event.clientY + scrollY) * 10) / 10,
      pressure: event.pointerType === 'pen' && event.pressure > 0 ? Math.round(event.pressure * 100) / 100 : 0.5 };
  }
  function remember(before) { undo.push(before); if (undo.length > 50) undo.shift(); redo = []; }
  function commit(before) { remember(before); revision++; message('change'); requestDraw(); }
  function pointCount() { var n = 0; for (var i = 0; i < strokes.length; i++) n += strokes[i].points.length; return n; }
  function distanceToSegment(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    var t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function eraseAt(p) {
    var cache = new Map();
    strokes = strokes.filter(function (s) {
      var t = transformFor(s, cache), previous = positioned(s.points[0], s, t);
      var radius = 12 + s.width * (s.tool === 'highlighter' ? 3 : 0.5);
      if (distanceToSegment(p, previous, previous) <= radius) return false;
      for (var i = 1; i < s.points.length; i++) {
        var current = positioned(s.points[i], s, t);
        if (distanceToSegment(p, previous, current) <= radius) return false;
        previous = current;
      }
      return true;
    });
    requestDraw();
  }
  function eraseAlong(event) {
    var p = point(event), previous = erasedBefore.last;
    var steps = Math.min(200, Math.max(1, Math.ceil(Math.hypot(p.x - previous.x, p.y - previous.y) / 6)));
    for (var step = 1; step <= steps; step++) eraseAt({ x: previous.x + (p.x - previous.x) * step / steps, y: previous.y + (p.y - previous.y) * step / steps });
    erasedBefore.last = p;
  }
  function pointerDown(event) {
    var tool = event.pointerType === 'pen' && penButtonDown ? 'eraser' : settings.tool;
    if (!hydrated || tool === 'browse' || touchNavigation || active || erasedBefore || !event.isPrimary ||
      (event.pointerType === 'mouse' && event.button !== 0) || (settings.penOnly && event.pointerType !== 'pen')) return;
    event.preventDefault(); event.stopPropagation();
    canvas.setPointerCapture(event.pointerId);
    limited = false;
    if (tool === 'eraser') { erasedBefore = { strokes: strokes, pointerId: event.pointerId, last: point(event) }; eraseAt(point(event)); return; }
    var count = pointCount();
    if (strokes.length >= MAX_STROKES || count >= MAX_POINTS - 2) { message('limit'); return; }
    active = { pointerId: event.pointerId, budget: Math.min(MAX_POINTS - count, 6000), stroke: {
      id: newId(), tool: tool, color: settings.color, width: settings.width,
      points: [point(event)], anchor: findAnchor(event)
    } };
    requestDraw();
  }
  function pointerMove(event) {
    if (erasedBefore && erasedBefore.pointerId === event.pointerId) { event.preventDefault(); eraseAlong(event); return; }
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    var list = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
    if (!list.length) list = [event];
    for (var i = 0; i < list.length; i++) {
      var p = point(list[i]), points = active.stroke.points, last = points[points.length - 1];
      if (active.stroke.tool === 'underline') {
        p.y = points[0].y;
        if (points.length === 1) points.push(p); else points[1] = p;
      } else if (Math.hypot(p.x - last.x, p.y - last.y) >= 0.7) {
        if (points.length < active.budget) points.push(p); else limited = true;
      }
    }
    requestDraw();
  }
  function finish(event, cancelled) {
    if (active && (!event || active.pointerId === event.pointerId)) {
      if (event && !cancelled) pointerMove(event);
      var stroke = active.stroke; active = null;
      if (!cancelled) { var before = strokes; strokes = strokes.concat([stroke]); commit(before); if (limited) message('limit'); }
      else requestDraw();
    }
    if (erasedBefore && (!event || erasedBefore.pointerId === event.pointerId)) {
      var original = erasedBefore.strokes; erasedBefore = null;
      if (cancelled) { strokes = original; requestDraw(); }
      else if (original.length !== strokes.length) commit(original);
    }
  }
  function touchPosition(event) { return { x: event.clientX, y: event.clientY }; }
  function setPenButton(pressed, cancelled) {
    if (penButtonDown === pressed) return;
    finish(null, !!cancelled);
    penButtonDown = pressed; updateInput(); message('penButton');
  }
  function trackPenButton(event) {
    if (event.pointerType !== 'pen' || !hydrated) return;
    var cancelled = event.type === 'pointercancel' || event.type === 'lostpointercapture';
    var ended = cancelled || event.type === 'pointerup';
    var wasDown = penButtonDown;
    // Pointer Events: barrel = 2, eraser tip = 32. Check every move too:
    // pressing/releasing a barrel button during tip contact is a chorded move.
    var pressed = !ended && !!(event.buttons & (2 | 32));
    var contact = !ended && (!!(event.buttons & (1 | 32)) || event.pressure > 0);
    setPenButton(pressed, cancelled);
    if (!pressed && !wasDown) return;
    event.preventDefault(); event.stopPropagation();
    ignorePenContextUntil = Date.now() + 350;
    if (pressed && event.type === 'pointerdown') canvas.setPointerCapture(event.pointerId);
    if (!contact) finish(null, cancelled);
    else if (!active && !erasedBefore) pointerDown(event);
    else pointerMove(event);
  }
  function belowCanvas(x, y) {
    var previous = canvas.style.pointerEvents;
    canvas.style.pointerEvents = 'none';
    var element = document.elementFromPoint(x, y);
    canvas.style.pointerEvents = previous;
    return element;
  }
  function beginTouchNavigation() {
    var ids = Array.from(touchPoints.keys()), a = touchPoints.get(ids[0]), b = touchPoints.get(ids[1]);
    var center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var previous = touchNavigation;
    // A second finger cancels unfinished ink/erasing; it never saves a stray mark.
    finish(null, true);
    touchNavigation = { ids: ids, a: a, b: b, last: center, active: !!(previous && previous.active),
      target: previous ? previous.target : belowCanvas(center.x, center.y) };
  }
  function panContent(target, dx, dy) {
    var remainingX = -dx, remainingY = -dy, element = target;
    while (element && element !== document.body && element !== document.documentElement) {
      var style = getComputedStyle(element), x = element.scrollLeft, y = element.scrollTop;
      var scrollXEnabled = /auto|scroll|overlay/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
      var scrollYEnabled = /auto|scroll|overlay/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
      if (scrollXEnabled || scrollYEnabled) {
        element.scrollTo({ left: x + (scrollXEnabled ? remainingX : 0), top: y + (scrollYEnabled ? remainingY : 0), behavior: 'instant' });
        remainingX -= element.scrollLeft - x; remainingY -= element.scrollTop - y;
      }
      element = element.parentElement;
    }
    if (remainingX || remainingY) window.scrollBy({ left: remainingX, top: remainingY, behavior: 'instant' });
    requestDraw();
  }
  function trackTouchDown(event) {
    if (event.pointerType !== 'touch' || !hydrated || (settings.tool === 'browse' && !penButtonDown && !touchNavigation)) return;
    touchPoints.set(event.pointerId, touchPosition(event));
    if (touchPoints.size === 2) beginTouchNavigation();
    if (touchNavigation) { event.preventDefault(); event.stopPropagation(); }
  }
  function trackTouchMove(event) {
    if (event.pointerType !== 'touch' || !touchPoints.has(event.pointerId)) return;
    touchPoints.set(event.pointerId, touchPosition(event));
    if (!touchNavigation) return;
    event.preventDefault(); event.stopPropagation();
    if (touchPoints.size !== 2) return;
    var gesture = touchNavigation, a = touchPoints.get(gesture.ids[0]), b = touchPoints.get(gesture.ids[1]);
    if (!a || !b) return;
    var center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!gesture.active) {
      var ax = a.x - gesture.a.x, ay = a.y - gesture.a.y, bx = b.x - gesture.b.x, by = b.y - gesture.b.y;
      var distanceA = Math.hypot(ax, ay), distanceB = Math.hypot(bx, by);
      // Require both fingers to move together: taps, pinches and a resting palm
      // should not change the selected drawing tool.
      if (distanceA < 8 || distanceB < 8 || (ax * bx + ay * by) / (distanceA * distanceB) < 0.75) return;
      gesture.active = true;
      settings = { tool: 'browse', color: settings.color, width: settings.width, penOnly: settings.penOnly };
      updateInput(); message('browse');
    }
    // touch-action is fixed when contact begins. Pan this already-active gesture
    // ourselves, then let the browser handle subsequent gestures in browse mode.
    panContent(gesture.target, center.x - gesture.last.x, center.y - gesture.last.y);
    gesture.last = center; ignoreClicksUntil = Date.now() + 350;
  }
  function trackTouchEnd(event) {
    if (event.pointerType !== 'touch') return;
    touchPoints.delete(event.pointerId);
    if (!touchNavigation) return;
    event.stopPropagation();
    if (touchNavigation.active) ignoreClicksUntil = Date.now() + 350;
    if (!touchPoints.size) touchNavigation = null;
    else if (touchPoints.size === 2) beginTouchNavigation();
  }
  function resetTouchNavigation() { touchPoints.clear(); touchNavigation = null; }
  document.addEventListener('pointerdown', trackTouchDown, { capture: true, passive: false });
  document.addEventListener('pointermove', trackTouchMove, { capture: true, passive: false });
  document.addEventListener('pointerup', trackTouchEnd, true);
  document.addEventListener('pointercancel', trackTouchEnd, true);
  document.addEventListener('pointerdown', trackPenButton, { capture: true, passive: false });
  document.addEventListener('pointermove', trackPenButton, { capture: true, passive: false });
  document.addEventListener('pointerup', trackPenButton, { capture: true, passive: false });
  document.addEventListener('pointercancel', trackPenButton, { capture: true, passive: false });
  document.addEventListener('lostpointercapture', trackPenButton, true);
  document.addEventListener('contextmenu', function (e) {
    if (penButtonDown || Date.now() < ignorePenContextUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('click', function (e) {
    if (Date.now() < ignoreClicksUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', function (e) { finish(e, false); });
  canvas.addEventListener('pointercancel', function (e) { finish(e, true); });
  canvas.addEventListener('lostpointercapture', function (e) { finish(e, true); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { finish(null, false); setPenButton(false, false); resetTouchNavigation(); } });
  window.addEventListener('pagehide', function () { finish(null, false); setPenButton(false, false); resetTouchNavigation(); });
  window.addEventListener('blur', function () { if (penButtonDown) setPenButton(false, false); });
  function updateInput() {
    canvas.style.pointerEvents = hydrated && (settings.tool !== 'browse' || penButtonDown) ? 'auto' : 'none';
    canvas.style.cursor = settings.tool === 'eraser' || penButtonDown ? 'cell' : 'crosshair';
  }
  function receive(command, expectedId) {
    if (expectedId && expectedId !== documentId) return;
    switch (command.type) {
      case 'restore':
        if (hydrated) return;
        strokes = command.strokes; hydrated = true; undo = []; redo = [];
        updateInput(); requestDraw(); message('state'); break;
      case 'settings':
        finish(null, false); settings = command.settings; updateInput(); break;
      case 'undo':
        if (!hydrated) return;
        finish(null, false);
        if (undo.length) { redo.push(strokes); strokes = undo.pop(); revision++; message('change'); requestDraw(); } break;
      case 'redo':
        if (!hydrated) return;
        finish(null, false);
        if (redo.length) { undo.push(strokes); strokes = redo.pop(); revision++; message('change'); requestDraw(); } break;
      case 'flush': finish(null, false); setPenButton(false, false); break;
    }
  }
  window.__sketchBrowserInk = { receive: receive };
  function onRoute() {
    var next = route();
    if (next === lastRoute) return;
    lastRoute = next; active = null; erasedBefore = null; setPenButton(false, true); resetTouchNavigation();
    strokes = []; undo = []; redo = []; hydrated = false; revision = 0; documentId = newId();
    updateInput(); requestDraw(); message('ready');
  }
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () { var result = original.apply(this, arguments); onRoute(); return result; };
  });
  window.addEventListener('popstate', onRoute); window.addEventListener('hashchange', onRoute);
  // A restored WebView document retains its ink and bridge; it must re-handshake.
  window.addEventListener('pageshow', function (e) { if (e.persisted) { documentId = newId(); hydrated = false; updateInput(); message('ready'); } });
  window.addEventListener('scroll', requestDraw, { passive: true, capture: true });
  window.addEventListener('resize', requestDraw);
  if (window.visualViewport) { visualViewport.addEventListener('resize', requestDraw); visualViewport.addEventListener('scroll', requestDraw); }
  if (window.ResizeObserver) new ResizeObserver(requestDraw).observe(document.body);
  if (window.MutationObserver) new MutationObserver(requestDraw).observe(document.body, { childList: true, subtree: true, characterData: true });
  draw(); message('ready');
})(); true;
`;

export function commandScript(command: object, documentId?: string): string {
  return `window.__sketchBrowserInk && window.__sketchBrowserInk.receive(${JSON.stringify(command)}, ${JSON.stringify(documentId ?? null)}); true;`;
}
