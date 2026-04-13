const SAMPLE_FILE = "3910992永利版.pdf";
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const OCR_LANG = "eng";
const STORAGE_KEY = "bubble-drawing-studio-project-v1";
const QWEN_SETTINGS_KEY = "bubble-drawing-studio-qwen-settings-v1";
const ACCESS_CODE_STORAGE_KEY = "bubble-drawing-studio-access-v1";
const ACCESS_CODE_HASH = "c92bdf7fa984812a3e07f29b3ecf342f2ea5187b3601044b41d4e68cf6dafdac";
const UiLogic = window.BubbleUiLogic || {
  qwenStateLabel(hasSavedQwen, hasQwenKey) {
    if (hasSavedQwen) {
      return "已保存";
    }
    if (hasQwenKey) {
      return "待保存";
    }
    return "未配置";
  },
  sourceActionDisabled(busy) {
    return Boolean(busy);
  },
  scanActionDisabled(hasSavedQwen, hasSource, busy) {
    return !hasSavedQwen || !hasSource || Boolean(busy);
  },
  rerunActionDisabled(hasSavedQwen, hasSource, hasQwenKey, busy) {
    return !hasSavedQwen || !hasSource || !hasQwenKey || Boolean(busy);
  }
};

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
}

const state = {
  source: null,
  sourceAsset: null,
  pdfDoc: null,
  pdfBytes: null,
  imageBitmap: null,
  pageCount: 0,
  currentPage: 1,
  zoom: "fit",
  canvasWidth: 0,
  canvasHeight: 0,
  annotations: [],
  scanSnapshot: [],
  activeId: null,
  dragging: null,
  busy: false,
  showBoxes: true,
  filterText: "",
  reanchorMode: false,
  addMode: false,
  unsavedChanges: false,
  sheetAnalysis: null,
  screenshots: null
};

const els = {
  dropzone: document.getElementById("dropzone"),
  accessGate: document.getElementById("access-gate"),
  accessCodeInput: document.getElementById("access-code-input"),
  unlockBtn: document.getElementById("unlock-btn"),
  accessFeedback: document.getElementById("access-feedback"),
  appShell: document.getElementById("app-shell"),
  fileInput: document.getElementById("file-input"),
  uploadBtn: document.getElementById("upload-btn"),
  loadSampleBtn: document.getElementById("load-sample-btn"),
  sourceKind: document.getElementById("source-kind"),
  scanState: document.getElementById("scan-state"),
  pageSelect: document.getElementById("page-select"),
  zoomSelect: document.getElementById("zoom-select"),
  zoomOutBtn: document.getElementById("zoom-out-btn"),
  zoomFitBtn: document.getElementById("zoom-fit-btn"),
  zoom100Btn: document.getElementById("zoom-100-btn"),
  zoomInBtn: document.getElementById("zoom-in-btn"),
  fullscreenBtn: document.getElementById("fullscreen-btn"),
  scanBtn: document.getElementById("scan-btn"),
  resetBtn: document.getElementById("reset-btn"),
  localFallbackBtn: document.getElementById("local-fallback-btn"),
  toggleBoxesBtn: document.getElementById("toggle-boxes-btn"),
  renumberBtn: document.getElementById("renumber-btn"),
  progressFill: document.getElementById("progress-fill"),
  progressCopy: document.getElementById("progress-copy"),
  busyOverlay: document.getElementById("busy-overlay"),
  busyTitle: document.getElementById("busy-title"),
  busyDetail: document.getElementById("busy-detail"),
  bubbleLabel: document.getElementById("bubble-label"),
  bubbleValue: document.getElementById("bubble-value"),
  bubbleNote: document.getElementById("bubble-note"),
  bubbleConfidence: document.getElementById("bubble-confidence"),
  addBubbleBtn: document.getElementById("add-bubble-btn"),
  reanchorBtn: document.getElementById("reanchor-btn"),
  deleteBubbleBtn: document.getElementById("delete-bubble-btn"),
  saveProjectBtn: document.getElementById("save-project-btn"),
  restoreProjectBtn: document.getElementById("restore-project-btn"),
  exportJsonBtn: document.getElementById("export-json-btn"),
  importJsonInput: document.getElementById("import-json-input"),
  exportCsvBtn: document.getElementById("export-csv-btn"),
  exportXlsxBtn: document.getElementById("export-xlsx-btn"),
  qwenState: document.getElementById("qwen-state"),
  qwenApiKey: document.getElementById("qwen-api-key"),
  qwenModel: document.getElementById("qwen-model"),
  qwenBaseUrl: document.getElementById("qwen-base-url"),
  qwenExtraHeaders: document.getElementById("qwen-extra-headers"),
  qwenFirstSystemPrompt: document.getElementById("qwen-first-system-prompt"),
  qwenFirstUserPrompt: document.getElementById("qwen-first-user-prompt"),
  qwenReviewSystemPrompt: document.getElementById("qwen-review-system-prompt"),
  qwenReviewUserPrompt: document.getElementById("qwen-review-user-prompt"),
  runQwenBtn: document.getElementById("run-qwen-btn"),
  saveQwenBtn: document.getElementById("save-qwen-btn"),
  resetPromptsBtn: document.getElementById("reset-prompts-btn"),
  statusCard: document.getElementById("status-card"),
  filePill: document.getElementById("file-pill"),
  pagePill: document.getElementById("page-pill"),
  savePill: document.getElementById("save-pill"),
  filterInput: document.getElementById("filter-input"),
  statBubbles: document.getElementById("stat-bubbles"),
  statDetections: document.getElementById("stat-detections"),
  statPages: document.getElementById("stat-pages"),
  viewerShell: document.getElementById("viewer-shell"),
  viewerPanel: document.querySelector(".viewer-panel"),
  surfaceSizer: document.getElementById("surface-sizer"),
  surface: document.getElementById("surface"),
  surfaceOverlay: document.getElementById("surface-overlay"),
  annotationLayer: document.getElementById("annotation-layer"),
  canvas: document.getElementById("sheet-canvas"),
  canvasEmpty: document.getElementById("canvas-empty"),
  resultsTable: document.getElementById("results-table"),
  resultsBody: document.getElementById("results-body"),
  tableEmpty: document.getElementById("table-empty"),
  selectionState: document.getElementById("selection-state")
};

