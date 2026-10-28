package com.sketchbrowser.app

import android.app.Activity
import android.graphics.Rect
import android.os.Build
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject

/**
 * Capture stylus strokes before Chromium's StylusTextSelector can consume the
 * barrel-button stream. Finger-only gestures and native app controls keep their
 * normal Android input path. Mixed touches in an owned stroke travel together.
 */
class SketchStylusInput(private val activity: Activity) {
  // Native IDs are React Native tags on the wrapper, not Android view IDs.
  // Only the document surface owns ink. The floating answer/login WebView
  // must keep normal pen clicks, scrolling and text selection.
  private val nativeIdTag = activity.resources.getIdentifier("view_tag_native_id", "id", activity.packageName)
  private companion object {
    // Samsung's button-held touch actions, also normalized by Chromium's
    // SPenSupport before WebView handles them.
    const val SPEN_ACTION_DOWN = 211
    const val SPEN_ACTION_UP = 212
    const val SPEN_ACTION_MOVE = 213
    const val SPEN_ACTION_CANCEL = 214
  }

  private var captured: WebView? = null
  private var lastView: WebView? = null
  private var streamId = 0L
  private var keyHeld = false
  private var motionButtonsHeld = 0
  private val penButtonMask = MotionEvent.BUTTON_STYLUS_PRIMARY or
    MotionEvent.BUTTON_STYLUS_SECONDARY or MotionEvent.BUTTON_SECONDARY
  private var lastPen: JSONObject? = null
  private val location = IntArray(2)

  private fun isPen(event: MotionEvent, index: Int): Boolean =
    event.getToolType(index) == MotionEvent.TOOL_TYPE_STYLUS ||
      event.getToolType(index) == MotionEvent.TOOL_TYPE_ERASER

  private fun isSamsungButtonAction(action: Int): Boolean =
    action in SPEN_ACTION_DOWN..SPEN_ACTION_CANCEL

  private fun touchAction(action: Int): Int = when (action) {
    SPEN_ACTION_DOWN -> MotionEvent.ACTION_DOWN
    SPEN_ACTION_UP -> MotionEvent.ACTION_UP
    SPEN_ACTION_MOVE -> MotionEvent.ACTION_MOVE
    SPEN_ACTION_CANCEL -> MotionEvent.ACTION_CANCEL
    else -> action
  }

