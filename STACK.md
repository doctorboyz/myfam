# Technology Stack

## Frontend

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 16 (App Router, Turbopack) | SSR, file-based routing, API routes in same project |
| Language | TypeScript 5 | Type safety across full stack |
| Styling | CSS Modules | Scoped styles, zero runtime, built into Next.js |
| Icons | Lucide React | Tree-shakeable, consistent icon set |
| LIFF | @line/liff | LINE Front-end Framework for in-app browser auth |
| Money | Custom `<Money>` component | Thai locale number formatting |
| Auth | Cookie-based (userId) | Simple, no JWT overhead for family app |

## Backend

| Layer | Choice | Why |
|-------|--------|-----|
| API | Next.js API Routes | Colocated with frontend, single deploy |
| ORM | Prisma 7 | Type-safe queries, migrations, seeding |
| Database | PostgreSQL 16 | ACID, JSON support, mature ecosystem |
| Container | Docker Compose | Reproducible dev/prod environment |

## AI / NLP

| Layer | Choice | Why |
|-------|--------|-----|
| Primary LLM | OpenRouter (Gemini Flash) | Intent classification + entity extraction |
| Local LLM | Ollama (fallback) | Offline capability, Thai language support |
| OCR | Tesseract (Thai + English) | Receipt/slip text extraction |
| AI Client | Custom ai-client.ts | Provider-agnostic abstraction |

## LINE Integration

| Layer | Choice | Why |
|-------|--------|-----|
| Messaging | LINE Messaging API | Webhook-based message handling |
| Auth | LINE LIFF + ID Token | Seamless in-app authentication |
| Rich UI | Flex Messages + Quick Reply | Structured bot responses |

## DevOps

| Layer | Choice | Why |
|-------|--------|-----|
| Hosting | Mac mini + Docker | Self-hosted, always-on |
| Tunnel | ngrok | Public webhook URL for LINE |
| DB Admin | Prisma Studio | Visual data browsing |
| CI | Manual (type-check + test + build) | Solo dev, no CI overhead needed |

## Key Dependencies

```json
{
  "next": "^16",
  "react": "^19",
  "@prisma/client": "^7",
  "@line/liff": "^2",
  "lucide-react": "^0.500",
  "tesseract.js": "^5",
  "chart.js": "^4",
  "date-fns": "^4",
  "zod": "^3"
}
```