const ctx = els.canvas.getContext("2d");

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback for insecure contexts (plain HTTP) where crypto.subtle is unavailable
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const len=bytes.length,bitLen=len*8;
  const padded=new Uint8Array(((len+9+63)&~63));
  padded.set(bytes);padded[len]=0x80;
  const dv=new DataView(padded.buffer);
  dv.setUint32(padded.length-4,bitLen,false);
  for(let off=0;off<padded.length;off+=64){
    const w=new Int32Array(64);
    for(let i=0;i<16;i++)w[i]=dv.getInt32(off+i*4,false);
    for(let i=16;i<64;i++){const s0=((w[i-15]>>>7|w[i-15]<<25)^(w[i-15]>>>18|w[i-15]<<14)^(w[i-15]>>>3)),s1=((w[i-2]>>>17|w[i-2]<<15)^(w[i-2]>>>19|w[i-2]<<13)^(w[i-2]>>>10));w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for(let i=0;i<64;i++){const S1=((e>>>6|e<<26)^(e>>>11|e<<21)^(e>>>25|e<<7)),ch=(e&f)^(~e&g),t1=(h+S1+ch+k[i]+w[i])|0,S0=((a>>>2|a<<30)^(a>>>13|a<<19)^(a>>>22|a<<10)),maj=(a&b)^(a&c)^(b&c),t2=(S0+maj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(v=>(v>>>0).toString(16).padStart(8,"0")).join("");
}

function accessUnlocked() {
  return localStorage.getItem(ACCESS_CODE_STORAGE_KEY) === ACCESS_CODE_HASH;
}

function showAccessFeedback(message, isError = false) {
  els.accessFeedback.textContent = message;
  els.accessFeedback.classList.toggle("error", isError);
}

function setAccessState(unlocked) {
  els.accessGate.hidden = unlocked;
  els.appShell.hidden = !unlocked;
  els.accessGate.style.display = unlocked ? "none" : "grid";
  els.appShell.style.display = unlocked ? "grid" : "none";
}

async function unlockPage() {
  const code = sanitize(els.accessCodeInput.value);
  if (!code) {
    showAccessFeedback("请输入访问码。", true);
    return;
  }

  els.unlockBtn.disabled = true;
  showAccessFeedback("正在校验访问码...");
  try {
    const digest = await sha256Hex(code);
    if (digest !== ACCESS_CODE_HASH) {
      showAccessFeedback("访问码不正确，请重试。", true);
      return;
    }
    localStorage.setItem(ACCESS_CODE_STORAGE_KEY, digest);
    els.accessCodeInput.value = "";
    showAccessFeedback("访问已通过，正在进入页面。");
    setTimeout(() => window.location.reload(), 120);
  } finally {
    els.unlockBtn.disabled = false;
  }
}

function setStatus(message) {
  els.statusCard.textContent = message;
  if (state.busy) {
    els.busyDetail.textContent = message;
  }
}

function setProgress(label, percent) {
  els.progressCopy.textContent = label;
  els.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  els.scanState.textContent = label;
  if (state.busy) {
    els.busyTitle.textContent = label;
  }
}

function sanitize(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[Oo](?=\d)/g, "0")
    .trim();
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("无法读取文件"));
    reader.readAsDataURL(blob);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function markDirty() {
  state.unsavedChanges = true;
  updateControls();
}

function markSaved() {
  state.unsavedChanges = false;
  updateControls();
}

function setBusy(isBusy) {
  state.busy = isBusy;
  els.busyOverlay.hidden = !isBusy;
  els.busyOverlay.style.display = isBusy ? "grid" : "none";
  if (isBusy) {
    els.busyTitle.textContent = els.progressCopy.textContent || "处理中";
    els.busyDetail.textContent = els.statusCard.textContent || "模型响应通常需要一点时间，请不要关闭页面。";
  }
  updateControls();
}

function updateControls() {
  const hasSource = Boolean(state.source);
  const hasAnnotations = state.annotations.length > 0;
  const hasActive = Boolean(state.activeId);
  const hasQwenKey = Boolean(sanitize(els.qwenApiKey.value));
  const hasSavedQwen = hasSavedQwenSettings();

  els.sourceKind.textContent = hasSource ? (state.source.kind === "pdf" ? "PDF" : "图片") : "未加载文件";
  els.filePill.textContent = hasSource ? state.source.name : "未加载图纸";
  els.pagePill.textContent = `第 ${state.pageCount ? state.currentPage : 0} / ${state.pageCount} 页`;
  els.savePill.textContent = state.unsavedChanges ? "未保存" : "已保存";
  els.statPages.textContent = String(state.pageCount);
  els.statBubbles.textContent = String(state.annotations.length);
  els.statDetections.textContent = String(state.annotations.length);
  els.selectionState.textContent = hasActive ? "已选中气泡" : "未选中";
  els.qwenState.textContent = UiLogic.qwenStateLabel(hasSavedQwen, hasQwenKey);

  els.fileInput.disabled = state.busy;
  els.uploadBtn.disabled = UiLogic.sourceActionDisabled(state.busy);
  els.loadSampleBtn.disabled = UiLogic.sourceActionDisabled(state.busy);
  els.scanBtn.disabled = UiLogic.scanActionDisabled(hasSavedQwen, hasSource, state.busy);
  els.resetBtn.disabled = !hasSource || state.busy;
  els.localFallbackBtn.disabled = !hasSource || state.busy;
  els.pageSelect.disabled = !state.pdfDoc || state.busy;
  els.renumberBtn.disabled = !hasAnnotations || state.busy;
  els.addBubbleBtn.disabled = !hasSource || state.busy;
  els.reanchorBtn.disabled = !hasActive || state.busy;
  els.deleteBubbleBtn.disabled = !hasActive || state.busy;
  els.saveProjectBtn.disabled = !hasSource || state.busy;
  els.exportJsonBtn.disabled = !hasSource || state.busy;
  els.exportCsvBtn.disabled = !hasAnnotations || state.busy;
  els.exportXlsxBtn.disabled = !hasAnnotations || state.busy;
  els.runQwenBtn.disabled = UiLogic.rerunActionDisabled(hasSavedQwen, hasSource, hasQwenKey, state.busy);
  els.toggleBoxesBtn.textContent = state.showBoxes ? "隐藏 OCR 框" : "显示 OCR 框";
  els.addBubbleBtn.textContent = state.addMode ? "点击图纸以新增" : "点击新增气泡";
  els.reanchorBtn.textContent = state.reanchorMode ? "点击图纸以锚定" : "下次点击重新锚定";
  els.canvasEmpty.style.display = hasSource ? "none" : "grid";
}

function updateSurfaceSize() {
  const scale = getEffectiveZoom();
  els.surface.style.width = `${state.canvasWidth}px`;
  els.surface.style.height = `${state.canvasHeight}px`;
  els.surface.style.transform = `scale(${scale})`;
  els.surfaceSizer.style.width = `${state.canvasWidth * scale}px`;
  els.surfaceSizer.style.height = `${state.canvasHeight * scale}px`;
  if (state.zoom === "fit") {
    els.zoomSelect.value = "fit";
  }
}

function getEffectiveZoom() {
  if (!state.canvasWidth || !state.canvasHeight) {
    return 1;
  }
  if (state.zoom !== "fit") {
    return Number(state.zoom) || 1;
  }
  const frameWidth = Math.max(320, els.viewerShell.clientWidth - 40);
  const frameHeight = Math.max(320, els.viewerShell.clientHeight - 40);
  const scale = Math.min(frameWidth / state.canvasWidth, frameHeight / state.canvasHeight, 1);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function setZoom(value) {
  state.zoom = value;
  els.zoomSelect.value = value === "fit" ? "fit" : String(value);
  updateSurfaceSize();
  updateControls();
}

function adjustZoom(direction) {
  const scale = getEffectiveZoom();
  const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
  let current = scale;
  if (state.zoom !== "fit") {
    current = Number(state.zoom) || 1;
  }
  let index = steps.findIndex((step) => step >= current - 0.001);
  if (index === -1) {
    index = steps.length - 1;
  }
  index = clamp(index + direction, 0, steps.length - 1);
  setZoom(steps[index]);
}

async function toggleFullscreenViewer() {
  const panel = els.viewerPanel;
  const isFullscreen = document.fullscreenElement === panel || document.webkitFullscreenElement === panel;
  if (isFullscreen) {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    return;
  }
  if (panel.requestFullscreen) {
    await panel.requestFullscreen();
  } else if (panel.webkitRequestFullscreen) {
    panel.webkitRequestFullscreen();
  }
}

function normalizeDimension(text) {
  return sanitize(text)
    .replace(/[xX]/g, "x")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
}

function getQwenSettings() {
  return {
    apiKey: sanitize(els.qwenApiKey.value),
    model: sanitize(els.qwenModel.value) || "qwen3.6-plus",
    baseUrl: sanitize(els.qwenBaseUrl.value).replace(/\/$/, "") || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    extraHeadersRaw: els.qwenExtraHeaders.value.trim(),
    firstSystemPrompt: els.qwenFirstSystemPrompt.value.trim(),
    firstUserPrompt: els.qwenFirstUserPrompt.value.trim(),
    reviewSystemPrompt: els.qwenReviewSystemPrompt.value.trim(),
    reviewUserPrompt: els.qwenReviewUserPrompt.value.trim()
  };
}

function currentModelLabel() {
  return sanitize(els.qwenModel.value) || "Qwen";
}

function hasSavedQwenSettings() {
  try {
    const raw = localStorage.getItem(QWEN_SETTINGS_KEY);
    if (!raw) {
      return false;
    }
    const settings = JSON.parse(raw);
    return Boolean(sanitize(settings.apiKey));
  } catch (error) {
    console.error(error);
    return false;
  }
}

let qwenSaveFeedbackTimer = null;

function showQwenSaveSuccess() {
  if (qwenSaveFeedbackTimer) {
    clearTimeout(qwenSaveFeedbackTimer);
  }
  els.saveQwenBtn.textContent = "已保存 API 设置";
  els.saveQwenBtn.classList.add("save-success");
  els.qwenState.textContent = "已保存设置";
  qwenSaveFeedbackTimer = setTimeout(() => {
    els.saveQwenBtn.textContent = "保存 API 设置";
    els.saveQwenBtn.classList.remove("save-success");
    updateControls();
    qwenSaveFeedbackTimer = null;
  }, 2200);
}

function saveQwenSettings() {
  const settings = getQwenSettings();
  if (!settings.apiKey) {
    setStatus("请先填写 API 密钥，再保存设置。");
    return;
  }
  localStorage.setItem(QWEN_SETTINGS_KEY, JSON.stringify(settings));
  updateControls();
  showQwenSaveSuccess();
  setStatus("已在当前浏览器中保存 Qwen API 设置。下一步请加载示例图纸或上传客户图纸。");
}

function fillPromptEditorsFromDefaults() {
  els.qwenFirstSystemPrompt.value = defaultQwenSystemPrompt("first-pass");
  els.qwenFirstUserPrompt.value = defaultBuildQwenPrompt("first-pass");
  els.qwenReviewSystemPrompt.value = defaultQwenSystemPrompt("review-pass");
  els.qwenReviewUserPrompt.value = defaultBuildQwenPrompt("review-pass");
}

function loadQwenSettings() {
  try {
    const raw = localStorage.getItem(QWEN_SETTINGS_KEY);
    if (!raw) {
      els.qwenModel.value = "qwen3.6-plus";
      els.qwenBaseUrl.value = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
      fillPromptEditorsFromDefaults();
      return;
    }
    const settings = JSON.parse(raw);
    els.qwenApiKey.value = settings.apiKey || "";
    els.qwenModel.value = settings.model || "qwen3.6-plus";
    els.qwenBaseUrl.value = settings.baseUrl || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    els.qwenExtraHeaders.value = settings.extraHeadersRaw || "";
    els.qwenFirstSystemPrompt.value = settings.firstSystemPrompt || defaultQwenSystemPrompt("first-pass");
    els.qwenFirstUserPrompt.value = settings.firstUserPrompt || defaultBuildQwenPrompt("first-pass");
    els.qwenReviewSystemPrompt.value = settings.reviewSystemPrompt || defaultQwenSystemPrompt("review-pass");
    els.qwenReviewUserPrompt.value = settings.reviewUserPrompt || defaultBuildQwenPrompt("review-pass");
  } catch (error) {
    console.error(error);
    fillPromptEditorsFromDefaults();
  }
}

function scoreDimension(text, confidence) {
  const value = normalizeDimension(text);
  if (!value) {
    return null;
  }

  const mmMatch = value.match(/\b\d{2,5}(?:[.,]\d+)?\s?(?:mm|cm|m)\b/i);
  const footMatch = value.match(/\b\d+\s*(?:'|ft)\s*-?\s*\d+(?:\s*\/\s*\d+)?\s*(?:"|in)?\b/i);
  const ratioMatch = value.match(/\b\d+(?:[.,]\d+)?\s?x\s?\d+(?:[.,]\d+)?(?:\s?(?:mm|cm|m))?\b/i);
  const plainNumber = value.match(/^\d{2,5}(?:[.,]\d+)?$/);
  const mixedNumber = value.match(/\b\d{2,5}(?:[.,]\d+)?\b/);

  let score = confidence / 100;
  let extracted = null;

  if (mmMatch) {
    extracted = mmMatch[0];
    score += 0.55;
  } else if (footMatch) {
    extracted = footMatch[0];
    score += 0.48;
  } else if (ratioMatch) {
    extracted = ratioMatch[0];
    score += 0.42;
  } else if (plainNumber) {
    extracted = plainNumber[0];
    score += 0.24;
  } else if (mixedNumber && value.length <= 12) {
    extracted = mixedNumber[0];
    score += 0.12;
  }

  if (!extracted) {
    return null;
  }

  if (/[A-Za-z]{4,}/.test(value) && !/(mm|cm|ft|in|m)/i.test(value)) {
    score -= 0.18;
  }

  if (/page|scale|sheet|issue|title|drawn|checked|project/i.test(value)) {
    score -= 0.3;
  }

  if (score < 0.42) {
    return null;
  }

  return {
    value: extracted,
    sourceText: value,
    score: Math.max(0, Math.min(0.99, score))
  };
}

function dedupeCandidates(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = `${item.value}|${Math.round(item.anchorX / 8)}|${Math.round(item.anchorY / 8)}`;
    const existing = map.get(key);
    if (!existing || item.confidence > existing.confidence) {
      map.set(key, item);
    }
  });
  return Array.from(map.values())
    .sort((a, b) => (b.confidence - a.confidence) || (a.anchorY - b.anchorY))
    .slice(0, 100);
}

function toAnnotation(candidate, index) {
  const side = index % 2 === 0 ? 1 : -1;
  const verticalOffset = ((index % 5) - 2) * 18;
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    label: `B${index + 1}`,
    value: candidate.value,
    note: candidate.sourceText,
    confidence: candidate.confidence,
    page: state.currentPage,
    x: clamp(candidate.anchorX + (side * 92), 12, state.canvasWidth - 58),
    y: clamp(candidate.anchorY - 20 + verticalOffset, 12, state.canvasHeight - 58),
    anchorX: candidate.anchorX,
    anchorY: candidate.anchorY,
    box: candidate.box || null,
    manual: false
  };
}

function createManualAnnotation() {
  const index = state.annotations.length;
  return {
    id: `${Date.now()}-manual-${Math.random().toString(36).slice(2, 7)}`,
    label: `B${index + 1}`,
    value: "",
    tolerance: "",
    note: "用户新增锚点",
    confidence: 1,
    page: state.currentPage,
    x: clamp((state.canvasWidth / 2) - 23 + ((index % 4) * 18), 12, state.canvasWidth - 58),
    y: clamp((state.canvasHeight / 2) - 23 + ((index % 4) * 18), 12, state.canvasHeight - 58),
    anchorX: clamp((state.canvasWidth / 2) - 90, 12, state.canvasWidth - 12),
    anchorY: clamp((state.canvasHeight / 2) - 30, 12, state.canvasHeight - 12),
    box: null,
    manual: true,
    userAdjusted: true,
    reviewSource: "manual-add"
  };
}

function getActiveAnnotation() {
  return state.annotations.find((item) => item.id === state.activeId) || null;
}

function syncSelectionFields() {
  const item = getActiveAnnotation();
  els.bubbleLabel.value = item ? item.label : "";
  els.bubbleValue.value = item ? item.value : "";
  els.bubbleNote.value = item ? item.note : "";
  els.bubbleConfidence.value = item ? item.confidence.toFixed(2) : "";
}

function selectAnnotation(id) {
  state.activeId = id || null;
  syncSelectionFields();
  renderAnnotations();
  renderTable();
  updateControls();
}

function getFilteredAnnotations() {
  const term = sanitize(state.filterText).toLowerCase();
  if (!term) {
    return state.annotations;
  }
  return state.annotations.filter((item) => {
    return [item.label, item.value, item.note, String(item.page)]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });
}

function startCellEdit(row, key) {
  const id = row.dataset.id;
  const item = state.annotations.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  const cell = row.querySelector(`[data-key="${key}"]`);
  if (!cell) {
    return;
  }
  const input = document.createElement("input");
  input.className = "cell-input";
  input.value = item[key];
  cell.innerHTML = "";
  cell.appendChild(input);
  input.addEventListener("click", (event) => event.stopPropagation());
  input.focus();
  input.select();

  function commit() {
    item[key] = sanitize(input.value) || item[key];
    markDirty();
    renderTable();
    renderAnnotations();
    if (item.id === state.activeId) {
      syncSelectionFields();
    }
  }

  input.addEventListener("blur", commit, { once: true });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commit();
      input.blur();
    }
    if (event.key === "Escape") {
      renderTable();
    }
  });
}

