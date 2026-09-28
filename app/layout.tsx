import './globals.css';

export const metadata = {
  title: 'QA Coaching Review Center',
  description: 'Quality Assurance Coaching Follow-Up',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><div className="app-bg">{children}</div></body>
    </html>
  );
}
