
import { theme } from '../lib/theme';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'Inter, ui-sans-serif, system-ui',
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