function renderTable() {
  const filtered = getFilteredAnnotations();
  if (!filtered.length) {
    els.resultsTable.hidden = true;
    els.tableEmpty.hidden = false;
    els.resultsBody.innerHTML = "";
    return;
  }

  els.resultsTable.hidden = false;
  els.tableEmpty.hidden = true;
  els.resultsBody.innerHTML = "";

  filtered.forEach((item) => {
    const row = document.createElement("tr");
    row.dataset.id = item.id;
    if (item.id === state.activeId) {
      row.className = "active";
    }
    if (item.manual || item.userAdjusted) {
      row.classList.add("user-adjusted");
    }
    row.innerHTML = `
      <td data-key="label">${item.label}</td>
      <td data-key="value">${item.value}</td>
      <td data-key="tolerance">${item.tolerance || ""}</td>
      <td data-key="note">${item.note || ""}</td>
      <td>${item.confidence.toFixed(2)}</td>
      <td>${item.page}</td>
    `;
    row.addEventListener("click", () => selectAnnotation(item.id));
    row.querySelectorAll("[data-key]").forEach((cell) => {
      cell.addEventListener("click", (event) => {
        event.stopPropagation();
        selectAnnotation(item.id);
        startCellEdit(row, cell.dataset.key);
      });
    });
    els.resultsBody.appendChild(row);
  });
}

function buildLeader(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt((dx * dx) + (dy * dy));
  const node = document.createElement("div");
  node.className = "leader-line";
  node.style.left = `${x1}px`;
  node.style.top = `${y1}px`;
  node.style.width = `${length}px`;
  node.style.transform = `rotate(${Math.atan2(dy, dx) * (180 / Math.PI)}deg)`;
  return node;
}

function annotationTheme(item) {
  if (item.manual || item.userAdjusted) {
    return {
      line: "#2dd4bf",
      anchor: "#14b8a6",
      bubbleStart: "#b9fff1",
      bubbleMid: "#2dd4bf",
      bubbleEnd: "#0f766e",
      chipFill: "#ecfeff",
      chipStroke: "#2dd4bf",
      chipText: "#0f3f52",
      text: "#ffffff"
    };
  }
  return {
    line: "#ffffff",
    anchor: "#2dd4bf",
    bubbleStart: "#ffd8a8",
    bubbleMid: "#fb923c",
    bubbleEnd: "#ea580c",
    chipFill: "#fffaf2",
    chipStroke: "#ffffff",
    chipText: "#0f172a",
    text: "#ffffff"
  };
}

function annotationDisplayValue(item) {
  const parts = [];
  if (item.value) {
    parts.push(item.value);
  }
  if (item.tolerance) {
    parts.push(item.tolerance);
  }
  if (item.standardError) {
    parts.push(item.standardError);
  }
  return parts.join(" ").trim();
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawAnnotationGraphics(context, options = {}) {
  const {
    includeBase = false,
    includeChips = true,
    background = null
  } = options;

  const width = state.canvasWidth || els.canvas.width;
  const height = state.canvasHeight || els.canvas.height;
  const output = context.canvas;
  output.width = width;
  output.height = height;

  context.clearRect(0, 0, width, height);
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }
  if (includeBase) {
    context.drawImage(els.canvas, 0, 0, width, height);
  }

  state.annotations.forEach((item) => {
    const theme = annotationTheme(item);
    const bubbleCenterX = item.x + 23;
    const bubbleCenterY = item.y + 23;

    context.save();
    context.strokeStyle = theme.line;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(item.anchorX, item.anchorY);
    context.lineTo(bubbleCenterX, bubbleCenterY);
    context.stroke();

    context.fillStyle = theme.anchor;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(item.anchorX, item.anchorY, item.manual || item.userAdjusted ? 6 : 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (includeChips) {
      const displayValue = annotationDisplayValue(item);
      const chipText = displayValue ? `${item.label} · ${displayValue}` : `${item.label} · 用户锚点`;
      context.font = "700 12px PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, Avenir Next, Segoe UI, sans-serif";
      const textWidth = context.measureText(chipText).width;
      const chipWidth = textWidth + 20;
      const chipHeight = 30;
      const chipX = clamp(item.anchorX - (chipWidth / 2), 6, Math.max(6, width - chipWidth - 6));
      const chipY = clamp(item.anchorY - 60, 6, Math.max(6, height - chipHeight - 6));
      drawRoundedRect(context, chipX, chipY, chipWidth, chipHeight, 12);
      context.fillStyle = theme.chipFill;
      context.fill();
      context.strokeStyle = theme.chipStroke;
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = theme.chipText;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(chipText, chipX + (chipWidth / 2), chipY + (chipHeight / 2) + 0.5);
    }

    const gradient = context.createRadialGradient(
      item.x + 14,
      item.y + 14,
      4,
      bubbleCenterX,
      bubbleCenterY,
      28
    );
    gradient.addColorStop(0, theme.bubbleStart);
    gradient.addColorStop(0.52, theme.bubbleMid);
    gradient.addColorStop(1, theme.bubbleEnd);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(bubbleCenterX, bubbleCenterY, 23, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#ffffff";
    context.lineWidth = 3;
    context.stroke();

    context.fillStyle = theme.text;
    context.font = "800 14px PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, Avenir Next, Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(item.label, bubbleCenterX, bubbleCenterY + 0.5);
    context.restore();
  });
}

function captureScreenshotBundle() {
  if (!state.source || !state.canvasWidth || !state.canvasHeight) {
    return null;
  }
  const original = els.canvas.toDataURL("image/png");

  const generatedCanvas = document.createElement("canvas");
  const generatedContext = generatedCanvas.getContext("2d");
  drawAnnotationGraphics(generatedContext, {
    includeBase: false,
    includeChips: true,
    background: "#ffffff"
  });

  const annotatedCanvas = document.createElement("canvas");
  const annotatedContext = annotatedCanvas.getContext("2d");
  drawAnnotationGraphics(annotatedContext, {
    includeBase: true,
    includeChips: true,
    background: null
  });

  return {
    page: state.currentPage,
    original,
    generated: generatedCanvas.toDataURL("image/png"),
    annotated: annotatedCanvas.toDataURL("image/png"),
    capturedAt: new Date().toISOString()
  };
}

function renderAnnotations() {
  els.annotationLayer.innerHTML = "";
  const visibleIds = new Set(getFilteredAnnotations().map((item) => item.id));

  state.annotations.forEach((item) => {
    if (!visibleIds.has(item.id)) {
      return;
    }

    if (item.box) {
      const box = document.createElement("button");
      box.type = "button";
      box.className = `ocr-box${state.showBoxes ? "" : " hidden"}`;
      box.style.left = `${item.box.x}px`;
      box.style.top = `${item.box.y}px`;
      box.style.width = `${item.box.w}px`;
      box.style.height = `${item.box.h}px`;
      box.addEventListener("click", () => selectAnnotation(item.id));
      els.annotationLayer.appendChild(box);
    }

    const anchor = document.createElement("div");
    anchor.className = `anchor-marker${item.manual || item.userAdjusted ? " user-adjusted" : ""}`;
    anchor.style.left = `${item.anchorX}px`;
    anchor.style.top = `${item.anchorY}px`;

    const tag = document.createElement("div");
    tag.className = `bubble-chip${item.manual || item.userAdjusted ? " user-adjusted" : ""}`;
    tag.style.left = `${item.anchorX}px`;
    tag.style.top = `${item.anchorY}px`;
    {
      const displayValue = annotationDisplayValue(item);
      tag.textContent = displayValue ? `${item.label} · ${displayValue}` : `${item.label} · 用户锚点`;
    }

    const bubble = document.createElement("button");
    bubble.type = "button";
    bubble.className = `bubble${item.manual || item.userAdjusted ? " user-adjusted" : ""}${item.id === state.activeId ? " active" : ""}`;
    bubble.style.left = `${item.x}px`;
    bubble.style.top = `${item.y}px`;
    bubble.textContent = item.label;

    bubble.addEventListener("click", () => selectAnnotation(item.id));
    bubble.addEventListener("pointerdown", (event) => {
      const rect = els.viewerShell.getBoundingClientRect();
      const scale = getEffectiveZoom();
      state.dragging = {
        id: item.id,
        dx: ((event.clientX - rect.left) + els.viewerShell.scrollLeft) / scale - item.x,
        dy: ((event.clientY - rect.top) + els.viewerShell.scrollTop) / scale - item.y
      };
      bubble.setPointerCapture(event.pointerId);
      selectAnnotation(item.id);
    });

    const leader = buildLeader(item.anchorX, item.anchorY, item.x + 23, item.y + 23);
    if (item.manual || item.userAdjusted) {
      leader.classList.add("user-adjusted");
    }
    els.annotationLayer.appendChild(leader);
    els.annotationLayer.appendChild(anchor);
    els.annotationLayer.appendChild(tag);
    els.annotationLayer.appendChild(bubble);
  });
}

function clearAnnotations() {
  state.annotations = [];
  state.scanSnapshot = [];
  state.activeId = null;
  state.reanchorMode = false;
  state.addMode = false;
  syncSelectionFields();
  renderAnnotations();
  renderTable();
  updateControls();
}

function clearSheetAnalysis() {
  state.sheetAnalysis = null;
}

function populatePageSelect(count) {
  els.pageSelect.innerHTML = "";
  for (let index = 1; index <= count; index += 1) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `第 ${index} 页`;
    els.pageSelect.appendChild(option);
  }
  els.pageSelect.value = String(state.currentPage);
}

async function renderPdfPage(pageNumber) {
  const page = await state.pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2 });
  state.canvasWidth = Math.round(viewport.width);
  state.canvasHeight = Math.round(viewport.height);
  els.canvas.width = state.canvasWidth;
  els.canvas.height = state.canvasHeight;
  updateSurfaceSize();
  await page.render({ canvasContext: ctx, viewport }).promise;
}

