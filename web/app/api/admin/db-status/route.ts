import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { getCurrentShopId } from '@/lib/shop';

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    const shopId = getCurrentShopId();
    const db = database();

    const { data: shop, error } = await db
      .from('shops')
      .select('id, name')
      .eq('id', shopId)
      .single();

    if (error) throw error;

    const { data: settings } = await db
      .from('shop_settings')
      .select('pricing')
      .eq('shop_id', shopId)
      .maybeSingle();

    let shopName =
      settings?.pricing?.shop_name ||
      shop?.name ||
      process.env.NEXT_PUBLIC_SHOP_NAME ||
      'Cyber Cafe';
    if (/quickprint/i.test(shopName)) {
      shopName = process.env.NEXT_PUBLIC_SHOP_NAME || 'Cyber Cafe';
    }

    const { data: agent } = await db
      .from('print_agents')
      .select('agent_id, status, last_heartbeat, printer_name')
      .eq('shop_id', shopId)
      .order('last_heartbeat', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isAgentOnline =
      agent?.status === 'ONLINE' &&
      agent?.last_heartbeat &&
      Date.now() - new Date(agent.last_heartbeat).getTime() < 90000;

    return NextResponse.json({
      connected: true,
      mode: 'SUPABASE',
      message: 'Database connected.',
      shopName,
      agentOnline: Boolean(isAgentOnline),
      agentName: agent?.printer_name || agent?.agent_id || null,
    });
  } catch {
    return NextResponse.json({
      connected: false,
      mode: 'UNAVAILABLE',
      message: 'Database unavailable. Checkout fails closed.',
      agentOnline: false,
    });
  }
}
