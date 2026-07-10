import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, VAULT_BUCKET } from '@/lib/supabase';

// NOTE: Vercel serverless functions cap request body size (Hobby ~4.5MB, Pro ~50MB default).
// Large multi-GB GGUF uploads routed through this handler may fail — consider a direct
// client -> Supabase resumable (TUS) upload path for big model files if this becomes an issue.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('filename');
    const isDownload = searchParams.get('download') === 'true';

    if (filename && isDownload) {
      const { data, error } = await supabaseAdmin.storage.from(VAULT_BUCKET).download(filename);
      if (error || !data) {
        return NextResponse.json({ success: false, error: error?.message || 'File not found' }, { status: 404 });
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const { data, error } = await supabaseAdmin.storage
      .from(VAULT_BUCKET)
      .list('', { sortBy: { column: 'name', order: 'asc' } });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const files = (data || [])
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(f => ({
        name: f.name,
        size: f.metadata?.size ?? 0,
        isGGUF: f.name.endsWith('.gguf'),
      }));

    return NextResponse.json({ success: true, files });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawContent = formData.get('content') as string | null;
    const rawName = formData.get('filename') as string | null;
    const customName = rawName?.trim() || null;
    const customContent = rawContent;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { data, error } = await supabaseAdmin.storage
        .from(VAULT_BUCKET)
        .upload(file.name, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });

      if (error) {
        return NextResponse.json({ success: false, error: `Upload failed: ${error.message}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: `${file.name} uploaded successfully`, path: data?.path });
    }

    if (customName && customContent !== null) {
      const { data, error } = await supabaseAdmin.storage
        .from(VAULT_BUCKET)
        .upload(customName, Buffer.from(customContent, 'utf-8'), {
          contentType: 'text/plain;charset=utf-8',
          upsert: true,
        });

      if (error) {
        return NextResponse.json({ success: false, error: `Write failed: ${error.message}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: `${customName} written successfully`, path: data?.path });
    }

    return NextResponse.json(
      { success: false, error: customName ? 'Content payload missing' : 'Filename is required' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { filename } = await req.json();
    if (!filename) {
      return NextResponse.json({ success: false, error: 'Filename missing' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.storage.from(VAULT_BUCKET).remove([filename]);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `${filename} deleted` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
                                }
