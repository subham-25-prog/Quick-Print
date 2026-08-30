import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const admin = getAdminClient();

  if (!admin) {
    return NextResponse.json({
      connected: false,
      mode: 'LOCAL_MEMORY',
      supabaseUrlConfigured: Boolean(supabaseUrl && !supabaseUrl.includes('placeholder')),
      message: 'Supabase credentials missing or invalid in environment variables',
    });
  }

  try {
    const { count, error } = await admin.from('orders').select('*', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json({
        connected: false,
        mode: 'LOCAL_MEMORY',
        supabaseUrlConfigured: true,
        error: error.message,
        message: `Supabase query error: ${error.message}. Ensure schema.sql was run in SQL Editor.`,
      });
    }

    return NextResponse.json({
      connected: true,
      mode: 'SUPABASE_CLOUD',
      supabaseUrlConfigured: true,
      totalCloudOrders: count || 0,
      message: 'Successfully connected to Supabase Cloud Database!',
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      mode: 'LOCAL_MEMORY',
      error: err instanceof Error ? err.message : String(err),
      message: 'Failed to connect to Supabase Cloud Database.',
    });
  }
}
