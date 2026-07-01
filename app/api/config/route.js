export async function GET() {
  return Response.json({
    siteName: process.env.SITE_NAME || '市役所AIチャットボット',
    siteUrl: process.env.DEFAULT_URL || 'https://www.city.izumiotsu.lg.jp/index.html',
    welcomeMessage: process.env.WELCOME_MESSAGE || 'ご質問をどうぞ。市のWebサイトを直接調べて、丁寧にお答えします。',
    characterName: process.env.CHARACTER_NAME || '',
    characterImageUrl: process.env.CHARACTER_IMAGE_URL || '',
  });
}
