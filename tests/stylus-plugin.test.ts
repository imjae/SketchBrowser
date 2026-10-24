import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { patchMainActivity } = require('../plugins/withStylusInput');

test('Android prebuild hook survives regeneration without duplicate lifecycle/input overrides', () => {
  const source = 'package test.app\nclass MainActivity : ReactActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {}\n}\n';
  const once = patchMainActivity(source);
  const twice = patchMainActivity(once);
  for (const method of ['dispatchTouchEvent', 'dispatchGenericMotionEvent', 'dispatchKeyEvent', 'onPause', 'onWindowFocusChanged']) {
    assert.equal(twice.split(`override fun ${method}(`).length - 1, 1);
  }
  assert.ok(twice.includes('override fun onCreate(savedInstanceState: Bundle?) {}'));
  assert.ok(twice.includes('if (sketchStylusInput.onTouch(event)) return true'));
  assert.throws(() => patchMainActivity('class Unexpected {}'), /Unsupported/);
});
