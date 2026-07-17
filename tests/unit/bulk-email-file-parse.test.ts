import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { isEmailAddress, parseEmailsFromBuffer } from '@/lib/bulk-email-file-parse';

function bufferFromRows(rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('isEmailAddress', () => {
  it('accepts a well-formed email', () => {
    expect(isEmailAddress('a@example.com')).toBe(true);
  });

  it('rejects a plain string', () => {
    expect(isEmailAddress('not-an-email')).toBe(false);
  });
});

describe('parseEmailsFromBuffer', () => {
  it('extracts valid emails from any column/row and drops non-email cells', () => {
    const buf = bufferFromRows([
      ['Name', 'Email'],
      ['Alice', 'alice@example.com'],
      ['Bob', 'bob@example.com'],
      ['Not an email', 42],
    ]);
    expect(parseEmailsFromBuffer(buf).sort()).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('lowercases and dedupes', () => {
    const buf = bufferFromRows([['A@Example.com'], ['a@example.com']]);
    expect(parseEmailsFromBuffer(buf)).toEqual(['a@example.com']);
  });

  it('returns an empty array when no emails are present', () => {
    const buf = bufferFromRows([['x'], ['y']]);
    expect(parseEmailsFromBuffer(buf)).toEqual([]);
  });
});
