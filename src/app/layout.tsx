import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { UserProvider } from '@/components/providers/UserProvider';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Painel de Comissões — Dovale Chaves',
  description: 'Acompanhe suas vendas e comissões em tempo real',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} h-full`}>
      <body className="h-full bg-[#f0f4f8]">
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