async function renderImage() {
  const bitmap = state.imageBitmap;
  const maxWidth = 1800;
  const scale = Math.min(1, maxWidth / bitmap.width);
  state.canvasWidth = Math.round(bitmap.width * scale);
  state.canvasHeight = Math.round(bitmap.height * scale);
  els.canvas.width = state.canvasWidth;
  els.canvas.height = state.canvasHeight;
  updateSurfaceSize();
  ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
  ctx.drawImage(bitmap, 0, 0, state.canvasWidth, state.canvasHeight);
}

async function openImageBlob(blob, name, sourceAsset = null) {
  state.pdfDoc = null;
  state.pdfBytes = null;
  state.imageBitmap = await createImageBitmap(blob);
  state.source = { kind: "image", name };
  state.sourceAsset = sourceAsset;
  state.pageCount = 1;
  state.currentPage = 1;
  populatePageSelect(1);
  await renderImage();
  clearAnnotations();
  clearSheetAnalysis();
  markDirty();
  setStatus(`已加载 ${name}。下一步请运行 Qwen 首轮识别。`);
}

async function rerenderCurrentSource() {
  if (state.pdfDoc) {
    await renderPdfPage(state.currentPage);
  } else if (state.imageBitmap) {
    await renderImage();
  }
}

async function openPdfFromBytes(bytes, name) {
  state.pdfBytes = bytes;
  state.imageBitmap = null;
  state.pdfDoc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  state.source = { kind: "pdf", name };
  state.sourceAsset = {
    kind: "pdf",
    name,
    mimeType: "application/pdf",
    dataBase64: bytesToBase64(bytes)
  };
  state.pageCount = state.pdfDoc.numPages;
  state.currentPage = 1;
  populatePageSelect(state.pageCount);
  await renderPdfPage(state.currentPage);
  clearAnnotations();
  clearSheetAnalysis();
  markDirty();
  setStatus(`已加载 ${name}。选择页码后，下一步请运行 Qwen 首轮识别。`);
}

async function openImageFile(file) {
  const dataUrl = await blobToDataUrl(file);
  await openImageBlob(file, file.name, {
    kind: "image",
    name: file.name,
    mimeType: file.type || "image/png",
    dataUrl
  });
}

async function loadFile(file) {
  if (!file) {
    return;
  }
  if (!hasSavedQwenSettings()) {
    setStatus("请先完成并保存 API 设置，再加载示例或上传图纸。");
    return;
  }

  try {
    setBusy(true);
    setProgress("正在加载文件", 10);
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await openPdfFromBytes(bytes, file.name);
    } else {
      await openImageFile(file);
    }
    setProgress("就绪", 100);
  } catch (error) {
    console.error(error);
    setStatus(`无法加载文件：${error.message}`);
    setProgress("加载失败", 0);
  } finally {
    setBusy(false);
  }
}

function sampleCandidateUrls() {
  const encodedName = SAMPLE_FILE
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const candidates = [
    SAMPLE_FILE,
    `./${SAMPLE_FILE}`,
    encodedName,
    `./${encodedName}`
  ];

  if (window.location && window.location.href) {
    candidates.push(new URL(SAMPLE_FILE, window.location.href).href);
    candidates.push(new URL(encodedName, window.location.href).href);
  }

  return Array.from(new Set(candidates));
}

function embeddedSampleBytes() {
  const base64 = window.__SAMPLE_PDF_BASE64__;
  if (!base64) {
    return null;
  }
  try {
    return base64ToBytes(base64);
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function fetchSampleBytes() {
  const embedded = embeddedSampleBytes();
  if (embedded) {
    return embedded;
  }

  let lastError = null;
  for (const url of sampleCandidateUrls()) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("无法访问示例文件");
}

async function loadSample() {
  if (!hasSavedQwenSettings()) {
    setStatus("请先完成并保存 API 设置，再加载示例图纸。");
    return;
  }
  try {
    setBusy(true);
    setProgress("正在加载示例", 8);
    const bytes = await fetchSampleBytes();
    await openPdfFromBytes(bytes, SAMPLE_FILE);
    setProgress("就绪", 100);
  } catch (error) {
    console.error(error);
    if (window.location.protocol === "file:") {
      els.fileInput.click();
      setStatus(`当前浏览器阻止了直接读取示例文件。已自动打开文件选择器，请手动选择 ${SAMPLE_FILE}；如果仍希望一键加载，请用本目录中的 serve.command 启动后再打开 http://localhost:8000。`);
      setProgress("需要手动选择", 0);
      return;
    }
    setStatus(`示例加载失败：${error.message}`);
    setProgress("加载失败", 0);
  } finally {
    setBusy(false);
  }
}

function createPreprocessedCanvas({ invert = false } = {}) {
  const source = els.canvas;
  const scale = Math.min(2.2, Math.max(1.4, 2200 / Math.max(source.width, source.height)));
  const target = document.createElement("canvas");
  target.width = Math.max(1, Math.round(source.width * scale));
  target.height = Math.max(1, Math.round(source.height * scale));
  const targetCtx = target.getContext("2d", { willReadFrequently: true });
  targetCtx.drawImage(source, 0, 0, target.width, target.height);

  const imageData = targetCtx.getImageData(0, 0, target.width, target.height);
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const gray = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
    const boosted = gray > 205 ? 255 : (gray < 170 ? 0 : gray > 188 ? 230 : 32);
    const value = invert ? 255 - boosted : boosted;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  targetCtx.putImageData(imageData, 0, 0);
  return target;
}

async function runOcrPass(image, passName, progressOffset, progressSpan) {
  return window.Tesseract.recognize(image, OCR_LANG, {
    logger(message) {
      if (message.status === "recognizing text") {
        setProgress(
          `${passName}：识别中`,
          Math.round(message.progress * progressSpan) + progressOffset
        );
      } else if (message.status === "loading tesseract core") {
        setProgress(`${passName}：加载 OCR`, progressOffset);
      } else if (message.status === "initializing tesseract") {
        setProgress(`${passName}：初始化`, progressOffset + 4);
      } else if (message.status === "loading language traineddata") {
        setProgress(`${passName}：加载语言数据`, progressOffset + 7);
      }
    },
    tessedit_pageseg_mode: window.Tesseract?.PSM?.SPARSE_TEXT || 11,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,/-'\"()[] xX:"
  });
}

function extractCandidates(result) {
  const candidates = [];
  const lines = (result.data && result.data.lines) || [];
  const words = (result.data && result.data.words) || [];

  lines.forEach((line) => {
    const dimension = scoreDimension(line.text, line.confidence || 0);
    if (!dimension) {
      return;
    }
    const box = {
      x: Math.max(0, line.bbox.x0),
      y: Math.max(0, line.bbox.y0),
      w: Math.max(8, line.bbox.x1 - line.bbox.x0),
      h: Math.max(8, line.bbox.y1 - line.bbox.y0)
    };
    candidates.push({
      value: dimension.value,
      sourceText: dimension.sourceText,
      confidence: dimension.score,
      anchorX: box.x + (box.w / 2),
      anchorY: box.y + (box.h / 2),
      box
    });
  });

  if (!candidates.length) {
    words.forEach((word) => {
      const dimension = scoreDimension(word.text, word.confidence || 0);
      if (!dimension) {
        return;
      }
      const box = {
        x: Math.max(0, word.bbox.x0),
        y: Math.max(0, word.bbox.y0),
        w: Math.max(8, word.bbox.x1 - word.bbox.x0),
        h: Math.max(8, word.bbox.y1 - word.bbox.y0)
      };
      candidates.push({
        value: dimension.value,
        sourceText: dimension.sourceText,
        confidence: dimension.score,
        anchorX: box.x + (box.w / 2),
        anchorY: box.y + (box.h / 2),
        box
      });
    });
  }

  return dedupeCandidates(candidates);
}

async function runLocalFallbackOcr() {
  if (!state.source) {
    return;
  }

  try {
    setBusy(true);
    clearAnnotations();
    setStatus("正在浏览器中运行本地备用 OCR。只有在你需要非 Qwen 的备用识别时才建议使用。");
    setProgress("正在准备本地 OCR", 6);

    const preprocessed = createPreprocessedCanvas();
    const [baseResult, enhancedResult] = await Promise.all([
      runOcrPass(els.canvas, "第 1 轮", 10, 38),
      runOcrPass(preprocessed, "第 2 轮", 50, 38)
    ]);

    const candidates = dedupeCandidates([
      ...extractCandidates(baseResult),
      ...extractCandidates(enhancedResult)
    ]);
  state.annotations = candidates.map((candidate, index) => ({
      ...toAnnotation(candidate, index),
      tolerance: "",
      sourceText: candidate.sourceText || candidate.value,
      reviewSource: "local-ocr"
    }));
    state.scanSnapshot = state.annotations.map((item) => structuredClone(item));
    state.activeId = state.annotations[0] ? state.annotations[0].id : null;
    syncSelectionFields();
    renderAnnotations();
    renderTable();
    markDirty();
    setProgress("本地 OCR 完成", 100);

    if (state.annotations.length) {
      setStatus(`本地备用 OCR 在第 ${state.currentPage} 页识别到 ${state.annotations.length} 个候选尺寸。请先人工检查并修正，如有需要再运行 Qwen 继续复跑。`);
    } else {
      setStatus("本地备用 OCR 已完成，但没有找到高置信度尺寸候选。你可以手动新增气泡，或回到 Qwen 首轮识别流程。");
    }
  } catch (error) {
    console.error(error);
    setStatus(`本地备用 OCR 失败：${error.message}`);
    setProgress("本地 OCR 失败", 0);
  } finally {
    setBusy(false);
  }
}

function resetToScanSnapshot() {
  if (state.scanSnapshot.length) {
    state.annotations = state.scanSnapshot.map((item, index) => ({
      ...structuredClone(item),
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`
    }));
    state.activeId = state.annotations[0] ? state.annotations[0].id : null;
    syncSelectionFields();
    renderAnnotations();
    renderTable();
    markDirty();
    setStatus("已将气泡恢复到最近一次扫描结果。现在可以继续人工修正，或重新运行 Qwen。");
  } else {
    clearAnnotations();
    setStatus("已清空气泡。");
  }
}

function addBubble() {
  if (!state.source) {
    return;
  }
  state.reanchorMode = false;
  state.addMode = !state.addMode;
  updateControls();
  setStatus(state.addMode ? "请在图纸任意位置点击，以创建新的气泡和锚点。" : "已取消新增气泡。");
}

function deleteBubble() {
  if (!state.activeId) {
    return;
  }
  state.annotations = state.annotations.filter((item) => item.id !== state.activeId);
  state.activeId = state.annotations[0] ? state.annotations[0].id : null;
  state.reanchorMode = false;
  syncSelectionFields();
  renderAnnotations();
  renderTable();
  markDirty();
  updateControls();
  setStatus("已删除气泡和锚点。");
}

function renumberBubbles() {
  state.annotations.forEach((item, index) => {
    item.label = `B${index + 1}`;
  });
  if (state.activeId) {
    syncSelectionFields();
  }
  renderAnnotations();
  renderTable();
  markDirty();
  setStatus("已重新编号气泡标签。");
}

function updateSelectedBubble() {
  const item = getActiveAnnotation();
  if (!item) {
    return;
  }
  item.label = sanitize(els.bubbleLabel.value) || item.label;
  item.value = sanitize(els.bubbleValue.value) || item.value;
  item.tolerance = item.tolerance || "";
  item.note = sanitize(els.bubbleNote.value);
  item.userAdjusted = true;
  if (!item.manual) {
    item.reviewSource = "manual-edit";
  }
  renderAnnotations();
  renderTable();
  markDirty();
}

function projectPayload() {
  state.screenshots = captureScreenshotBundle();
  return {
    meta: {
      name: state.source ? state.source.name : null,
      kind: state.source ? state.source.kind : null,
      pageCount: state.pageCount,
      currentPage: state.currentPage,
      zoom: state.zoom,
      savedAt: new Date().toISOString()
    },
    sourceAsset: state.sourceAsset,
    screenshots: state.screenshots,
    annotations: state.annotations,
    scanSnapshot: state.scanSnapshot
  };
}

function saveProject() {
  if (!state.source) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projectPayload()));
    markSaved();
    setStatus("项目已保存，包含源文件、当前气泡和截图数据。");
  } catch (error) {
    console.error(error);
    setStatus(`无法保存完整项目包：${error.message}`);
  }
}

async function restoreSourceFromAsset(asset) {
  if (!asset || !asset.kind) {
    return false;
  }
  if (asset.kind === "pdf" && asset.dataBase64) {
    await openPdfFromBytes(base64ToBytes(asset.dataBase64), asset.name || "restored.pdf");
    return true;
  }
  if (asset.kind === "image" && asset.dataUrl) {
    const response = await fetch(asset.dataUrl);
    const blob = await response.blob();
    await openImageBlob(blob, asset.name || "restored-image", asset);
    return true;
  }
  return false;
}

async function restoreProjectFromPayload(payload) {
  if (!payload || !Array.isArray(payload.annotations)) {
    throw new Error("项目文件无效");
  }
  let restoredSource = false;
  if (payload.sourceAsset) {
    restoredSource = await restoreSourceFromAsset(payload.sourceAsset);
  }
  state.annotations = payload.annotations.map((item) => ({ ...item }));
  state.scanSnapshot = Array.isArray(payload.scanSnapshot) ? payload.scanSnapshot.map((item) => ({ ...item })) : [];
  state.currentPage = payload.meta && payload.meta.currentPage ? payload.meta.currentPage : state.currentPage;
  state.zoom = payload.meta && payload.meta.zoom ? payload.meta.zoom : state.zoom;
  state.screenshots = payload.screenshots || null;
  els.zoomSelect.value = String(state.zoom);
  if (restoredSource && state.pdfDoc && state.currentPage !== 1) {
    els.pageSelect.value = String(state.currentPage);
    await rerenderCurrentSource();
  }
  state.activeId = state.annotations[0] ? state.annotations[0].id : null;
  syncSelectionFields();
  renderAnnotations();
  renderTable();
  markSaved();
}

async function restoreLastSave() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    setStatus("当前浏览器中还没有已保存的项目。");
    return;
  }

  try {
    const payload = JSON.parse(raw);
    await restoreProjectFromPayload(payload);
    setStatus("已从本地存储恢复项目包；如果可用，也一并恢复了保存时的源文件和截图。");
  } catch (error) {
    console.error(error);
    setStatus(`无法恢复已保存项目：${error.message}`);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const payload = projectPayload();
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    "气泡项目.json"
  );
  setStatus("已导出项目 JSON。");
}

function tableRows() {
  return state.annotations.map((item, index) => ({
    序号: index + 1,
    气泡: item.label,
    尺寸: item.value,
    公差: item.tolerance || "",
    标准误差: item.standardError || "",
    备注: item.note,
    来源文本: item.sourceText || "",
    置信度: Number(item.confidence.toFixed(2)),
    页码: item.page,
    锚点X: Math.round(item.anchorX),
    锚点Y: Math.round(item.anchorY),
    气泡X: Math.round(item.x),
    气泡Y: Math.round(item.y),
    来源类型: item.manual ? "手动" : "OCR",
    复核来源: item.reviewSource || "",
    图纸: state.source ? state.source.name : ""
  }));
}

function exportCsv() {
  const rows = tableRows();
  const headers = Object.keys(rows[0] || {});
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => {
      const value = String(row[key] ?? "");
      return `"${value.replace(/"/g, '""')}"`;
    }).join(","))
  ];
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), "气泡清单.csv");
  setStatus("已导出 CSV 清单。");
}

