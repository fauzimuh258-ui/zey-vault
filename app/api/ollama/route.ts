import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt, model, endpoint } = await req.json();
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const targetEndpoint = endpoint || `${ollamaHost.replace(/\/$/, '')}/api/generate`;

    const response = await fetch(targetEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'tinyllama',
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama target node returned status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json({ success: true, response: data.response });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
