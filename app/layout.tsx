import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import StagingBanner from '@/components/StagingBanner';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

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

const themeInitScript = `(function(){try{var m=localStorage.getItem('banyanos.theme');if(m==='light'||m==='dark'){document.documentElement.setAttribute('data-theme',m);}else{document.documentElement.setAttribute('data-theme','light');}}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={inter.className}><ThemeProvider><Providers>{children}</Providers><StagingBanner /></ThemeProvider></body>
    </html>
  );
}