function exportXlsx() {
  const rows = tableRows();
  const workbook = window.XLSX.utils.book_new();
  const worksheet = window.XLSX.utils.json_to_sheet(rows);
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "气泡清单");
  window.XLSX.writeFile(workbook, "气泡清单.xlsx");
  setStatus("已导出 XLSX 清单。");
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("模型返回内容为空");
  }
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("模型未返回 JSON");
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

function bubbleSnapshotForPrompt() {
  return state.annotations.map((item) => ({
    label: item.label,
    value: item.value,
    tolerance: item.tolerance || "",
    note: item.note || "",
    page: item.page,
    manual: Boolean(item.manual),
    user_updated: Boolean(item.manual || item.userAdjusted),
    correction_priority: item.manual || item.userAdjusted ? "high" : "normal",
    anchor: {
      x: Number((item.anchorX / Math.max(1, state.canvasWidth)).toFixed(4)),
      y: Number((item.anchorY / Math.max(1, state.canvasHeight)).toFixed(4))
    },
    bubble: {
      x: Number((item.x / Math.max(1, state.canvasWidth)).toFixed(4)),
      y: Number((item.y / Math.max(1, state.canvasHeight)).toFixed(4))
    }
  }));
}

function compressBubbleHintsForPrompt() {
  return bubbleSnapshotForPrompt().slice(0, 24);
}

function qwenExtraHeaders() {
  const raw = els.qwenExtraHeaders.value.trim();
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    throw new Error("额外请求头必须是合法 JSON");
  }
}

function parseAnnotationFields(annotation) {
  const rawValue = sanitize(annotation && annotation.value);
  const rawTolerance = sanitize(annotation && annotation.tolerance);
  const rawStandardError = sanitize((annotation && (annotation.standard_error || annotation.standardError)) || "");
  const sourceText = sanitize((annotation && annotation.source_text) || rawValue);

  let value = rawValue;
  let tolerance = rawTolerance;
  let standardError = rawStandardError;

  if (!value && sourceText) {
    const valueMatch = sourceText.match(/(?:R|r|Φ|⌀)?\s*\d+(?:\.\d+)?(?:°)?/);
    if (valueMatch) {
      value = sanitize(valueMatch[0]);
    }
  }

  if (value && sourceText) {
    let stripped = sourceText;
    if (tolerance) {
      stripped = sanitize(stripped.replace(tolerance, ""));
    }
    if (standardError) {
      stripped = sanitize(stripped.replace(standardError, ""));
    }
    if (!rawValue || rawValue === sourceText) {
      const cleanedValueMatch = stripped.match(/(?:R|r|Φ|⌀)?\s*\d+(?:\.\d+)?(?:°)?/);
      if (cleanedValueMatch) {
        value = sanitize(cleanedValueMatch[0]);
      }
    }
  }

  return {
    value,
    tolerance,
    standardError,
    sourceText
  };
}

function mergeQwenResults(payload) {
  const incoming = Array.isArray(payload.annotations) ? payload.annotations : [];
  const used = new Set();
  const allowedRegionTypes = new Set(["geometry_dimension", "geometry_tolerance", "geometry_gdt"]);

  function looksLikeSheetMetadataRegion(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }
    const inTitleBlock = x > 0.72 && y > 0.56;
    const inRightTable = x > 0.72 && y > 0.18;
    const inNotesBlock = x > 0.20 && x < 0.70 && y > 0.52;
    const inBottomToleranceTable = x < 0.18 && y > 0.78;
    return inTitleBlock || inRightTable || inNotesBlock || inBottomToleranceTable;
  }

  function closestMatch(annotation) {
    if (!annotation) {
      return null;
    }
    if (annotation.label) {
      const byLabel = state.annotations.find((item) => item.label === annotation.label);
      if (byLabel) {
        return byLabel;
      }
    }
    if (annotation.anchor_hint) {
      let best = null;
      let bestScore = Infinity;
      state.annotations.forEach((item) => {
        if (used.has(item.id)) {
          return;
        }
        const dx = (item.anchorX / Math.max(1, state.canvasWidth)) - annotation.anchor_hint.x;
        const dy = (item.anchorY / Math.max(1, state.canvasHeight)) - annotation.anchor_hint.y;
        const dist = Math.sqrt((dx * dx) + (dy * dy));
        if (dist < bestScore && dist < 0.06) {
          best = item;
          bestScore = dist;
        }
      });
      return best;
    }
    return null;
  }

  incoming.forEach((annotation) => {
    const parsed = parseAnnotationFields(annotation);
    const regionType = sanitize(annotation.region_type).toLowerCase();
    const attachedToGeometry = annotation.is_attached_to_part_geometry !== false;
    const normalizedX = annotation.anchor_hint && Number(annotation.anchor_hint.x);
    const normalizedY = annotation.anchor_hint && Number(annotation.anchor_hint.y);
    const metadataZone = looksLikeSheetMetadataRegion(normalizedX, normalizedY);
    if ((regionType && !allowedRegionTypes.has(regionType)) || !attachedToGeometry) {
      return;
    }
    if (metadataZone) {
      return;
    }

    const existing = closestMatch(annotation);
    const anchorX = Number.isFinite(normalizedX) ? clamp(normalizedX * state.canvasWidth, 8, state.canvasWidth - 8) : null;
    const anchorY = Number.isFinite(normalizedY) ? clamp(normalizedY * state.canvasHeight, 8, state.canvasHeight - 8) : null;

    if (existing) {
      used.add(existing.id);
      existing.value = parsed.value || existing.value;
      existing.tolerance = parsed.tolerance || existing.tolerance || "";
      existing.sourceText = parsed.sourceText || existing.sourceText || existing.value;
      existing.note = sanitize(annotation.note) || existing.note;
      existing.confidence = clamp(Number(annotation.confidence || existing.confidence || 0.9), 0, 1);
      existing.reviewSource = "qwen-3.6-review";
      existing.standardError = parsed.standardError || existing.standardError || "";
      if (anchorX !== null && anchorY !== null && !existing.manual) {
        existing.anchorX = anchorX;
        existing.anchorY = anchorY;
      }
      return;
    }

    const anchorSafeX = anchorX ?? clamp(state.canvasWidth * 0.5, 8, state.canvasWidth - 8);
    const anchorSafeY = anchorY ?? clamp(state.canvasHeight * 0.5, 8, state.canvasHeight - 8);
    state.annotations.push({
      id: `${Date.now()}-qwen-${Math.random().toString(36).slice(2, 7)}`,
      label: sanitize(annotation.label) || `B${state.annotations.length + 1}`,
      value: parsed.value || "",
      tolerance: parsed.tolerance,
      sourceText: parsed.sourceText || parsed.value,
      note: sanitize(annotation.note),
      confidence: clamp(Number(annotation.confidence || 0.9), 0, 1),
      page: state.currentPage,
      x: clamp(anchorSafeX + 90, 12, state.canvasWidth - 58),
      y: clamp(anchorSafeY + 50, 12, state.canvasHeight - 58),
      anchorX: anchorSafeX,
      anchorY: anchorSafeY,
      box: null,
      manual: false,
      reviewSource: "qwen-3.6-review",
      standardError: parsed.standardError
    });
  });

}

