#!/bin/bash
# Test AI pipeline with diverse Thai text inputs
# Usage: bash scripts/test-ai-pipeline.sh <USER_ID>

USER_ID="${1:?Usage: $0 <USER_ID>}"
BASE_URL="http://localhost:3001/api/line/sandbox"

test_text() {
  local label="$1"
  local text="$2"
  echo "========================================="
  echo "📝 TEST: $label"
  echo "   Input: $text"
  echo "-----------------------------------------"
  curl -s -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"text\",\"text\":\"$text\",\"userId\":\"$USER_ID\"}" | \
    python3 -m json.tool 2>/dev/null || echo "❌ JSON parse failed"
  echo ""
}

echo "🧪 AI Pipeline Test Suite v2"
echo "============================="
echo "User ID: $USER_ID"
echo ""

# ── 1. Intent Detection Tests ──
echo "═══ 1. INTENT DETECTION ═══"
test_text "Balance query" "ดูยอด"
test_text "Recent query" "รายการล่าสุด"
test_text "Summary query" "สรุปยอดเดือนนี้"
test_text "Help request" "บอทนี้ทำอะไรได้บ้าง"
test_text "Typo balance" "ดูยอ"
test_text "Typo recent" "ล่าสุด"

# ── 2. Expense Transactions ──
echo "═══ 2. EXPENSE TRANSACTIONS ═══"
test_text "Simple expense" "ซื้อข้าวผัด 85 บาท"
test_text "Expense with merchant" "จ่ายค่ากาแฟสตาร์บัค 159 บาท"
test_text "Expense no baht" "ค่าน้ำมัน 1500"
test_text "Expense with date context" "เมื่อวานซื้อของที่ Lotus 520 บาท"
test_text "Expense formal" "ชำระค่าไฟ 780 บาท"
test_text "Expense with merchant name" "ซื้อกาแฟ Amazon 89 บาท"

# ── 3. Income Transactions ──
echo "═══ 3. INCOME TRANSACTIONS ═══"
test_text "Simple income" "รับเงินเดือน 45000 บาท"
test_text "Transfer received" "รับโอนเงินจากเพื่อน 500 บาท"
test_text "Income with context" "ลูกค้าโอนเงินมา 2000 บาท"
test_text "Income keyword" "เงินเข้า 3500 บาท"
test_text "Income salary" "ได้โบนัส 15000"
test_text "Income freelance" "รับเงินฟรีแลนซ์ 8000 บาท"

# ── 4. Transfer Transactions ──
echo "═══ 4. TRANSFER TRANSACTIONS ═══"
test_text "Transfer: โอนเงิน" "โอนเงิน 5000 บาท"
test_text "Transfer: โอนบัญชีตัวเอง" "โอนเงินระหว่างบัญชี 3000 บาท"
test_text "Transfer: โอนไปบัญชีออม" "โอนเข้าบัญชีออม 10000 บาท"

# ── 5. Ambiguous Cases (should trigger needsConfirmation) ──
echo "═══ 5. AMBIGUOUS CASES ═══"
test_text "Ambiguous: จ่ายให้แม่" "จ่ายให้แม่ 3000 บาท"
test_text "Ambiguous: ได้เงิน" "ได้เงิน 500 บาท"
test_text "Ambiguous: โอนให้เพื่อน" "โอนให้เพื่อน 2000 บาท"

# ── 6. Edge Cases ──
echo "═══ 6. EDGE CASES ═══"
test_text "Very short (just number)" "85"
test_text "No amount" "ซื้อของที่เซเว่น"
test_text "Gibberish" "สวัสดีครับ"
test_text "Mixed Thai-English" "ซื้อ coffee 159 baht"
test_text "Large amount" "จ่ายค่าบ้าน 25000 บาท"
test_text "Very large amount" "ซื้อรถ 850000 บาท"
test_text "Small amount" "น้ำ 7 บาท"
test_text "Decimal amount" "ค่าไฟ 1234.56 บาท"

# ── 7. Typo & Variations ──
echo "═══ 7. TYPO & VARIATIONS ═══"
test_text "No baht unit" "ข้าว 50"
test_text "Mixed script" "จ่ายค่าที่จอดรถ 40THB"
test_text "Abbreviated" "ค่าน้ำ 120"
test_text "With emoji" "ซื้อข้าว 🍜 85 บาท"
test_text "Past tense" "เมื่อวานจ่ายค่าอาหาร 200 บาท"
test_text "Future context" "พรุ่งนี้จ่ายค่าประกัน 5000 บาท"

echo ""
echo "✅ Test complete!"