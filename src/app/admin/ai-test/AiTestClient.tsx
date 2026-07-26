'use client';

import { useState, useEffect } from 'react';

const INTENTS = [
  { label: 'Balance (ยอดคงเหลือ)', value: 'balance', defaultText: 'ยอดคงเหลือ' },
  { label: 'Recent (รายการล่าสุด)', value: 'recent', defaultText: 'รายการล่าสุด' },
  { label: 'Summary (สรุปยอด)', value: 'summary', defaultText: 'สรุปยอดเดือนนี้' },
  { label: 'Budget (งบประมาณ)', value: 'budget', defaultText: 'งบประมาณ' },
  { label: 'Categories (หมวดหมู่)', value: 'categories', defaultText: 'มีหมวดอะไรบ้าง' },
  { label: 'Help (ช่วยเหลือ)', value: 'help', defaultText: 'ช่วยเหลือ' },
];

const DEFAULT_MODELS = [
  { label: 'Qwen3 32B (Ollama Cloud)', value: 'ollama:qwen3:32b' },
  { label: 'Qwen3 8B (Ollama Cloud)', value: 'ollama:qwen3:8b' },
  { label: 'Llama 3.2 3B (Ollama Cloud)', value: 'ollama:llama3.2:3b' },
  { label: 'Gemma 3 4B (Ollama Cloud)', value: 'ollama:gemma3:4b' },
  { label: 'Typhoon 2 3B (Ollama Cloud)', value: 'ollama:scb10x/llama3.2-typhoon2-3b-instruct' },
];

interface TestResult {
  response?: string;
  error?: string;
  timeMs: number;
  intent: string;
  model: string;
  data?: Record<string, unknown>;
}

export function AiTestClient() {
  const [models] = useState(DEFAULT_MODELS);
  const [intent, setIntent] = useState('summary');
  const [model, setModel] = useState('ollama:qwen3:32b');
  const [text, setText] = useState('สรุปยอดเดือนนี้');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [history, setHistory] = useState<TestResult[]>([]);

  useEffect(() => {
    const intentObj = INTENTS.find((i) => i.value === intent);
    if (intentObj) setText(intentObj.defaultText);
  }, [intent]);

  async function runTest() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/ai-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, model, text }),
      });
      const data = await res.json();
      setResult(data);
      setHistory((prev) => [data, ...prev].slice(0, 20));
    } catch (err) {
      setResult({ error: String(err), timeMs: 0, intent, model });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>AI Model Testing</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Test different AI models and intents without deploying to LINE.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#333' }}>Intent</label>
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, minWidth: 200 }}
          >
            {INTENTS.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#333' }}>Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, minWidth: 300 }}
          >
            {models.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#333' }}>User Text</label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runTest()}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
          placeholder="Type a user message..."
        />
      </div>

      <button
        onClick={runTest}
        disabled={loading}
        style={{
          padding: '10px 24px',
          borderRadius: 6,
          border: 'none',
          background: loading ? '#999' : '#0066cc',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: 24,
        }}
      >
        {loading ? '⏳ Running...' : '▶ Test Intent'}
      </button>

      {/* Result */}
      {result && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13, color: '#666' }}>
            <span>⏱ {result.timeMs}ms</span>
            <span>Intent: {result.intent}</span>
            <span>Model: {result.model}</span>
          </div>

          {result.error ? (
            <div style={{ padding: 16, borderRadius: 8, background: '#fff0f0', border: '1px solid #fcc', color: '#c00', whiteSpace: 'pre-wrap', fontSize: 14 }}>
              {result.error}
            </div>
          ) : (
            <div style={{ padding: 16, borderRadius: 8, background: '#f6f8fa', border: '1px solid #e1e4e8', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>
              {result.response}
            </div>
          )}
        </div>
      )}

      {/* Data preview */}
      {result?.data && (
        <details style={{ marginBottom: 24 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: '#666', marginBottom: 8 }}>Query Data (JSON)</summary>
          <pre style={{ padding: 12, borderRadius: 6, background: '#f0f0f0', fontSize: 12, overflow: 'auto', maxHeight: 300 }}>
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </details>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>History ({history.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h, i) => (
              <div key={i} style={{ padding: '8px 12px', borderRadius: 6, background: '#fafafa', border: '1px solid #eee', fontSize: 12 }}>
                <span style={{ color: '#666' }}>{h.intent}</span>
                {' · '}
                <span style={{ color: '#999' }}>{h.model.split(':')[0]}</span>
                {' · '}
                <span style={{ fontWeight: 600 }}>{h.timeMs}ms</span>
                {h.error ? (
                  <span style={{ color: '#c00' }}> ❌ {h.error.slice(0, 80)}</span>
                ) : (
                  <span> {h.response?.slice(0, 100).replace(/\n/g, ' ')}...</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
