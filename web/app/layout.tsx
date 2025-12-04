
import './globals.css';
import { theme } from '../lib/theme';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: theme.colors.page,
          color: theme.colors.text,
        }}
      >
        {children}
      </body>
    </html>
  );
}
