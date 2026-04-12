const SAMPLE_FILE = "3910992永利版.pdf";
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const OCR_LANG = "eng";
const STORAGE_KEY = "bubble-drawing-studio-project-v1";
const QWEN_SETTINGS_KEY = "bubble-drawing-studio-qwen-settings-v1";
const ACCESS_CODE_STORAGE_KEY = "bubble-drawing-studio-access-v1";
const ACCESS_CODE_HASH = "c92bdf7fa984812a3e07f29b3ecf342f2ea5187b3601044b41d4e68cf6dafdac";

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
  runQwenBtn: document.getElementById("run-qwen-btn"),
  saveQwenBtn: document.getElementById("save-qwen-btn"),
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
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
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
}

function setProgress(label, percent) {
  els.progressCopy.textContent = label;
  els.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  els.scanState.textContent = label;
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
  els.qwenState.textContent = hasSavedQwen ? "已保存" : hasQwenKey ? "待保存" : "未配置";

  els.fileInput.disabled = state.busy;
  els.loadSampleBtn.disabled = !hasSavedQwen || state.busy;
  els.scanBtn.disabled = !hasSavedQwen || !hasSource || state.busy;
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
  els.runQwenBtn.disabled = !hasSavedQwen || !hasSource || !hasQwenKey || state.busy;
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
    model: sanitize(els.qwenModel.value) || "qwen3-vl-plus",
    baseUrl: sanitize(els.qwenBaseUrl.value).replace(/\/$/, "") || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    extraHeadersRaw: els.qwenExtraHeaders.value.trim()
  };
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

function saveQwenSettings() {
  const settings = getQwenSettings();
  if (!settings.apiKey) {
    setStatus("请先填写 API 密钥，再保存设置。");
    return;
  }
  localStorage.setItem(QWEN_SETTINGS_KEY, JSON.stringify(settings));
  updateControls();
  setStatus("已在当前浏览器中保存 Qwen API 设置。下一步请加载示例图纸或上传客户图纸。");
}

function loadQwenSettings() {
  try {
    const raw = localStorage.getItem(QWEN_SETTINGS_KEY);
    if (!raw) {
      els.qwenModel.value = "qwen3-vl-plus";
      els.qwenBaseUrl.value = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
      return;
    }
    const settings = JSON.parse(raw);
    els.qwenApiKey.value = settings.apiKey || "";
    els.qwenModel.value = settings.model || "qwen3-vl-plus";
    els.qwenBaseUrl.value = settings.baseUrl || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    els.qwenExtraHeaders.value = settings.extraHeadersRaw || "";
  } catch (error) {
    console.error(error);
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
      const chipText = item.value ? `${item.label} · ${item.value}` : `${item.label} · 用户锚点`;
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
    tag.textContent = item.value ? `${item.label} · ${item.value}` : `${item.label} · 用户锚点`;

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
    if (annotation.value) {
      const byValue = state.annotations.find((item) => item.value === annotation.value && !used.has(item.id));
      if (byValue) {
        return byValue;
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
      existing.value = sanitize(annotation.value) || existing.value;
      existing.tolerance = sanitize(annotation.tolerance);
      existing.sourceText = sanitize(annotation.source_text) || existing.sourceText || existing.value;
      existing.note = sanitize(annotation.note) || existing.note;
      existing.confidence = clamp(Number(annotation.confidence || existing.confidence || 0.9), 0, 1);
      existing.reviewSource = "qwen-3.6-review";
      existing.standardError = sanitize(annotation.tolerance || annotation.standard_error || "");
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
      value: sanitize(annotation.value) || "",
      tolerance: sanitize(annotation.tolerance),
      sourceText: sanitize(annotation.source_text) || sanitize(annotation.value),
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
      standardError: sanitize(annotation.tolerance || annotation.standard_error || "")
    });
  });

}

function qwenSystemPrompt(passMode) {
  if (passMode === "first-pass") {
    return [
      "你是一个高可靠性的机械图纸尺寸提取模型。",
      "只能返回合法 JSON。",
      "首轮任务：直接从图纸本身生成尽可能高质量的初始气泡集合。",
      "请先系统地检查零件真实视图，再考虑其他区域。",
      "优先识别那些通过尺寸线、引出线、半径标注、直径标注、角度圆弧、GD&T 框以及局部公差，明确附着在可见几何上的尺寸。",
      "必须严格忽略标题栏、修订表、备注段落、标准引用、公差表、公司信息、比例标签以及与零件几何无关的图纸文本。",
      "如果文本含糊不清，就跳过，不要臆造。",
      "不要输出填充值、重复锚点或占位尺寸。"
    ].join(" ");
  }
  return [
    "你是一个谨慎的机械图纸 OCR 复核模型。",
    "只能返回合法 JSON。",
    "第二轮任务：综合原始图纸、生成的气泡布局图以及叠加标注图，进行复核与补全。",
    "把用户手动调整过的锚点和气泡视为强纠偏信号。",
    "优先保留人工意图，补全遗漏的几何附着尺寸，并提升公差提取质量，但不要漂移到图纸元数据区域。"
  ].join(" ");
}

