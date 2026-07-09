export const metadata = {
  title: 'Zey Vault — AI File Manager',
  description: 'Cloud File Engine & Remote Model Bridge',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
