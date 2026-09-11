import type { Metadata, Viewport } from 'next';
import './globals.css';
import { shopConfig } from '@/lib/config';
import { getInitialPricing } from '@/lib/initial-pricing-server';
import { InitialPricingProvider } from '@/lib/initial-pricing';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  themeColor: '#0f172a',
};

export async function generateMetadata(): Promise<Metadata> {
  const pricing = await getInitialPricing();
  return {
    title: `${pricing.shop_name} – Self-Service Document Printing`,
    description: `${shopConfig.tagline}. Upload a document, pay securely, and track your verified print job.`,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pricing = await getInitialPricing();
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen flex flex-col font-sans">
        {/* Subtle decorative background glow */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-indigo-600/15 blur-[120px] rounded-full" />
          <div className="absolute top-1/2 -right-40 w-[400px] h-[400px] bg-purple-600/10 blur-[130px] rounded-full" />
        </div>
        <div className="relative z-10 flex-1 flex flex-col">
          <InitialPricingProvider value={pricing}>{children}</InitialPricingProvider>
        </div>
      </body>
    </html>
  );
}
