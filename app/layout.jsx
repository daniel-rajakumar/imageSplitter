import '../src/index.css';
import '../src/App.css';

export const metadata = {
  title: 'Image Splitter - Instagram Grid Maker',
  description: 'Split any image into Instagram-ready 3:4 portrait tiles. Crop, zoom, rotate, and export PNG tiles instantly in your browser.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Image Splitter',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/app-icon.svg',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
