#!/bin/bash
# Generate ground-truth expected JSON for a sample PDF using Claude Code.
# Usage: ./tests/generate_expected.sh samples/9081-3-GJ-3.pdf
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXPECTED_DIR="$PROJECT_DIR/expected"
OUTPUT_DIR="$SCRIPT_DIR/output"
mkdir -p "$OUTPUT_DIR" "$EXPECTED_DIR"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path-to-pdf>"
  exit 1
fi

PDF_PATH="$(cd "$PROJECT_DIR" && realpath "$1")"
NAME=$(basename "$PDF_PATH" .pdf)
PNG_PATH="$OUTPUT_DIR/${NAME}.png"
EXPECTED_PATH="$EXPECTED_DIR/${NAME}.json"

MAX_LONG_SIDE=2800

# Step 1: Convert PDF to PNG
echo "Converting $PDF_PATH to PNG..."
pdftoppm -png -r 200 -singlefile "$PDF_PATH" "${PNG_PATH%.png}"

# Resize if needed
dims=$(file "$PNG_PATH" | sed -n 's/.*PNG image data, \([0-9]*\) x \([0-9]*\).*/\1 \2/p')
w=$(echo "$dims" | cut -d' ' -f1)
h=$(echo "$dims" | cut -d' ' -f2)
long_side=$((w > h ? w : h))
echo "  Image: ${w}x${h}, long side: ${long_side}"

if [ "$long_side" -gt "$MAX_LONG_SIDE" ]; then
  echo "  Resizing to fit ${MAX_LONG_SIDE}px..."
  if [ "$w" -ge "$h" ]; then
    sips --resampleWidth "$MAX_LONG_SIDE" "$PNG_PATH" --out "$PNG_PATH" > /dev/null 2>&1
  else
    sips --resampleHeight "$MAX_LONG_SIDE" "$PNG_PATH" --out "$PNG_PATH" > /dev/null 2>&1
  fi
fi

# Step 2: Use Claude Code to read the image and extract annotations
echo "Calling Claude Code to extract ground-truth annotations..."

SYSTEM_PROMPT="你是工程图纸标注提取模型。只返回合法 JSON。

【规则】
- 只提取与零件几何直接相关的尺寸（尺寸线、引出线、半径、直径、角度）
- 忽略标题栏、修订表、备注、公差表、公司信息
- 每个标注包含：label (B1, B2, ...)、value、tolerance、source_text、note（简体中文）、region_type、view_name（简体中文）、anchor_hint（归一化0-1坐标，文字中心位置）
- region_type：geometry_dimension、geometry_gdt 或 geometry_tolerance
- 公差格式：±X.X 对称、+X/-Y 非对称、h9/H7 配合代号
- 保留 R 和 Φ 前缀
- 顺序：从左到右、从上到下
- 数值准确：区分 0↔9、3↔8、5↔6"

USER_PROMPT="从工程图纸中提取所有尺寸标注。只输出合法 JSON。

每个标注包含：label (B1, B2, ...)、value、tolerance、source_text、note（简体中文）、region_type (geometry_dimension/geometry_gdt/geometry_tolerance)、view_name（简体中文）、anchor_hint（归一化0-1坐标，文字中心位置）、confidence (0-1)。

输出格式：
{
  \"source\": \"${NAME}.pdf\",
  \"annotations\": [
    {\"label\":\"B1\",\"value\":\"45.3\",\"tolerance\":\"±0.15\",\"source_text\":\"45.3 ±0.15\",\"note\":\"竖向尺寸\",\"confidence\":0.95,\"anchor_hint\":{\"x\":0.5,\"y\":0.2},\"region_type\":\"geometry_dimension\",\"is_attached_to_part_geometry\":true,\"view_name\":\"主视图\"}
  ]
}"

PROMPT="Read the image file at ${PNG_PATH} using the Read tool, then follow these instructions.

System context: ${SYSTEM_PROMPT}

Task: ${USER_PROMPT}

Output ONLY valid JSON, nothing else — no markdown fences, no explanation."

npx -y @anthropic-ai/claude-code \
  -p "$PROMPT" \
  --allowedTools "Read" \
  --output-format json \
  --no-session-persistence \
  --model opus \
  | node -e "
    const raw = require('fs').readFileSync('/dev/stdin','utf8');
    try {
      const wrapper = JSON.parse(raw);
      // output-format json wraps in {result:...}
      const text = wrapper.result || wrapper.content || raw;
      // Extract JSON from the text (skip any preamble)
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        process.stdout.write(JSON.stringify(obj, null, 2));
      } else {
        process.stderr.write('No JSON found in output\n');
        process.exit(1);
      }
    } catch(e) {
      // Maybe it's already the raw JSON
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        process.stdout.write(JSON.stringify(obj, null, 2));
      } else {
        process.stderr.write('Failed to parse output: ' + e.message + '\n');
        process.stderr.write(raw.slice(0, 500) + '\n');
        process.exit(1);
      }
    }
  " > "$EXPECTED_PATH"

echo "Expected JSON written to $EXPECTED_PATH"
echo "Please review and correct the output before using it as ground truth."
