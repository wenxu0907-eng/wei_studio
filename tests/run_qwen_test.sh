#!/bin/bash
# Test script: convert PDFs to images, resize if needed, call qwen3.6-plus round 1, compare with expected
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SAMPLES_DIR="$PROJECT_DIR/samples"
EXPECTED_DIR="$PROJECT_DIR/expected"
OUTPUT_DIR="$SCRIPT_DIR/output"
mkdir -p "$OUTPUT_DIR"

# Load API key
if [ -f "$PROJECT_DIR/.env" ]; then
  export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
fi

if [ -z "${ALIBABA_API_KEY:-}" ]; then
  echo "ERROR: ALIBABA_API_KEY not set. Put it in .env or export it."
  exit 1
fi

API_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
MODEL="qwen3.6-plus"
MAX_LONG_SIDE=2800  # sweet spot: 2800px balances detail and model performance

# --- System prompt (round 1, from app.js defaultQwenSystemPrompt) ---
SYSTEM_PROMPT='你是工程图纸标注提取模型。只返回合法 JSON。

【规则】
- 只提取与零件几何直接相关的尺寸（尺寸线、引出线、半径、直径、角度）
- 忽略标题栏、修订表、备注、公差表、公司信息
- 每个标注包含：label (B1, B2, ...)、value、tolerance、source_text、note（简体中文）、region_type、view_name（简体中文）、anchor_hint（归一化0-1坐标，文字中心位置）
- region_type：geometry_dimension、geometry_gdt 或 geometry_tolerance
- 公差格式：±X.X 对称、+X/-Y 非对称、h9/H7 配合代号
- 保留 R 和 Φ 前缀
- 顺序：从左到右、从上到下
- 数值准确：区分 0↔9、3↔8、5↔6'

# --- User prompt (round 1, from app.js defaultBuildQwenPrompt) ---
USER_PROMPT='从工程图纸中提取所有尺寸标注。只输出合法 JSON。

每个标注包含：label (B1, B2, ...)、value、tolerance、source_text、note（简体中文）、region_type (geometry_dimension/geometry_gdt/geometry_tolerance)、view_name（简体中文）、anchor_hint（归一化0-1坐标，文字中心位置）、confidence (0-1)。

输出格式：{"annotations":[{"label":"B1","value":"45.3","tolerance":"±0.15","source_text":"45.3 ±0.15","note":"竖向尺寸","confidence":0.95,"anchor_hint":{"x":0.5,"y":0.2},"region_type":"geometry_dimension","is_attached_to_part_geometry":true,"view_name":"主视图"}]}'

convert_pdf() {
  local pdf="$1"
  local output_png="$2"

  # Convert at 200 DPI for detail, then resize if needed
  pdftoppm -png -r 200 -singlefile "$pdf" "${output_png%.png}"

  # Get dimensions
  local dims
  dims=$(file "$output_png" | sed -n 's/.*PNG image data, \([0-9]*\) x \([0-9]*\).*/\1 \2/p')
  local w=$(echo "$dims" | cut -d' ' -f1)
  local h=$(echo "$dims" | cut -d' ' -f2)
  local long_side=$((w > h ? w : h))

  echo "  Raw: ${w}x${h}, long side: ${long_side}"

  if [ "$long_side" -gt "$MAX_LONG_SIDE" ]; then
    echo "  Resizing to fit ${MAX_LONG_SIDE}px long side..."
    # Use sips (macOS built-in) to resize
    if [ "$w" -ge "$h" ]; then
      sips --resampleWidth "$MAX_LONG_SIDE" "$output_png" --out "$output_png" > /dev/null 2>&1
    else
      sips --resampleHeight "$MAX_LONG_SIDE" "$output_png" --out "$output_png" > /dev/null 2>&1
    fi
    dims=$(file "$output_png" | sed -n 's/.*PNG image data, \([0-9]*\) x \([0-9]*\).*/\1 \2/p')
    echo "  Resized: $(echo $dims | tr ' ' 'x')"
  fi
}

