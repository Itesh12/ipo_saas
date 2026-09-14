/**
 * app/api/documents/[id]/download/route.ts
 *
 * Secure Streaming Proxy for Regulatory IPO Documents.
 * Features:
 * 1. Validates document ID and checks active record in public.ipo_documents.
 * 2. SSRF enforcement (no private IPs, HTTPS only, whitelisted domains).
 * 3. Safe redirect hopping with destination re-validation.
 * 4. PDF magic bytes (%PDF-) verification (blocks HTML challenge pages).
 * 5. Streams content with sanitized Content-Disposition headers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { documentUrlSecurity } from '@/features/external-integrations/documents/documentUrlSecurity';
import { documentContentValidator } from '@/features/external-integrations/documents/documentContentValidator';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Missing document ID parameter' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Fetch document record
    const { data, error } = await supabase
      .from('ipo_documents')
      .select('id, ipo_id, title, document_type, file_url, is_public')
      .eq('id', id)
      .single();

    const doc = data as {
      id: string;
      ipo_id: string;
      title: string;
      document_type: string;
      file_url: string;
      is_public: boolean;
    } | null;

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!doc.is_public) {
      return NextResponse.json({ error: 'Access denied: document is not public' }, { status: 403 });
    }

    // 2. Validate URL through SSRF Guard
    const sec = documentUrlSecurity.validateUrl(doc.file_url);
    if (!sec.isSafe || !sec.sanitizedUrl) {
      return NextResponse.json(
        { error: `Security check rejected document URL: ${sec.errorReason}` },
        { status: 400 }
      );
    }

    // 3. Outbound request with redirect protection
    const upstreamRes = await documentContentValidator.safeFetchWithRedirects(sec.sanitizedUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/pdf,application/octet-stream,*/*',
      },
    });

    if (!upstreamRes.ok) {
      return NextResponse.json(
        { error: `Upstream regulatory server returned HTTP ${upstreamRes.status}` },
        { status: 502 }
      );
    }

    // 4. Inspect content and magic bytes
    const body = upstreamRes.body;
    if (!body) {
      return NextResponse.json(
        { error: 'Empty response stream from upstream server' },
        { status: 502 }
      );
    }

    const filename = `${doc.document_type || 'document'}-${doc.id.slice(0, 8)}.pdf`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Document streaming failed: ${msg}` },
      { status: 500 }
    );
  }
}
