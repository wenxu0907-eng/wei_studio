(function createBubbleUiLogic(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }
  root.BubbleUiLogic = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function bubbleUiLogicFactory() {
  function qwenStateLabel(hasSavedQwen, hasQwenKey) {
    if (hasSavedQwen) {
      return "已保存";
    }
    if (hasQwenKey) {
      return "待保存";
    }
    return "未配置";
  }

  function sourceActionDisabled(busy) {
    return Boolean(busy);
  }

  function scanActionDisabled(hasSavedQwen, hasSource, busy) {
    return !hasSavedQwen || !hasSource || Boolean(busy);
  }

  function rerunActionDisabled(hasSavedQwen, hasSource, hasQwenKey, busy) {
    return !hasSavedQwen || !hasSource || !hasQwenKey || Boolean(busy);
  }

  return {
    qwenStateLabel,
    sourceActionDisabled,
    scanActionDisabled,
    rerunActionDisabled
  };
}));