  // Resolve the topmost view, not just a WebView bounding box: the library
  // drawer, address bar and fullscreen exit button must remain usable by pen.
  private fun hit(view: View, x: Int, y: Int): View? {
    if (view.visibility != View.VISIBLE || !view.isShown || view.alpha <= 0f) return null
    val bounds = Rect()
    if (!view.getGlobalVisibleRect(bounds) || !bounds.contains(x, y)) return null
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (index in view.childCount - 1 downTo 0) {
        val child = hit(view.getChildAt(index), x, y)
        if (child != null) return child
      }
    }
    return view
  }

  private fun target(event: MotionEvent, index: Int): WebView? {
    val root = activity.window.decorView
    root.getLocationOnScreen(location)
    // Global visible rectangles use root coordinates, while raw MotionEvent
    // positions use screen coordinates (different in split-screen windows).
    val x = event.rawX - event.x + event.getX(index) - location[0]
    val y = event.rawY - event.y + event.getY(index) - location[1]
    val view = hit(root, x.toInt(), y.toInt()) as? WebView ?: return null
    if (nativeIdTag == 0) return null
    var ancestor: View? = view
    while (ancestor != null) {
      if (ancestor.getTag(nativeIdTag) == "sketch-ink-surface") return view
      ancestor = ancestor.parent as? View
    }
    return null
  }

  private fun sample(view: WebView, event: MotionEvent, index: Int, type: String, history: Int = -1): JSONObject {
    view.getLocationOnScreen(location)
    val x = if (history < 0) event.getX(index) else event.getHistoricalX(index, history)
    val y = if (history < 0) event.getY(index) else event.getHistoricalY(index, history)
    val pressure = if (history < 0) event.getPressure(index) else event.getHistoricalPressure(index, history)
    val eraser = event.getToolType(index) == MotionEvent.TOOL_TYPE_ERASER
    val held = keyHeld || motionButtonsHeld != 0 || eraser ||
      isSamsungButtonAction(event.actionMasked) || (event.buttonState and penButtonMask) != 0
    return JSONObject()
      .put("kind", if (isPen(event, index)) "pen" else "touch")
      .put("id", event.getPointerId(index)).put("type", type)
      .put("x", event.rawX - event.x + x - location[0])
      .put("y", event.rawY - event.y + y - location[1])
      .put("pressure", pressure.coerceIn(0f, 1f).toDouble())
      .put("pressed", held)
  }

  private fun send(view: WebView, events: JSONArray, start: Boolean = false, end: Boolean = false, reset: Boolean = false) {
    if (!view.isAttachedToWindow || view.width <= 0 || view.height <= 0) return
    val packet = JSONObject().put("stream", streamId).put("owned", captured === view)
      .put("width", view.width).put("height", view.height)
      .put("start", start).put("end", end).put("reset", reset).put("events", events)
    view.evaluateJavascript("window.__sketchBrowserInk && window.__sketchBrowserInk.nativeInput($packet);true;", null)
  }

  fun onTouch(event: MotionEvent): Boolean {
    val action = touchAction(event.actionMasked)
    if (action == MotionEvent.ACTION_DOWN) {
      if (captured != null) cancel()
      if (!isPen(event, event.actionIndex)) return false
      captured = target(event, event.actionIndex) ?: return false
      lastView = captured
      streamId++
    }
    val view = captured ?: return false
    val events = JSONArray()
    val cancelled = action == MotionEvent.ACTION_CANCEL ||
      (Build.VERSION.SDK_INT >= 33 && (event.flags and MotionEvent.FLAG_CANCELED) != 0)
    when (action) {
      MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN ->
        events.put(sample(view, event, event.actionIndex, "down"))
      MotionEvent.ACTION_MOVE -> {
        // Preserve batched pressure/coordinates without a JavaScript call for
        // every historical sample; one packet is dispatched per MotionEvent.
        for (history in maxOf(0, event.historySize - 8) until event.historySize) {
          for (index in 0 until event.pointerCount) {
            if (isPen(event, index)) events.put(sample(view, event, index, "move", history))
          }
        }
        for (index in 0 until event.pointerCount) events.put(sample(view, event, index, "move"))
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP ->
        events.put(sample(view, event, event.actionIndex, if (cancelled) "cancel" else "up"))
      MotionEvent.ACTION_CANCEL ->
        for (index in 0 until event.pointerCount) events.put(sample(view, event, index, "cancel"))
    }
    for (index in 0 until events.length()) {
      val item = events.getJSONObject(index)
      if (item.getString("kind") == "pen") lastPen = JSONObject(item.toString())
    }
    val end = action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL
    send(view, events, start = action == MotionEvent.ACTION_DOWN, end = end)
    if (end) captured = null
    return true
  }

  fun onGenericMotion(event: MotionEvent): Boolean {
    val index = (0 until event.pointerCount).firstOrNull { isPen(event, it) } ?: return false
    // Some Samsung dispatch paths classify their custom actions as generic
    // motion. They still represent contact, not hover/button-only state.
    if (isSamsungButtonAction(event.actionMasked)) return onTouch(event)
    // Explicit button events remain authoritative when a hover/contact
    // transition omits buttonState. Only the matching release clears them.
    val button = event.actionButton and penButtonMask
    when (event.actionMasked) {
      MotionEvent.ACTION_BUTTON_PRESS -> motionButtonsHeld = motionButtonsHeld or button
      MotionEvent.ACTION_BUTTON_RELEASE -> motionButtonsHeld = motionButtonsHeld and button.inv()
    }
    val view = captured ?: target(event, index)
      ?: lastView?.takeIf { event.actionMasked == MotionEvent.ACTION_BUTTON_RELEASE } ?: return false
    lastView = view
    val item = sample(view, event, index, if (event.actionMasked == MotionEvent.ACTION_HOVER_EXIT) "leave" else "state")
    lastPen = JSONObject(item.toString())
    send(view, JSONArray().put(item))
    return event.actionMasked == MotionEvent.ACTION_BUTTON_PRESS || event.actionMasked == MotionEvent.ACTION_BUTTON_RELEASE
  }

  fun onKey(event: KeyEvent): Boolean {
    if (Build.VERSION.SDK_INT < 34 || event.keyCode !in setOf(
        KeyEvent.KEYCODE_STYLUS_BUTTON_PRIMARY, KeyEvent.KEYCODE_STYLUS_BUTTON_SECONDARY)) return false
    val view = captured ?: lastView ?: return false
    keyHeld = event.action == KeyEvent.ACTION_DOWN
    val item = lastPen?.let { JSONObject(it.toString()) } ?: JSONObject()
      .put("kind", "pen").put("id", 0).put("x", 0).put("y", 0).put("pressure", 0)
    item.put("type", "state").put("pressed", keyHeld)
    send(view, JSONArray().put(item))
    return true
  }

  fun cancel() {
    val view = captured ?: lastView
    if (view != null) send(view, JSONArray(), end = true, reset = true)
    captured = null
    lastView = null
    lastPen = null
    keyHeld = false
    motionButtonsHeld = 0
  }
}
