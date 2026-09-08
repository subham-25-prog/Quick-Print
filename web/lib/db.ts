import { Order, OrderStatus, PricingConfig, PrintAgentInfo } from '@/types';
import { getAdminClient } from './supabase/admin';
import { getCurrentShopId } from './shop';
import { defaultPricingConfig } from './config';
import { HttpError } from './http';
import { validatePricing } from './validation';

export function database() {
  const db = getAdminClient();
  if (!db) {
    throw new HttpError(
      503,
      'The shop is not ready to accept orders. Please contact the shopkeeper.'
    );
  }
  return db;
}

export async function getActivePricing(): Promise<PricingConfig> {
  const shopId = getCurrentShopId();
  const db = database();

  const { data, error } = await db
    .from('shop_settings')
    .select('pricing')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.pricing) {
    throw new HttpError(503, 'The shopkeeper must finish setting up pricing before checkout.');
  }

  const { admin_pin: _pin, ...pricing } = data.pricing;

  const { data: shop } = await db
    .from('shops')
    .select('name, address, phone')
    .eq('id', shopId)
    .maybeSingle();

  const shopName = pricing.shop_name || shop?.name || defaultPricingConfig.shop_name;
  const shopAddress = pricing.shop_address || shop?.address || defaultPricingConfig.shop_address;
  const shopPhone = pricing.shop_phone || shop?.phone || defaultPricingConfig.shop_phone;

  return validatePricing({
    ...defaultPricingConfig,
    ...pricing,
    shop_name: shopName,
    shop_address: shopAddress,
    shop_phone: shopPhone,
  });
}

export async function updatePricing(patch: Partial<PricingConfig>): Promise<PricingConfig> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new HttpError(400, 'Invalid pricing.');
  }

  const db = database();
  const shopId = getCurrentShopId();

  const { data, error: readError } = await db
    .from('shop_settings')
    .select('pricing')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (readError) throw readError;

  const allowedKeys = new Set([
    ...Object.keys(defaultPricingConfig),
    'shop_name',
    'shop_slug',
    'shop_phone',
    'shop_address',
    'enabled_papers',
    'enabled_addons',
    'custom_papers',
    'custom_addons',
    'form_fields',
  ]);

  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) => allowedKeys.has(key) && key !== 'admin_pin')
  );

  const updatedPricing = validatePricing({
    ...defaultPricingConfig,
    ...data?.pricing,
    ...cleanPatch,
    updated_at: new Date().toISOString(),
  });

  const { error: upsertError } = await db.from('shop_settings').upsert({
    id: shopId,
    shop_id: shopId,
    pricing: updatedPricing,
    updated_at: new Date().toISOString(),
  });

  if (upsertError) throw upsertError;

  // Sync shop identity back to shops table for multi-surface consistency
  if (cleanPatch.shop_name || cleanPatch.shop_address || cleanPatch.shop_phone) {
    const shopUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (cleanPatch.shop_name) shopUpdate.name = cleanPatch.shop_name;
    if (cleanPatch.shop_address) shopUpdate.address = cleanPatch.shop_address;
    if (cleanPatch.shop_phone) shopUpdate.phone = cleanPatch.shop_phone;

    await db.from('shops').update(shopUpdate).eq('id', shopId);
  }

  return updatedPricing;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data, error } = await database()
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('shop_id', getCurrentShopId())
    .maybeSingle();

  if (error) throw error;
  return data as Order | null;
}

export async function getAllOrders(status = 'ALL'): Promise<Order[]> {
  let query = database()
    .from('orders')
    .select('*')
    .eq('shop_id', getCurrentShopId())
    .not('payment_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (status !== 'ALL') {
    query = query.eq('order_status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Order[];
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  actor = 'ADMIN',
  extra: Record<string, unknown> = {}
): Promise<Order> {
  const db = database();
  const shopId = getCurrentShopId();

  const updateData: Record<string, unknown> = {
    order_status: status,
    updated_at: new Date().toISOString(),
    ...extra,
  };

  const { data, error } = await db
    .from('orders')
    .update(updateData)
    .eq('id', id)
    .eq('shop_id', shopId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Order;
}

export async function claimNextPrintJob(agentId: string) {
  const db = database();
  const shopId = getCurrentShopId();

  const { data, error } = await db.rpc('claim_print_job', {
    p_shop_id: shopId,
    p_agent_id: agentId,
  });

  if (error) throw error;

  const job = data?.[0];
  if (!job) {
    return { success: true, job: null };
  }

  const order = await getOrderById(job.order_id);
  if (!order) {
    throw new Error('Claimed order missing');
  }

  return {
    success: true,
    job: {
      ...job,
      order_number: order.order_number,
      file_name: order.file_name,
      file_type: 'application/pdf',
      download_url: `/api/orders/${order.id}/file`,
      page_count: order.page_count,
      copies: order.copies,
      paper_size: order.paper_size,
      color_mode: order.color_mode,
      print_sides: order.print_sides,
      job_id: job.id,
    },
  };
}

export async function recordAgentHeartbeat(
  agentId: string,
  printerName: string,
  systemInfo: string,
  mode: 'live' | 'sandbox'
) {
  const db = database();
  const shopId = getCurrentShopId();

  const { data: existing, error: lookupError } = await db
    .from('print_agents')
    .select('shop_id')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing && existing.shop_id !== shopId) {
    throw new HttpError(403, 'Agent belongs to another shop.');
  }

  const { error: agentError } = await db.from('print_agents').upsert({
    agent_id: agentId,
    shop_id: shopId,
    device_name: agentId,
    printer_name: printerName,
    system_info: systemInfo,
    mode,
    status: 'ONLINE',
    last_heartbeat: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (agentError) throw agentError;

  const { error: printerError } = await db.from('printers').upsert(
    {
      shop_id: shopId,
      agent_id: agentId,
      name: printerName,
      system_identifier: printerName,
      status: 'UNKNOWN',
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'shop_id,system_identifier' }
  );

  if (printerError) throw printerError;
}

export async function getPrintAgentInfo(
  agentId = process.env.PRINT_AGENT_ID || 'agent-main-pc'
): Promise<PrintAgentInfo | null> {
  const { data, error } = await database()
    .from('print_agents')
    .select('*')
    .eq('agent_id', agentId)
    .eq('shop_id', getCurrentShopId())
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const isStale = Date.now() - Date.parse(data.last_heartbeat) > 90000;
  return {
    ...data,
    status: isStale ? 'OFFLINE' : data.status,
  };
}

export async function cleanupOldOrders(retentionDays = 3) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 30) {
    throw new HttpError(400, 'Retention must be 1–30 days.');
  }

  const db = database();
  const shopId = getCurrentShopId();
  let deletedCount = 0;

  const { data: files, error } = await db.rpc('claim_retention_files', {
    p_shop_id: shopId,
    p_days: retentionDays,
  });

  if (error) throw error;

  for (const file of files || []) {
    if (!file.storage_path.startsWith(`${shopId}/orders/`)) {
      throw new Error('Invalid retained file path');
    }

    const { error: storageError } = await db.storage
      .from('shop-documents')
      .remove([file.storage_path]);
    if (storageError) throw storageError;

    const { error: dbError } = await db
      .from('uploaded_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', file.id)
      .eq('shop_id', shopId);
    if (dbError) throw dbError;

    deletedCount++;
  }

  return { deletedCount };
}
