const test = require("node:test");
const assert = require("node:assert/strict");
const {
  qwenStateLabel,
  sourceActionDisabled,
  scanActionDisabled,
  rerunActionDisabled
} = require("../ui_logic.js");

test("source actions stay clickable when API settings are not saved", () => {
  assert.equal(sourceActionDisabled(false), false);
  assert.equal(sourceActionDisabled(true), true);
});

test("qwen state label distinguishes unsaved and saved settings", () => {
  assert.equal(qwenStateLabel(false, false), "未配置");
  assert.equal(qwenStateLabel(false, true), "待保存");
  assert.equal(qwenStateLabel(true, true), "已保存");
});

test("first-pass scan stays gated until source and saved API settings exist", () => {
  assert.equal(scanActionDisabled(false, false, false), true);
  assert.equal(scanActionDisabled(true, false, false), true);
  assert.equal(scanActionDisabled(true, true, false), false);
  assert.equal(scanActionDisabled(true, true, true), true);
});

test("rerun stays gated until source, saved settings, and current key exist", () => {
  assert.equal(rerunActionDisabled(true, true, true, false), false);
  assert.equal(rerunActionDisabled(false, true, true, false), true);
  assert.equal(rerunActionDisabled(true, false, true, false), true);
  assert.equal(rerunActionDisabled(true, true, false, false), true);
  assert.equal(rerunActionDisabled(true, true, true, true), true);
});
