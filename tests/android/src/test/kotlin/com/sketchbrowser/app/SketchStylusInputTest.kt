package com.sketchbrowser.app

import android.app.Activity
import android.graphics.Rect
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebView
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
// Use the Gradle-provided manifest and resources for native ID lookup.
@Config(sdk = [34])
class SketchStylusInputTest {
  private lateinit var view: RecordingWebView
  private lateinit var input: SketchStylusInput
  private var nativeIdTag = 0

  private class RecordingWebView(activity: Activity) : WebView(activity) {
    val packets = mutableListOf<JSONObject>()
    override fun evaluateJavascript(script: String, callback: ValueCallback<String>?) {
      packets.add(JSONObject(script.substringAfter(".nativeInput(").substringBeforeLast(");true;")))
    }
  }

  @Before fun setUp() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    view = RecordingWebView(activity)
    nativeIdTag = activity.resources.getIdentifier("view_tag_native_id", "id", activity.packageName)
    assertNotEquals(0, nativeIdTag)
    view.setTag(nativeIdTag, "sketch-ink-surface")
    // Give the simulated window a deterministic, attached WebView surface.
    // No Chromium renderer participates in these native input tests.
    val root = activity.window.decorView as ViewGroup
    root.removeAllViews()
    root.addView(view, ViewGroup.LayoutParams(1000, 900))
    root.measure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(900, View.MeasureSpec.EXACTLY))
    root.layout(0, 0, 1000, 900)
    view.left = 0; view.top = 0; view.right = 1000; view.bottom = 900
    input = SketchStylusInput(activity)
    assertTrue(view.isAttachedToWindow)
    assertEquals(1000, view.width)
    assertEquals(900, view.height)
  }

  private fun event(action: Int, x: Float = 150f, pressure: Float = 0.7f,
    buttons: Int = 0, tool: Int = MotionEvent.TOOL_TYPE_STYLUS): MotionEvent {
    val properties = MotionEvent.PointerProperties().apply { id = 0; toolType = tool }
    val coords = MotionEvent.PointerCoords().apply { this.x = x; y = 300f; this.pressure = pressure }
    return MotionEvent.obtain(0, 10, action, 1, arrayOf(properties), arrayOf(coords),
      0, buttons, 1f, 1f, 0, 0, InputDevice.SOURCE_STYLUS, 0)
  }

  private fun touch(action: Int, x: Float = 150f, buttons: Int = 0): Boolean {
    val event = event(action, x, buttons = buttons)
    return try { input.onTouch(event) } finally { event.recycle() }
  }

  private fun lastSample(): JSONObject = view.packets.last().getJSONArray("events").getJSONObject(0)

  @Test fun standardPenContactIsForwardedWithCoordinates() {
    assertTrue(touch(MotionEvent.ACTION_DOWN))
    assertTrue(view.packets.last().getBoolean("start"))
    assertEquals("down", lastSample().getString("type"))
    assertFalse(lastSample().getBoolean("pressed"))
    assertTrue(touch(MotionEvent.ACTION_MOVE, 220f))
    assertEquals("move", lastSample().getString("type"))
    assertEquals(70.0, lastSample().getDouble("x") - view.packets.first().getJSONArray("events").getJSONObject(0).getDouble("x"), 0.01)
    assertTrue(touch(MotionEvent.ACTION_UP))
    assertTrue(view.packets.last().getBoolean("end"))
  }

  @Test fun answerAndLoginWebViewsKeepNormalPenInput() {
    view.setTag(nativeIdTag, null)
    assertFalse(touch(MotionEvent.ACTION_DOWN))
    assertTrue(view.packets.isEmpty())
  }

  @Test fun markerOnDocumentWrapperAllowsInkButOverlayControlsBlockIt() {
    val root = view.parent as ViewGroup
    view.setTag(nativeIdTag, null)
    root.setTag(nativeIdTag, "sketch-ink-surface")
    assertTrue(touch(MotionEvent.ACTION_DOWN))
    assertTrue(touch(MotionEvent.ACTION_UP))
    val overlay = View(view.context)
    root.addView(overlay, ViewGroup.LayoutParams(200, 100))
    overlay.left = 100; overlay.top = 250; overlay.right = 300; overlay.bottom = 350
    val count = view.packets.size
    assertFalse(touch(MotionEvent.ACTION_DOWN))
    assertEquals(count, view.packets.size)
    // Keep the outside point inside the emulator's visible display. The
    // 1000px fixture layout can be clipped by its default display width.
    val visible = Rect()
    assertTrue(view.getGlobalVisibleRect(visible))
    assertTrue("Outside-overlay sample must remain on screen: $visible", visible.contains(50, 300))
    assertTrue(touch(MotionEvent.ACTION_DOWN, 50f))
  }

  @Test fun samsungButtonContactStartsMovesAndEndsAnEraseStream() {
    // Samsung sends 211/213/212 while the barrel is held, even with no prior
    // hover/button packet. These must reach the same path as standard touch.
    assertTrue("Samsung pen down must be captured", touch(211))
    val stream = view.packets.last().getLong("stream")
    assertTrue(view.packets.last().getBoolean("start"))
    assertEquals("down", lastSample().getString("type"))
    assertTrue(lastSample().getBoolean("pressed"))
    assertTrue(touch(213, 220f))
    assertEquals("move", lastSample().getString("type"))
    assertTrue(lastSample().getBoolean("pressed"))
    assertEquals(stream, view.packets.last().getLong("stream"))
    assertTrue(touch(212, 220f))
    assertEquals("up", lastSample().getString("type"))
    assertTrue(lastSample().getBoolean("pressed"))
    assertTrue(view.packets.last().getBoolean("end"))
    // A new normal contact after releasing the button draws again.
    assertTrue(touch(MotionEvent.ACTION_DOWN))
    assertFalse(lastSample().getBoolean("pressed"))
  }

  @Test fun samsungCancelEndsTheCapturedEraseStream() {
    assertTrue(touch(211))
    assertTrue(touch(214))
    assertEquals("cancel", lastSample().getString("type"))
    assertTrue(view.packets.last().getBoolean("end"))
    assertFalse(touch(213))
  }

  @Test fun samsungActionsDeliveredAsGenericMotionStillForwardContact() {
    for ((action, type) in listOf(211 to "down", 213 to "move", 212 to "up")) {
      val event = event(action)
      try { assertTrue(input.onGenericMotion(event)) } finally { event.recycle() }
      assertEquals(type, lastSample().getString("type"))
      assertTrue(lastSample().getBoolean("pressed"))
    }
    assertTrue(view.packets.last().getBoolean("end"))
  }

  @Test fun hoverOnlyChangesButtonStateAndFingerInputIsNotCaptured() {
    val hover = event(MotionEvent.ACTION_HOVER_MOVE, pressure = 0f, buttons = MotionEvent.BUTTON_STYLUS_PRIMARY)
    try { input.onGenericMotion(hover) } finally { hover.recycle() }
    assertFalse(view.packets.last().getBoolean("start"))
    assertFalse(view.packets.last().getBoolean("owned"))
    assertEquals("state", lastSample().getString("type"))
    assertTrue(lastSample().getBoolean("pressed"))
    val finger = event(MotionEvent.ACTION_DOWN, tool = MotionEvent.TOOL_TYPE_FINGER)
    try { assertFalse(input.onTouch(finger)) } finally { finger.recycle() }
  }
}