function defaultQwenSystemPrompt(passMode) {
  if (passMode === "first-pass") {
    return [
      "你是 qwen3.6-plus 上运行的高可靠性机械图纸尺寸提取模型。",
      "只能返回合法 JSON。",
      "首轮任务：直接从原始图纸中生成初始气泡集合。",
      "首轮优先级：1. 数值与公差不要串位；2. anchor_hint 优先贴近对应数值文字本身，且不能落到附近另一个尺寸数字上；3. 在保证前两项的前提下尽量提高覆盖率。",
      "必须逐视图检查：主视图、次级视图、局部视图、剖面视图、圆孔区域、下方视图、右侧视图都要单独复查。",
      "一个有效标注必须明确附着在尺寸线、引出线、角度弧线、半径/直径标注或几何相关公差信息上。",
      "如果一个区域已经识别出一个尺寸，应继续检查该区域相邻的链式尺寸、并列尺寸、角度、半径、直径和小尺寸，不要只抓一个样本就停止。",
      "首轮要特别优先补齐容易漏掉的值：小尺寸、盒内尺寸、局部视图中的尺寸、靠近 GD&T 框或基准符号的尺寸、直径符号 Φ 附近的尺寸、短竖向尺寸、短横向尺寸、以及圆孔附近的尺寸。",
      "如果某个局部已经识别到一个尺寸，说明该局部很可能还存在其他相邻尺寸；必须继续复查直到没有明显遗漏。",

      "【螺纹标注】必须识别螺纹规格，例如 M13.18、M10×1.5、M8-6H 等。螺纹标注通常出现在孔或轴的引出线末端，value 应写为完整螺纹规格（如 'M13.18'），region_type 为 geometry_dimension。",
      "【GD&T 特征控制框】必须识别几何公差框（矩形方框内含符号和数值），例如位置度 ⌖ 0.05、平面度 ⏥ 0.02、圆度 ○ 0.01 等。value 应写为公差值（如 '0.05'），source_text 应包含完整框内容（如 '⌖ Φ0.05 M A B'），region_type 为 geometry_gdt。如果框中包含基准引用（A、B、C），应在 note 中注明。",
      "【复合尺寸】必须识别形如 22.0 × 6.1 的复合尺寸（宽×高、长×宽等），value 应保留完整写法（如 '22.0 × 6.1'），不要拆分成两个独立标注。",
      "【上下偏差堆叠格式】当看到主值上方有一个小数字、下方有另一个小数字时（如 R11.5 上方 +0.3 下方 -0.1），这是上下偏差格式。tolerance 应写为 '+0.3/-0.1'，不要只取其中一个。source_text 应写为 'R11.5 +0.3 -0.1'。",
      "【括号参考尺寸】括号中的尺寸（如 (114.8°)、(20.0)）是参考尺寸，仍然需要提取。value 不含括号，source_text 保留括号。在 note 中注明'参考尺寸'。",
      "【配合公差代号】必须识别配合公差代号，如 h9、H7、f6、js6 等，通常紧跟在尺寸值后面。应将其写入 tolerance 字段（如 value='Φ13.18', tolerance='h9'）。",
      "【表面粗糙度】如果尺寸标注附近有表面粗糙度符号（√ 形或三角形带数值），应作为单独标注提取，region_type 为 geometry_tolerance，value 为粗糙度值（如 'Ra 1.6'）。",
      "【基准符号】基准标记（三角旗 + 字母，如 A、B、C）本身不需要单独提取为气泡，但如果基准符号旁边有附着的尺寸值，该尺寸不能遗漏。",
      "【R 和 Φ 前缀】半径标注以 R 开头（如 R15.0、R239.0、R11.5），直径标注以 Φ 开头（如 Φ13.18、Φ3.0、Φ9.45）。value 必须保留 R 或 Φ 前缀，不要丢掉。",

      "数字识别要谨慎，优先保证准确率：仔细区分 0/6/8/9、1/7、3/8、5/6、O/0、I/1、2/4、小数点、R、Φ、°、括号值、上下偏差和 ± 符号。",
      "特别注意 2 和 4 的区分：在手写体或低分辨率区域，2 的弧线底笔容易被误读为 4 的尖角；如果上下文是 R 开头的半径值，应结合圆弧几何合理性判断（例如 R239 和 R439 差异极大，选择与图中圆弧曲率更匹配的值）。",
      "特别注意角度值的精确读取：1 和 7 容易混淆，.1 和 .7 在小字号下极易误读；应结合角度弧线的张角大小做合理性校验。",
      "绝对不要把来自两个不同位置、不同箭头、不同尺寸线、不同引出线、不同框的数字拼成一个标注。",
      "上下偏差（如 +0.3/-0.1）只能归属于与其物理上最近且共享同一尺寸线或引出线的主值。如果上下偏差文字紧贴在某个主值（如 R11.5）的右侧或上下方，就只能属于该主值，不能被吸附到附近另一个不同类型的标注（如角度值）上。",
      "角度标注（°结尾）通常只有主值，很少带 +/-偏差；如果你准备给角度标注填写上下偏差，必须确认偏差文字确实紧贴角度数字本身，而不是来自附近的线性或半径标注。",
      "只有在确认主值、公差、上下偏差或标准误差属于同一个尺寸调用时，才允许把它们填入同一 annotation。判断标准：它们必须在视觉上属于同一组文字，或共享同一条尺寸线/引出线。",
      "如果不能确认公差或 ± 值属于同一个调用，宁可只返回主尺寸值，也不要强行合并。",
      "anchor_hint 的首选目标，是对应数值文字或数值文字组本身的位置，而不是箭头尖端或尺寸线中点。",
      "如果主尺寸值与公差、上下偏差或标准误差属于同一个文字组，anchor_hint 应优先落在这组文字的中心附近。",
      "如果该标注的主要识别依据是数值文字，anchor_hint 应贴近数值文字，不必强行移到箭头尖端。",
      "只有当数值文字极不清晰、被遮挡或无法稳定定位时，才退而求其次使用对应箭头或尺寸线附近位置。",
      "若相邻有两个或多个尺寸数字，例如上方一个、下方一个、左边一个、右边一个，anchor_hint 必须只选择与当前 value 完全对应的那个数字文字，不能因为距离更近就吸附到其他数字上。",
      "例如 value 是 20.0 时，anchor_hint 必须落在 20.0 文字附近，不能落在旁边的 10.0、119.8 或其他数字附近。",
      "例如 value 是 10.0 时，anchor_hint 必须落在 10.0 文字附近，不能落在下方 20.0 文字附近。",
      "必须严格忽略标题栏、修订表、备注段落、标准引用、公差表、公司信息、比例标签以及与零件几何无关的图纸文本。",
      "如果文本含糊不清、几何关系不明确或怀疑发生跨位置拼接，就跳过，不要臆造。",
      "不要输出填充值、重复锚点或占位尺寸。"
    ].join(" ");
  }
  return [
    "你是 qwen3.6-plus 上运行的谨慎机械图纸 OCR 复核模型。",
    "只能返回合法 JSON。",
    "第二轮任务：综合原始图纸、生成的气泡布局图、叠加标注图和当前已编辑气泡，做复核与补全。",
    "把用户手动调整过的锚点和气泡视为强纠偏信号。",
    "第二轮优先级仍然是：1. 不要把不同位置的数字和公差拼在一起；2. anchor_hint 优先贴近对应 value 的数值文字，且不能落到邻近其他数字上；3. 再补充遗漏项。",
    "如果当前锚点偏离对应 value 的数值文字太远，而图中该数值文字本身清晰可见，应优先把锚点拉回该数值文字附近。",
    "如果用户已经把锚点调整到数值文字附近，应把这种修正当作正确示范，不要再强行拉回箭头或尺寸线。",
    "如果用户补加了新的锚点，说明首轮遗漏了这些真实尺寸；第二轮应优先围绕这些区域补全。",
    "如果不能确认主值与公差属于同一个调用，宁可分开处理或只保留主值，也不要强行合并。",
    "优先保留人工意图，补全遗漏的几何附着尺寸，并提升准确率，但不要漂移到图纸元数据区域。"
  ].join(" ");
}

function qwenSystemPrompt(passMode) {
  const customPrompt = passMode === "first-pass"
    ? els.qwenFirstSystemPrompt.value.trim()
    : els.qwenReviewSystemPrompt.value.trim();
  return customPrompt || defaultQwenSystemPrompt(passMode);
}

