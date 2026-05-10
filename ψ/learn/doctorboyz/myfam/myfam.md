# MyFam Learning Index

## Source
- **Origin**: ./origin/
- **GitHub**: https://github.com/doctorboyz/myfam

## Explorations

### 2026-05-08 1406 (default — 3 agents)
- [[2026-05-08/1406_ARCHITECTURE|Architecture]]
- [[2026-05-08/1406_CODE-SNIPPETS|Code Snippets]]
- [[2026-05-08/1406_QUICK-REFERENCE|Quick Reference]]

**Key insights**:
1. FinanceContext เป็น mega-context (~788 lines) — จุดเดียวสำหรับ state + CRUD ทั้งหมด
2. Auth ใช้ cookie-based (userId httpOnly) ไม่มี session management, CSRF, หรือ middleware guard
3. Transaction state machine: pending→completed, planned→completed, any→void — แต่ pending status เป็น dead code
4. ต้องเพิ่ม LINE Messaging API webhook + LIFF + AI slip OCR (Ollama kimi k2.6:cloud)
5. ต้องเพิ่ม input validation (Zod), pagination, error boundary