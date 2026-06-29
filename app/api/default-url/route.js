export async function GET() {
  return Response.json({ url: process.env.DEFAULT_URL || 'https://www.city.izumiotsu.lg.jp/index.html' });
}