call_qwen() {
  local image_path="$1"
  local output_json="$2"
  local base64_img
  base64_img=$(base64 -i "$image_path")
  local data_url="data:image/png;base64,${base64_img}"

  # Build payload via node to handle large base64
  local payload_file="/tmp/qwen_payload_$$.json"
  node -e "
    const fs = require('fs');
    const img = fs.readFileSync('$image_path');
    const b64 = img.toString('base64');
    const payload = {
      model: '$MODEL',
      enable_thinking: true,
      response_format: {type: 'json_object'},
      messages: [
        {role: 'system', content: fs.readFileSync('/dev/stdin','utf8')},
        {role: 'user', content: [
          {type: 'text', text: $(echo "$USER_PROMPT" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))")},
          {type: 'text', text: 'Image 1: original drawing page.'},
          {type: 'image_url', image_url: {url: 'data:image/png;base64,' + b64}}
        ]}
      ]
    };
    fs.writeFileSync('$payload_file', JSON.stringify(payload));
  " <<< "$SYSTEM_PROMPT"

  echo "  Calling qwen3.6-plus API..."
  local response
  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ALIBABA_API_KEY}" \
    -d @"$payload_file" \
    --max-time 120)
  rm -f "$payload_file"

  # Extract content
  local content
  content=$(echo "$response" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    if (data.error) { console.error('API Error:', JSON.stringify(data.error)); process.exit(1); }
    const rc = data.choices?.[0]?.message?.content || '';
    if (Array.isArray(rc)) {
      const textPart = rc.find(p => p.type === 'text');
      process.stdout.write(textPart ? textPart.text : '');
    } else {
      process.stdout.write(rc);
    }
  ")

  if [ $? -ne 0 ]; then
    echo "  ERROR: API call failed"
    echo "$response" > "$output_json.error"
    return 1
  fi

  echo "$content" | node -e "
    const raw = require('fs').readFileSync('/dev/stdin','utf8');
    try {
      const obj = JSON.parse(raw);
      process.stdout.write(JSON.stringify(obj, null, 2));
    } catch(e) {
      process.stdout.write(raw);
    }
  " > "$output_json"

  echo "  Result saved to $output_json"
}

