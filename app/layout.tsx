import type { Metadata, Viewport } from 'next';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: '파크골프 대회 찾기',
  description: '전국 파크골프대회의 일정과 접수 정보를 한눈에 확인합니다.',
  applicationName: '파크골프 대회 찾기',
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/icons/app-icon-192.png`,
    apple: `${basePath}/icons/app-icon-192.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '파크골프 대회',
  },
  alternates: { canonical: 'https://vermom.github.io/park-golf-finder/' },
  keywords: ['파크골프', '파크골프 대회', '전국 파크골프대회', '파크골프 접수'],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#047857',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