function defaultBuildQwenPrompt(passMode = "review-pass") {
  const isFirstPass = passMode === "first-pass";
  return [
    "只能返回 JSON。",
    isFirstPass
      ? "第一轮：直接从原始图纸中生成初始气泡集合。先输出高把握结果，再尽量补充明显遗漏项。"
      : "第二轮：结合原始图纸、生成的气泡布局图、叠加标注图以及当前已编辑气泡，一起完成复核。",
    "气泡只用于零件视图中与几何直接相关的尺寸。",
    "绝对不要为标题栏文本、修订表、备注段落、标准表、一般公差表或公司信息生成气泡。",
    isFirstPass
      ? "先检查主视图，再检查次级视图和局部详图。尽量覆盖所有你能有把握识别的、明确附着在几何上的尺寸。即使还不能一次覆盖全部，也要先返回最明显的一批有效尺寸。"
      : "尽量保留已有的人工编辑气泡，只补充那些明显缺失且明确附着在几何上的尺寸。",
    isFirstPass
      ? "第一轮不要依赖任何现有气泡提示，必须直接从图纸几何和尺寸标注中读取。"
      : "凡是标记为 user_updated=true 或 manual=true 的当前气泡，都应被视为强人工纠偏信号；即使文本尚未填完，也要把它们的锚点当作有意图的指导。",
    isFirstPass
      ? "请按从左到右、从上到下的顺序检查图纸，但只输出那些在物理上与零件几何相连的尺寸。"
      : "请仔细比对三张输入图：原始图纸体现真实源文本，气泡布局图体现气泡意图，叠加标注图体现气泡与来源的连接关系。",
    isFirstPass
      ? "首轮必须覆盖所有主要视图与局部区域，不要只停留在主视图的一部分。"
      : "第二轮应重点检查首轮常见漏检区域：次级视图、小尺寸、盒内尺寸、短竖向尺寸、直径半径标注、靠近 GD&T 框的尺寸。",
    "在输出前，必须做一次漏检复查：检查是否遗漏了明显的链式尺寸、上下并列尺寸、局部角度尺寸、半径标注、直径标注和同一局部视图中相邻的多个尺寸调用。",
    "对于同一局部里靠得很近的多个尺寸，不要因为文本重叠就只输出一个；应尽量分别识别，并分别给出属于自己的锚点。",
    "必须主动复查容易漏值的区域：左上角密集角度/斜向尺寸区域、中部线性尺寸区域、右侧圆孔和直径区域、下方细长视图、盒内竖向尺寸、以及靠近 GD&T 框和基准符号的数字。",
    "如果一个值很小、很短、被框住、靠近符号、靠近圆孔、或与其他数字距离很近，也不能跳过；应尽量单独识别。",
    "一个有效标注必须附着在尺寸线、引出线、半径、直径、角度或零件几何附近的公差信息上。",
    isFirstPass
      ? "如果能稳定识别出 5 到 20 个明显尺寸，请优先把这些高质量结果返回；如果明显尺寸远多于 20 个，也应继续补抓，而不要因为还没覆盖完全部尺寸而返回空数组。"
      : "如果人工已经指出某些区域有遗漏，第二轮应优先把这些区域补全，而不是只维持原样。",
    "数字识别必须尽量规范化：value 中保留正确的主尺寸值与符号；source_text 保留图上原始文本；不要把清晰数字读错。",
    "对于直径值、半径值、小数值和短尺寸，宁可多做一次局部放大式视觉检查，也不要因为字符较小或靠近其他图元就漏掉。",
    "对于盒内尺寸、局部视图中的尺寸、圆孔周围尺寸和靠近 GD&T/基准符号的尺寸，不能因为它们视觉上独立或位置偏边缘就忽略。",
    "对于螺纹标注（M开头）、配合公差代号（h9/H7/f6等）、GD&T特征控制框（矩形框内的几何公差）、复合尺寸（如 22.0×6.1）、上下偏差堆叠格式，必须逐一检查，不能遗漏。",
    "如果图上同时出现主尺寸值、公差、上下偏差或标准误差，并且它们明确属于同一个尺寸调用，请分别填写 value、tolerance、standard_error；如果不能确认属于同一个调用，就不要强行合并。",
    "不要因为某个主尺寸值附近恰好存在 ± 符号或上下偏差文字，就默认它们属于同一个标注；必须确认它们共享同一尺寸线、同一引出线或同一箭头关系。",
    "anchor_hint 应优先表示该标注对应的数值文字位置，而不是几何附着点。",
    "anchor_hint 必须与 value 一一对应：如果 value 是某个具体数字，锚点就必须贴近那个数字文字本身，而不是附近其他数字。",
    "如果主尺寸值与公差、上下偏差或标准误差属于同一个文字组，anchor_hint 应尽量落在这组文字中心附近。",
    "如果只有主尺寸值清晰可见，anchor_hint 就贴近主尺寸值文字。",
    "如果数值文字清晰可见，不要把 anchor_hint 强行移到箭头尖端、尺寸线中点或角度弧线中部。",
    "对于角度标注，若角度数字文字清晰，anchor_hint 应优先落在角度数字附近，而不是角度弧线中部。",
    "对于线性尺寸，若尺寸数字文字清晰，anchor_hint 应优先落在与当前 value 对应的尺寸数字附近，而不是附近其他数字，也不是线性尺寸线中点。",
    "对于半径、直径或单箭头引出标注，若 R 值、Φ 值或对应公差文字清晰，anchor_hint 应优先落在这些文字附近。",
    "把文字识别出来是为了填 value、tolerance 和 source_text；确定 anchor_hint 时应优先以对应数值文字位置为准。",
    "如果某个值明显属于右侧圆孔区域、下方细长视图或左上角密集角度区域，anchor_hint 也必须留在那个局部文字附近，不要错误漂移到主视图中央。",
    "如果 10.0 和 20.0、或其他相邻数字同时出现，必须根据 value 精确选择对应那一个，不能锚在相邻数字上。",
    "如果用户在第二轮前手动新增了多个锚点，说明这些位置是首轮漏掉但人工确认存在的真实尺寸；第二轮应优先围绕这些区域补全结果。",
    "不要编造类似重复 1.0 这样的占位值。",
    "不要让很多标注重复使用同一个 anchor_hint。",
    "如果一个值中包含公差，请拆分为 value 和 tolerance。",
    "note 字段必须使用简体中文，简短描述该尺寸的位置、视图或识别判断依据。",
    "不要把所有标签都重命名为 A。应保留或分配稳定的气泡标签，例如 B1、B2、B3。",
    "view_name 建议使用简体中文，例如“主视图”、“局部视图”、“右端圆孔视图”。",
    "输出格式：",
    JSON.stringify({
      annotations: [
        {
          label: "B1",
          value: "45.3",
          tolerance: "±0.15",
          standard_error: "",
          source_text: "45.3 ±0.15",
          note: "孔位附近的竖向尺寸",
          confidence: 0.95,
          anchor_hint: { x: 0.5, y: 0.2 },
          region_type: "geometry_dimension",
          is_attached_to_part_geometry: true,
          view_name: "主视图"
        },
        {
          label: "B2",
          value: "73.5°",
          tolerance: "",
          standard_error: "",
          source_text: "(73.5°)",
          note: "参考尺寸，圆弧角度",
          confidence: 0.93,
          anchor_hint: { x: 0.42, y: 0.58 },
          region_type: "geometry_dimension",
          is_attached_to_part_geometry: true,
          view_name: "主视图"
        },
        {
          label: "B3",
          value: "R7.2",
          tolerance: "+0.2/-0.05",
          standard_error: "",
          source_text: "R7.2 +0.2 -0.05",
          note: "半径标注，上下偏差堆叠格式",
          confidence: 0.94,
          anchor_hint: { x: 0.31, y: 0.63 },
          region_type: "geometry_dimension",
          is_attached_to_part_geometry: true,
          view_name: "局部视图"
        },
        {
          label: "B4",
          value: "Φ16.05",
          tolerance: "H7",
          standard_error: "",
          source_text: "Φ16.05 H7",
          note: "直径标注带配合公差代号",
          confidence: 0.92,
          anchor_hint: { x: 0.75, y: 0.15 },
          region_type: "geometry_dimension",
          is_attached_to_part_geometry: true,
          view_name: "主视图"
        },
        {
          label: "B5",
          value: "30.0 × 4.5",
          tolerance: "",
          standard_error: "",
          source_text: "30.0 × 4.5",
          note: "复合尺寸，键槽宽×深",
          confidence: 0.91,
          anchor_hint: { x: 0.82, y: 0.38 },
          region_type: "geometry_dimension",
          is_attached_to_part_geometry: true,
          view_name: "右端圆孔视图"
        },
        {
          label: "B6",
          value: "0.08",
          tolerance: "",
          standard_error: "",
          source_text: "⌖ Φ0.08 M A B",
          note: "GD&T 位置度公差，基准 A、B",
          confidence: 0.90,
          anchor_hint: { x: 0.70, y: 0.18 },
          region_type: "geometry_gdt",
          is_attached_to_part_geometry: true,
          view_name: "主视图"
        }
      ]
    }, null, 2),
    "允许的 region_type 取值为：geometry_dimension、geometry_tolerance、geometry_gdt、title_block、revision_table、notes_block、tolerance_table、standards_block、other。",
    "annotations 中只允许出现 geometry_dimension、geometry_tolerance 和 geometry_gdt。",
    "如果不确定，就不要把该项作为气泡输出。",
    isFirstPass
      ? "如果图中存在至少一个明确可见的有效尺寸，就不要返回空 annotations。"
      : "如果第二轮发现首轮结果明显漏检，应直接补充，不要因为局部不确定而整批清空。",
    "confidence 必须是 0 到 1 之间的数值。",
    "坐标必须归一化到 0 到 1。",
    "绝对不要把气泡锚定在标题栏、备注区、修订表或公差表中。"
  ].join("\n");
}

function buildQwenPrompt(passMode = "review-pass") {
  const customPrompt = passMode === "first-pass"
    ? els.qwenFirstUserPrompt.value.trim()
    : els.qwenReviewUserPrompt.value.trim();
  return customPrompt || defaultBuildQwenPrompt(passMode);
}

function postProcessAnnotations(items) {
  const source = Array.isArray(items) ? items : [];
  return source.map((item) => {
    const v = sanitize(item.value);
    const tol = sanitize(item.tolerance);
    const se = sanitize(item.standard_error);

    // Rule 1: Angle values (ending with °) should not carry +/- deviations —
    // these are almost always cross-referenced from a nearby linear/radius dim.
    if (v.includes("°") && (tol.match(/^[+-]/) || se.match(/^[+-]/))) {
      item.tolerance = "";
      item.standard_error = "";
      item.source_text = sanitize(item.source_text).replace(/\s*[+-]\d+[\d.]*\s*\/?\s*[+-]?\d*[\d.]*/g, "").trim();
      item.note = (item.note || "") + " [自动修正：移除了可能误归属的偏差]";
      item.confidence = Math.min(Number(item.confidence || 0), 0.7);
    }

    // Rule 2: If a tolerance looks like +X/-Y but is on a non-R, non-Φ, non-numeric value, strip it
    if (tol.match(/^[+-]/) && !v.match(/^[R\u03a6\d]/)) {
      item.tolerance = "";
      item.note = (item.note || "") + " [自动修正：偏差不匹配值类型]";
    }

    // Rule 3: Flag suspiciously large R values — R400+ is rare, may be a 2→4 misread
    const rMatch = v.match(/^R(\d+(\.\d+)?)/);
    if (rMatch) {
      const rVal = parseFloat(rMatch[1]);
      if (rVal >= 400) {
        item.confidence = Math.min(Number(item.confidence || 0), 0.6);
        item.note = (item.note || "") + " [警告：R值偏大，请确认是否为2/4误读]";
      }
    }

    return item;
  });
}

