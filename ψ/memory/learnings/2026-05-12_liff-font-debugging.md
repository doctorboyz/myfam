# Lesson: LIFF Font Size Debugging

## What

Font sizes that look fine in a normal browser (Chrome/Safari) can appear **larger inside LIFF WebView** due to different rendering engines and text scaling behaviors. We needed a systematic way to choose the right size.

## How

1. Built a `/debug/ui` page showing all UI elements at sizes 9–14px
2. User tested directly in LIFF and chose: **9px for all labels**
3. Applied changes and deployed
4. Added `text-size-adjust: 100%` to prevent WebView auto-zoom

## Key Insight

LIFF WebView respects `text-size-adjust` / `-webkit-text-size-adjust` differently than standalone browsers. Setting it to 100% on `body` prevents unexpected scaling. Also, **uniform font sizes are simpler than dynamic shrinking** and work better across all labels.

## Files

- `src/app/debug/ui/page.tsx` — debug comparison page
- `src/app/globals.css` — `text-size-adjust: 100%`

## Tags

#liff #font-size #debug #css #line #webview #typography