function buildQwenPrompt(passMode = "review-pass") {
  const isFirstPass = passMode === "first-pass";
  return [
    "只能返回 JSON。",
    isFirstPass
      ? "第一轮：直接从原始图纸中生成初始气泡集合。"
      : "第二轮：结合原始图纸、生成的气泡布局图、叠加标注图以及当前已编辑气泡，一起完成复核。",
    "气泡只用于零件视图中与几何直接相关的尺寸。",
    "绝对不要为标题栏文本、修订表、备注段落、标准表、一般公差表或公司信息生成气泡。",
    isFirstPass
      ? "先检查主视图，再检查次级视图和局部详图。尽量覆盖所有你能有把握识别的、明确附着在几何上的尺寸。"
      : "尽量保留已有的人工编辑气泡，只补充那些明显缺失且明确附着在几何上的尺寸。",
    isFirstPass
      ? "第一轮不要依赖任何现有气泡提示，必须直接从图纸几何和尺寸标注中读取。"
      : "凡是标记为 user_updated=true 或 manual=true 的当前气泡，都应被视为强人工纠偏信号；即使文本尚未填完，也要把它们的锚点当作有意图的指导。",
    isFirstPass
      ? "请按从左到右、从上到下的顺序检查图纸，但只输出那些在物理上与零件几何相连的尺寸。"
      : "请仔细比对三张输入图：原始图纸体现真实源文本，气泡布局图体现气泡意图，叠加标注图体现气泡与来源的连接关系。",
    "一个有效标注必须附着在尺寸线、引出线、半径、直径、角度或零件几何附近的公差信息上。",
    "anchor_hint 必须指向尺寸文本本身。",
    "不要编造类似重复 1.0 这样的占位值。",
    "不要让很多标注重复使用同一个 anchor_hint。",
    "如果一个值中包含公差，请拆分为 value 和 tolerance。",
    "不要把所有标签都重命名为 A。应保留或分配稳定的气泡标签，例如 B1、B2、B3。",
    "输出格式：",
    JSON.stringify({
      annotations: [
        {
          label: "B1",
          value: "22.5",
          tolerance: "±0.1",
          source_text: "22.5 ±0.1",
          note: "vertical dimension near hole",
          confidence: 0.95,
          anchor_hint: { x: 0.5, y: 0.2 },
          region_type: "geometry_dimension",
          is_attached_to_part_geometry: true,
          view_name: "main view"
        }
      ]
    }, null, 2),
    "允许的 region_type 取值为：geometry_dimension、geometry_tolerance、geometry_gdt、title_block、revision_table、notes_block、tolerance_table、standards_block、other。",
    "annotations 中只允许出现 geometry_dimension、geometry_tolerance 和 geometry_gdt。",
    "如果不确定，就不要把该项作为气泡输出。",
    "confidence 必须是 0 到 1 之间的数值。",
    "坐标必须归一化到 0 到 1。",
    "绝对不要把气泡锚定在标题栏、备注区、修订表或公差表中。"
  ].join("\n");
}

function normalizeIncomingAnnotations(items) {
  const source = Array.isArray(items) ? items : [];
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
      setStatus("正在把当前页面发送给 Qwen，执行首轮几何尺寸提取。");
      setProgress("正在准备 Qwen 首轮识别", 10);
    } else {
      setStatus("正在把当前页面和现有气泡发送给 Qwen，执行第二轮复核。");
      setProgress("正在准备 Qwen 复核", 10);
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

    setProgress(isFirstPass ? "正在解析首轮结果" : "正在解析 Qwen 返回", 72);
    const data = await response.json();
    const responseContent = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(responseContent)
      ? responseContent.map((part) => part.text || "").join("\n")
      : responseContent;
    const payload = extractJsonObject(text);
    payload.annotations = normalizeIncomingAnnotations(payload.annotations);
    if (looksLikeLowQualityQwenResult(payload.annotations)) {
      throw new Error("模型返回了低质量的重复标注；请确认当前模型为 qwen3-vl-plus 后重试");
    }
    mergeQwenResults(payload);
    renumberBubbles();
    state.scanSnapshot = state.annotations.map((item) => structuredClone(item));
    setProgress(isFirstPass ? "Qwen 首轮识别完成" : "Qwen 复核完成", 100);
    setStatus(
      isFirstPass
        ? "Qwen 首轮识别已完成。下一步请检查初始气泡，手动调整不满意的地方，然后再次运行 Qwen。"
        : "Qwen 复核已完成。系统已尽量保留现有气泡，补充遗漏项，并更新图纸级公差或标准信息。你可以继续修正并再次复跑。"
    );
  } catch (error) {
    console.error(error);
    setStatus(`${isFirstPass ? "Qwen 首轮识别" : "Qwen 复核"}失败：${error.message}`);
    setProgress("Qwen 失败", 0);
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