function normalizeIncomingAnnotations(items) {
  const source = postProcessAnnotations(Array.isArray(items) ? items : []);
  const deduped = new Map();

  source.forEach((item) => {
    const value = sanitize(item.value);
    const tolerance = sanitize(item.tolerance);
    const x = item.anchor_hint && Number(item.anchor_hint.x);
    const y = item.anchor_hint && Number(item.anchor_hint.y);
    if (!value || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const key = `${value}|${tolerance}|${Math.round(x * 100)}|${Math.round(y * 100)}`;
    const current = deduped.get(key);
    const confidence = Number(item.confidence || 0);
    if (!current || confidence > Number(current.confidence || 0)) {
      deduped.set(key, item);
    }
  });

  return Array.from(deduped.values());
}

function looksLikeLowQualityQwenResult(items) {
  const annotations = Array.isArray(items) ? items : [];
  if (!annotations.length) {
    return false;
  }
  const onePointZeroCount = annotations.filter((item) => sanitize(item.value) === "1.0").length;
  const anchorCounts = new Map();
  annotations.forEach((item) => {
    const x = item.anchor_hint && Number(item.anchor_hint.x);
    const y = item.anchor_hint && Number(item.anchor_hint.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const key = `${Math.round(x * 100)}|${Math.round(y * 100)}`;
    anchorCounts.set(key, (anchorCounts.get(key) || 0) + 1);
  });
  const maxSameAnchor = Math.max(0, ...anchorCounts.values());
  return onePointZeroCount >= Math.ceil(annotations.length * 0.35) || maxSameAnchor >= 4;
}

async function runQwenPass(passMode = "review-pass") {
  const settings = getQwenSettings();
  const modelLabel = settings.model || currentModelLabel();
  const isFirstPass = passMode === "first-pass";
  if (!hasSavedQwenSettings()) {
    setStatus("请先保存 API 设置，再运行 Qwen。");
    return;
  }
  if (!settings.apiKey) {
    setStatus("请先填写兼容 Qwen 的 API 密钥。");
    return;
  }

  try {
    setBusy(true);
    if (isFirstPass) {
      clearAnnotations();
      clearSheetAnalysis();
      setStatus(`正在使用 ${modelLabel} 处理当前页面，执行首轮几何尺寸提取。`);
      setProgress(`正在准备 ${modelLabel} 首轮识别`, 10);
    } else {
      setStatus(`正在使用 ${modelLabel} 处理当前页面和现有气泡，执行第二轮复核。`);
      setProgress(`正在准备 ${modelLabel} 复核`, 10);
    }

    const screenshotBundle = captureScreenshotBundle();
    state.screenshots = screenshotBundle;
    const bubbleHints = compressBubbleHintsForPrompt();
    const content = [
      { type: "text", text: buildQwenPrompt(passMode) }
    ];
    if (!isFirstPass && bubbleHints.length) {
      content.push({
        type: "text",
        text: `Current bubbles:\n${JSON.stringify(bubbleHints, null, 2)}`
      });
    }
    if (isFirstPass) {
      content.push({ type: "text", text: "Image 1: original drawing page." });
      content.push({
        type: "image_url",
        image_url: {
          url: screenshotBundle ? screenshotBundle.original : els.canvas.toDataURL("image/png")
        }
      });
    } else {
      content.push({ type: "text", text: "Image 1: original drawing page." });
      content.push({
        type: "image_url",
        image_url: { url: screenshotBundle ? screenshotBundle.original : els.canvas.toDataURL("image/png") }
      });
      content.push({ type: "text", text: "Image 2: generated bubble layout only." });
      content.push({
        type: "image_url",
        image_url: { url: screenshotBundle ? screenshotBundle.generated : els.canvas.toDataURL("image/png") }
      });
      content.push({ type: "text", text: "Image 3: annotated composite with bubbles over the original drawing." });
      content.push({
        type: "image_url",
        image_url: { url: screenshotBundle ? screenshotBundle.annotated : els.canvas.toDataURL("image/png") }
      });
    }
    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
        ...qwenExtraHeaders()
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        enable_thinking: false,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: qwenSystemPrompt(passMode)
          },
          {
            role: "user",
            content
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen 请求失败：${response.status} ${errorText}`);
    }

    setProgress(
      isFirstPass ? `正在解析 ${modelLabel} 首轮结果` : `正在解析 ${modelLabel} 返回`,
      72
    );
    const data = await response.json();
    const responseContent = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(responseContent)
      ? responseContent.map((part) => part.text || "").join("\n")
      : responseContent;
    const payload = extractJsonObject(text);
    payload.annotations = normalizeIncomingAnnotations(payload.annotations);
    if (looksLikeLowQualityQwenResult(payload.annotations)) {
      throw new Error("模型返回了低质量的重复标注；请优先确认当前模型为 qwen3.6-plus，必要时再切换其他视觉模型重试");
    }
    mergeQwenResults(payload);
    renumberBubbles();
    state.scanSnapshot = state.annotations.map((item) => structuredClone(item));
    setProgress(isFirstPass ? `${modelLabel} 首轮识别完成` : `${modelLabel} 复核完成`, 100);
    setStatus(
      isFirstPass
        ? `${modelLabel} 首轮识别已完成。下一步请检查初始气泡，手动调整不满意的地方，然后再次运行 Qwen。`
        : `${modelLabel} 复核已完成。系统已尽量保留现有气泡，补充遗漏项，并更新图纸级公差或标准信息。你可以继续修正并再次复跑。`
    );
  } catch (error) {
    console.error(error);
    setStatus(
      `${modelLabel}${isFirstPass ? " 首轮识别" : " 复核"}失败：${error.message}。请检查 API 密钥、模型名称、基础 URL 和网络连接；确认无误后，可以再次点击按钮重试。`
    );
    setProgress(`${modelLabel} 运行失败，可重新尝试`, 0);
  } finally {
    setBusy(false);
  }
}

async function scanDrawing() {
  return runQwenPass("first-pass");
}

async function runQwenReview() {
  return runQwenPass("review-pass");
}

function handleReanchorClick(event) {
  const rect = els.viewerShell.getBoundingClientRect();
  const scale = getEffectiveZoom();
  const x = ((event.clientX - rect.left) + els.viewerShell.scrollLeft) / scale;
  const y = ((event.clientY - rect.top) + els.viewerShell.scrollTop) / scale;

  if (state.addMode) {
    const annotation = createManualAnnotation();
    annotation.anchorX = clamp(x, 8, state.canvasWidth - 8);
    annotation.anchorY = clamp(y, 8, state.canvasHeight - 8);
    annotation.x = clamp(annotation.anchorX + 90, 12, state.canvasWidth - 58);
    annotation.y = clamp(annotation.anchorY + 50, 12, state.canvasHeight - 58);
    state.annotations.push(annotation);
    state.addMode = false;
    selectAnnotation(annotation.id);
    markDirty();
    updateControls();
    setStatus(`已添加 ${annotation.label} 作为用户锚点，暂时无需填写数值。再次运行 Qwen 后，模型会基于该锚点尝试补全内容。`);
    return;
  }

  if (!state.reanchorMode || !state.activeId) {
    return;
  }

  const item = getActiveAnnotation();
  if (!item) {
    return;
  }
  item.anchorX = clamp(x, 8, state.canvasWidth - 8);
  item.anchorY = clamp(y, 8, state.canvasHeight - 8);
  item.box = null;
  item.userAdjusted = true;
  if (!item.manual) {
    item.reviewSource = "manual-reanchor";
  }
  state.reanchorMode = false;
  renderAnnotations();
  markDirty();
  updateControls();
  setStatus(`已更新 ${item.label} 的锚点位置。若希望模型重新判断该气泡，请再次运行 Qwen。`);
}

function onPointerMove(event) {
  if (!state.dragging) {
    return;
  }
  const item = state.annotations.find((entry) => entry.id === state.dragging.id);
  if (!item) {
    return;
  }
  const rect = els.viewerShell.getBoundingClientRect();
  const scale = getEffectiveZoom();
  const x = ((event.clientX - rect.left) + els.viewerShell.scrollLeft) / scale;
  const y = ((event.clientY - rect.top) + els.viewerShell.scrollTop) / scale;
  item.x = clamp(x - state.dragging.dx, 8, state.canvasWidth - 54);
  item.y = clamp(y - state.dragging.dy, 8, state.canvasHeight - 54);
  item.userAdjusted = true;
  if (!item.manual) {
    item.reviewSource = "manual-move";
  }
  renderAnnotations();
  markDirty();
}

function onPointerUp() {
  state.dragging = null;
}

function toggleDropzoneState(isDragging) {
  els.dropzone.classList.toggle("dragging", isDragging);
}

els.fileInput.addEventListener("change", (event) => {
  loadFile(event.target.files[0]);
});

els.uploadBtn.addEventListener("click", () => {
  if (!hasSavedQwenSettings()) {
    setStatus("请先完成并保存 API 设置，再上传图纸。");
    return;
  }
  els.fileInput.value = "";
  els.fileInput.click();
});

els.unlockBtn.addEventListener("click", unlockPage);
els.accessCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    unlockPage();
  }
});

els.loadSampleBtn.addEventListener("click", loadSample);
els.scanBtn.addEventListener("click", scanDrawing);
els.localFallbackBtn.addEventListener("click", runLocalFallbackOcr);
els.resetBtn.addEventListener("click", resetToScanSnapshot);
els.toggleBoxesBtn.addEventListener("click", () => {
  state.showBoxes = !state.showBoxes;
  renderAnnotations();
  updateControls();
});
els.renumberBtn.addEventListener("click", renumberBubbles);
els.addBubbleBtn.addEventListener("click", addBubble);
els.deleteBubbleBtn.addEventListener("click", deleteBubble);
els.reanchorBtn.addEventListener("click", () => {
  if (!state.activeId) {
    return;
  }
  state.addMode = false;
  state.reanchorMode = !state.reanchorMode;
  updateControls();
  setStatus(state.reanchorMode ? "请在图纸任意位置点击，以设置新的锚点。" : "已取消重新锚定。");
});

els.bubbleLabel.addEventListener("input", updateSelectedBubble);
els.bubbleValue.addEventListener("input", updateSelectedBubble);
els.bubbleNote.addEventListener("input", updateSelectedBubble);

els.saveProjectBtn.addEventListener("click", saveProject);
els.restoreProjectBtn.addEventListener("click", restoreLastSave);
els.exportJsonBtn.addEventListener("click", exportJson);
els.exportCsvBtn.addEventListener("click", exportCsv);
els.exportXlsxBtn.addEventListener("click", exportXlsx);
els.runQwenBtn.addEventListener("click", runQwenReview);
els.saveQwenBtn.addEventListener("click", saveQwenSettings);
els.resetPromptsBtn.addEventListener("click", () => {
  fillPromptEditorsFromDefaults();
  setStatus("已恢复默认提示词。若要用于后续测试，请点击“保存 API 设置”。");
});

els.importJsonInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    await restoreProjectFromPayload(payload);
    setStatus("已导入完整项目 JSON 包；如果可用，也一并恢复了保存的源文件和截图。");
  } catch (error) {
    console.error(error);
    setStatus(`无法导入 JSON：${error.message}`);
  }
});

els.pageSelect.addEventListener("change", async () => {
  state.currentPage = Number(els.pageSelect.value);
  try {
    setBusy(true);
    await rerenderCurrentSource();
    clearAnnotations();
    clearSheetAnalysis();
    markDirty();
    setStatus(`已切换到第 ${state.currentPage} 页。请在此页运行 Qwen 首轮识别来生成新的气泡。`);
  } catch (error) {
    console.error(error);
    setStatus(`无法切换页码：${error.message}`);
  } finally {
    setBusy(false);
  }
});

els.zoomSelect.addEventListener("change", () => {
  state.zoom = els.zoomSelect.value === "fit" ? "fit" : Number(els.zoomSelect.value);
  updateSurfaceSize();
  updateControls();
});

els.zoomOutBtn.addEventListener("click", () => adjustZoom(-1));
els.zoomFitBtn.addEventListener("click", () => setZoom("fit"));
els.zoom100Btn.addEventListener("click", () => setZoom(1));
els.zoomInBtn.addEventListener("click", () => adjustZoom(1));
els.fullscreenBtn.addEventListener("click", toggleFullscreenViewer);

els.filterInput.addEventListener("input", () => {
  state.filterText = els.filterInput.value;
  renderTable();
  renderAnnotations();
});

els.viewerShell.addEventListener("pointermove", onPointerMove);
els.viewerShell.addEventListener("pointerup", onPointerUp);
els.viewerShell.addEventListener("pointercancel", onPointerUp);
els.viewerShell.addEventListener("click", handleReanchorClick);
els.viewerShell.addEventListener("wheel", (event) => {
  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }
  event.preventDefault();
  adjustZoom(event.deltaY > 0 ? -1 : 1);
}, { passive: false });

["dragenter", "dragover"].forEach((type) => {
  els.dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    toggleDropzoneState(true);
  });
});

["dragleave", "dragend"].forEach((type) => {
  els.dropzone.addEventListener(type, () => toggleDropzoneState(false));
});

els.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  toggleDropzoneState(false);
  loadFile(event.dataTransfer.files[0]);
});

window.addEventListener("resize", updateSurfaceSize);
document.addEventListener("fullscreenchange", updateSurfaceSize);

loadQwenSettings();
updateControls();
setProgress("就绪", 0);
setAccessState(accessUnlocked());
if (accessUnlocked()) {
  updateSurfaceSize();
} else {
  els.accessCodeInput.focus();
}
