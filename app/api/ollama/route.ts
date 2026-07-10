import { NextRequest, NextResponse } from 'next/server';

// NOTE: If Zey Vault is deployed on Vercel, OLLAMA_HOST must be a *publicly reachable*
// address (e.g. a Cloudflare Tunnel / ngrok / Tailscale Funnel URL pointed at the Termux
// instance). "http://localhost:11434" or a bare LAN IP (192.168.x.x) only works when this
// app itself runs on the same machine/network as Ollama (e.g. local `next dev`).
const OLLAMA_TIMEOUT_MS = 30000;

export async function POST(req: NextRequest) {
  try {
    const { prompt, model, endpoint } = await req.json();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 });
    }

    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const targetEndpoint = endpoint || `${ollamaHost.replace(/\/$/, '')}/api/generate`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'tinyllama',
          prompt,
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Ollama target node returned status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json({ success: true, response: data.response });
  } catch (error: any) {
    const cause: any = error?.cause;
    const isAbort = error?.name === 'AbortError';
    const isConnRefused = cause?.code === 'ECONNREFUSED' || /ECONNREFUSED|fetch failed/i.test(error?.message || '');
    const message = isAbort
      ? `Ollama node did not respond within ${OLLAMA_TIMEOUT_MS / 1000}s — check OLLAMA_HOST is reachable from Vercel (tunnel required, not a LAN IP)`
      : isConnRefused
      ? 'Could not reach Ollama at OLLAMA_HOST — is Termux/Ollama running and publicly exposed?'
      : error.message;

    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
      }
