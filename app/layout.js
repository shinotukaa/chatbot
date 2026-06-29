import './globals.css';

export const metadata = {
  title: '市役所AIチャットボット',
  description: '市のWebサイトをリアルタイムで検索してお答えします',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
