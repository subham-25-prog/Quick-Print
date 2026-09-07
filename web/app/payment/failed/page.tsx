import Link from 'next/link';
export default function Failed(){return <main className="max-w-lg mx-auto p-8 space-y-4"><h1 className="text-xl font-bold">Payment not confirmed</h1><p>Open your payment status link to check or retry. If money was deducted, wait for verification before paying again.</p><Link href="/" className="text-indigo-600">Return to shop</Link></main>;}
