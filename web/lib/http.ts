import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(
    JSON.stringify({
      event: 'request_failed',
      type: error instanceof Error ? error.name : 'DatabaseError',
      message: error instanceof Error ? error.message : String(error),
    })
  );

  return NextResponse.json(
    { error: 'The service is temporarily unavailable. Please retry shortly.' },
    { status: 503 }
  );
}

export async function readJson(req: Request, maxBytes = 32768): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'JSON is required.');
  }

  const raw = await readText(req, maxBytes);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error();
    }
    return value;
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

export async function readText(req: Request, maxBytes: number): Promise<string> {
  const buffer = await readBytes(req, maxBytes);
  return buffer.toString('utf8');
}

export async function readBytes(req: Request, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(req.headers.get('content-length'));
  if (contentLength > maxBytes) {
    throw new HttpError(413, 'Request is too large.');
  }

  const reader = req.body?.getReader();
  if (!reader) {
    throw new HttpError(400, 'Request body is required.');
  }

  const parts: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'Request is too large.');
    }
    parts.push(value);
  }

  return Buffer.concat(parts);
}

export function requireSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const secFetchSite = req.headers.get('sec-fetch-site');

  if (secFetchSite === 'cross-site' || (origin && origin !== new URL(req.url).origin)) {
    throw new HttpError(403, 'Cross-site request rejected.');
  }
}
