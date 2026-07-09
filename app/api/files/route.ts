import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, VAULT_BUCKET } from '@/lib/supabase';

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
    const customContent = formData.get('content') as string | null;
    const customName = formData.get('filename') as string | null;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error } = await supabaseAdmin.storage
        .from(VAULT_BUCKET)
        .upload(file.name, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: `${file.name} uploaded successfully` });
    }

    if (customName && customContent !== null) {
      const { error } = await supabaseAdmin.storage
        .from(VAULT_BUCKET)
        .upload(customName, Buffer.from(customContent, 'utf-8'), {
          contentType: 'text/plain',
          upsert: true,
        });

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: `${customName} written successfully` });
    }

    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
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
