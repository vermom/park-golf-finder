import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '파크골프 대회 찾기',
  description: '전국 파크골프대회의 일정과 접수 정보를 한눈에 확인합니다.',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/favicon.svg` },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
