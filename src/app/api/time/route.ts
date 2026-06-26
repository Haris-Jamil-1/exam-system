import { NextResponse } from 'next/server';

// Returns the server's current UTC timestamp in milliseconds.
// Used by the exam client to anchor the exam timer to server time,
// avoiding skew from misconfigured client clocks.
export async function GET() {
  return NextResponse.json({ now: Date.now() });
}
