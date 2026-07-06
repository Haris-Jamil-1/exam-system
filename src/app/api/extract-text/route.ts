import { NextResponse } from 'next/server';
import { getAuthUser, unauthorized, withErrorHandling } from '@/lib/api-auth';

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    let text = '';

    if (ext === 'pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(buffer);
      text = result.text as string;
    } else if (ext === 'docx' || ext === 'doc') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value as string;
    } else if (ext === 'txt' || ext === 'md' || ext === 'csv') {
      text = buffer.toString('utf-8');
    } else {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    console.error('[extract-text]', err);
    return NextResponse.json({ error: 'Failed to extract text from file' }, { status: 500 });
  }
});
