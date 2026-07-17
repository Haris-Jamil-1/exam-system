// Client-safe spreadsheet email extraction — shared by every "upload a CSV/XLSX of emails" bulk
// invite UI (admin bulk teacher invite, per-class bulk student invite). Pulled out of
// teacher/students/page.tsx (its original single call site) so the same parsing/validation
// behaves identically everywhere it's offered, rather than reimplementing it per page.
import * as XLSX from 'xlsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function parseEmailsFromBuffer(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  const found: string[] = [];
  for (const row of rows) {
    for (const cell of row) {
      const v = String(cell ?? '').trim();
      if (isEmailAddress(v)) found.push(v.toLowerCase());
    }
  }
  return [...new Set(found)];
}
