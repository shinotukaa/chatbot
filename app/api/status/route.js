export async function GET() {
  return Response.json({ ok: !!process.env.GEMINI_API_KEY });
}
