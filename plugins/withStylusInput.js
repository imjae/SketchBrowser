const { withMainActivity } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const START = '  // @generated SketchBrowser native stylus start';
const END = '  // @generated SketchBrowser native stylus end';
const METHODS = `${START}
  private val sketchStylusInput by lazy { SketchStylusInput(this) }

  override fun dispatchTouchEvent(event: android.view.MotionEvent): Boolean {
    if (sketchStylusInput.onTouch(event)) return true
    return super.dispatchTouchEvent(event)
  }

  override fun dispatchGenericMotionEvent(event: android.view.MotionEvent): Boolean {
    if (sketchStylusInput.onGenericMotion(event)) return true
    return super.dispatchGenericMotionEvent(event)
  }

  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (sketchStylusInput.onKey(event)) return true
    return super.dispatchKeyEvent(event)
  }

  override fun onPause() {
    sketchStylusInput.cancel()
    super.onPause()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (!hasFocus) sketchStylusInput.cancel()
  }
${END}`;

function patchMainActivity(source) {
  const previous = new RegExp(`${START}[\\s\\S]*?${END}\\r?\\n?`);
  const clean = source.replace(previous, '');
  const marker = /class MainActivity\s*:\s*ReactActivity\(\)\s*\{/;
  if (!marker.test(clean)) throw new Error('Unsupported Android MainActivity template');
  return clean.replace(marker, (match) => `${match}\n${METHODS}\n`);
}

function withStylusInput(config) {
  return withMainActivity(config, async (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('SketchBrowser stylus input requires Kotlin MainActivity');
    const packageName = mod.modResults.contents.match(/^package ([\w.]+)/m)?.[1];
    if (!packageName) throw new Error('Android application package missing');
    mod.modResults.contents = patchMainActivity(mod.modResults.contents);
    const template = await fs.readFile(path.join(__dirname, 'android', 'SketchStylusInput.kt'), 'utf8');
    await fs.writeFile(path.join(path.dirname(mod.modResults.path), 'SketchStylusInput.kt'),
      template.replace(/^package [\w.]+/m, `package ${packageName}`));
    return mod;
  });
}

module.exports = withStylusInput;
module.exports.patchMainActivity = patchMainActivity;
