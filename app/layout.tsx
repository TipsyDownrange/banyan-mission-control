import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import StagingBanner from '@/components/StagingBanner';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BanyanOS — Mission Control',
  description: 'Kula Glass Company — Project Operations',
  icons: { icon: '/banyan-icon.png', apple: '/banyan-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#071722',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}><Providers>{children}</Providers><StagingBanner /></body>
    </html>
  );
}