compare_results() {
  local expected="$1"
  local actual="$2"
  local name="$3"

  if [ ! -f "$expected" ]; then
    echo "  [SKIP] No expected file for $name"
    return
  fi
  if [ ! -f "$actual" ]; then
    echo "  [SKIP] No actual file for $name"
    return
  fi

  node -e "
    const expected = JSON.parse(require('fs').readFileSync('$expected','utf8'));
    const actual = JSON.parse(require('fs').readFileSync('$actual','utf8'));

    const expAnns = expected.annotations || [];
    const actAnns = actual.annotations || [];

    console.log('  Expected: ' + expAnns.length + ' annotations');
    console.log('  Actual:   ' + actAnns.length + ' annotations');

    // Normalize value for comparison
    function normVal(v) {
      return (v||'').replace(/\s+/g,'').replace(/[（）()]/g,'').replace(/[Øø]/g,'Φ').replace(/φ/gi,'Φ').toLowerCase();
    }

    // Normalize tolerance: '+0.1/-0.1' => '±0.1', '+0.4/0' => '+0.4'
    function normTol(t) {
      t = (t||'').replace(/\\s+/g,'');
      // +X/-X => ±X
      const symm = t.match(/^\\+([\\d.]+)\\/-\\1$/);
      if (symm) return '±' + symm[1];
      // +X/0 => +X
      const pos = t.match(/^\\+([\\d.]+)\\/0$/);
      if (pos) return '+' + pos[1];
      // 0/-X => -X
      const neg = t.match(/^0\\/-([\\d.]+)$/);
      if (neg) return '-' + neg[1];
      return t.toLowerCase();
    }

    // Fuzzy degree match: 106.84° ~ 106.8°
    function degreeMatch(a, b) {
      const da = a.match(/^([\\d.]+)°?\$/);
      const db = b.match(/^([\\d.]+)°?\$/);
      if (da && db) return Math.abs(parseFloat(da[1]) - parseFloat(db[1])) < 0.15;
      return false;
    }

    // Fuzzy numeric match: 72.9 ~ 73.0 (within 0.2)
    function numericClose(a, b) {
      const na = parseFloat(a.replace(/[^\\d.]/g,''));
      const nb = parseFloat(b.replace(/[^\\d.]/g,''));
      if (isNaN(na) || isNaN(nb)) return false;
      // Must have same prefix (R, Φ, etc)
      const pa = a.replace(/[\\d.°]/g,'');
      const pb = b.replace(/[\\d.°]/g,'');
      if (pa !== pb) return false;
      return Math.abs(na - nb) <= 0.2;
    }

    // Match expected values to actual (1:1, greedy)
    let matched = 0, fuzzyMatched = 0, missed = [], extra = [];
    const usedActual = new Set();
    // Pass 1: exact matches
    for (let ei = 0; ei < expAnns.length; ei++) {
      const nv = normVal(expAnns[ei].value);
      for (let i = 0; i < actAnns.length; i++) {
        if (usedActual.has(i)) continue;
        const av = normVal(actAnns[i].value);
        if (av === nv || degreeMatch(nv, av)) { usedActual.add(i); expAnns[ei]._matched = i; matched++; break; }
      }
    }
    // Pass 2: fuzzy matches for unmatched
    for (let ei = 0; ei < expAnns.length; ei++) {
      if (expAnns[ei]._matched !== undefined) continue;
      const nv = normVal(expAnns[ei].value);
      for (let i = 0; i < actAnns.length; i++) {
        if (usedActual.has(i)) continue;
        const av = normVal(actAnns[i].value);
        if (numericClose(nv, av)) { usedActual.add(i); expAnns[ei]._matched = i; fuzzyMatched++; break; }
      }
    }
    for (const ev of expAnns) {
      if (ev._matched === undefined) missed.push(ev.value);
    }
    for (let i = 0; i < actAnns.length; i++) {
      if (!usedActual.has(i)) extra.push(actAnns[i].value);
    }

    const total = expAnns.length;
    const totalMatch = matched + fuzzyMatched;
    console.log('  Exact:    ' + matched + '/' + total + ' (' + (100*matched/total).toFixed(0) + '%)');
    if (fuzzyMatched) console.log('  Fuzzy:    +' + fuzzyMatched + ' (within 0.2)');
    console.log('  Total:    ' + totalMatch + '/' + total + ' (' + (100*totalMatch/total).toFixed(0) + '%)');
    if (missed.length) console.log('  MISSED:   ' + missed.join(', '));
    if (extra.length) console.log('  EXTRA:    ' + extra.join(', '));

    // Tolerance accuracy (using matched pairs)
    let tolMatch = 0, tolTotal = 0;
    for (const ea of expAnns) {
      if (!ea.tolerance || ea._matched === undefined) continue;
      const matchAct = actAnns[ea._matched];
      tolTotal++;
      if (normTol(matchAct.tolerance) === normTol(ea.tolerance)) tolMatch++;
      else console.log('  TOL MISMATCH: ' + ea.value + ' exp=' + ea.tolerance + ' act=' + (matchAct.tolerance||'(empty)'));
    }
    if (tolTotal) console.log('  Tolerance accuracy: ' + tolMatch + '/' + tolTotal);
  "
}

echo "========================================"
echo "Qwen 3.6-plus Round 1 Test Suite"
echo "========================================"
echo ""

for pdf in "$SAMPLES_DIR"/*.pdf; do
  name=$(basename "$pdf" .pdf)
  echo "--- $name ---"

  png_path="$OUTPUT_DIR/${name}.png"
  result_path="$OUTPUT_DIR/${name}_qwen_result.json"
  expected_path="$EXPECTED_DIR/${name}.json"

  # Step 1: Convert PDF to properly sized image
  echo "  Converting PDF to image..."
  convert_pdf "$pdf" "$png_path"

  # Step 2: Call Qwen API
  call_qwen "$png_path" "$result_path"

  # Step 3: Compare with expected
  echo "  Comparing results..."
  compare_results "$expected_path" "$result_path" "$name"

  echo ""
done

echo "========================================"
echo "All tests complete. Results in $OUTPUT_DIR"
echo "========================================"
