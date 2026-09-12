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

  let shopName = pricing.shop_name || shop?.name || defaultPricingConfig.shop_name;
  if (/quickprint/i.test(shopName)) {
    shopName = defaultPricingConfig.shop_name;
  }
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
    'selected_printer',
    'photo_bw_per_page',
    'photo_bw_double_per_page',
    'photo_color_per_page',
    'photo_color_double_per_page',
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
  const db = database();
  const shopId = getCurrentShopId();

  let query = db
    .from('orders')
    .select('*')
    .eq('shop_id', shopId)
    .not('payment_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (status !== 'ALL') {
    query = query.eq('order_status', status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const existingOrders = (data || []) as Order[];
  const existingPaymentIds = new Set(existingOrders.map((o) => o.payment_id).filter(Boolean));

  // Include pending cash payments that are awaiting counter verification
  const pendingCashOrders: Order[] = [];
  if (status === 'ALL' || status === 'PENDING' || status === 'PAYMENT_VERIFICATION_PENDING') {
    try {
      const { data: pendingPayments } = await db
        .from('payments')
        .select('*')
        .eq('shop_id', shopId)
        .eq('provider', 'cash')
        .eq('status', 'PENDING')
        .is('order_id', null)
        .order('created_at', { ascending: false });

      if (Array.isArray(pendingPayments)) {
        for (const p of pendingPayments) {
          if (existingPaymentIds.has(p.id)) continue;
          const draft = p.draft_order || {};
          pendingCashOrders.push({
            id: p.id,
            shop_id: p.shop_id,
            order_number: `QP-CASH-${p.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
            payment_id: p.id,
            uploaded_file_id: p.uploaded_file_id,
            file_name: draft.file_name || 'document.pdf',
            storage_path: draft.storage_path || '',
            file_type: 'application/pdf',
            file_size_bytes: 0,
            page_count: draft.page_count || 1,
            paper_size: draft.paper_size || 'A4',
            color_mode: draft.color_mode || 'BW',
            print_sides: draft.print_sides || 'SINGLE',
            copies: draft.copies || 1,
            add_ons: draft.add_ons || {},
            per_page_rate: draft.per_page_rate || 0,
            print_subtotal: draft.print_subtotal || p.amount,
            addons_subtotal: draft.addons_subtotal || 0,
            total_amount: p.amount,
            currency: p.currency || 'INR',
            pricing_snapshot: draft.pricing_snapshot || {},
            payment_method: 'CASH',
            payment_status: 'AWAITING_VERIFICATION',
            order_status: 'PAYMENT_VERIFICATION_PENDING',
            customer_name: draft.customer_name,
            customer_phone: draft.customer_phone,
            customer_notes: draft.customer_notes,
            transaction_ref: p.payment_reference,
            created_at: p.created_at,
            updated_at: p.updated_at,
          } as Order);
        }
      }
    } catch (err) {
      console.warn('Pending cash query warning:', err);
    }
  }

  return [...pendingCashOrders, ...existingOrders];
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  _actor = 'ADMIN',
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

export interface ShopPrinterItem {
  id?: string;
  name: string;
  status: string;
  is_selected: boolean;
  last_seen?: string;
}

export async function recordAgentHeartbeat(
  agentId: string,
  printerName: string,
  systemInfo: string,
  mode: 'live' | 'sandbox',
  installedPrinters?: string[],
  printerDetails?: Array<{ name: string; status: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN' }>
): Promise<{ activePrinter: string }> {
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

  // Check if shop has a customized selected printer
  const { data: settings, error: settingsError } = await db
    .from('shop_settings')
    .select('pricing')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (settingsError) throw settingsError;
  const configuredPrinter = settings?.pricing?.selected_printer;
  const activePrinter =
    configuredPrinter && typeof configuredPrinter === 'string' && !isVirtualSystemPrinter(configuredPrinter)
      ? configuredPrinter.trim()
      : printerName;

  const { error: agentError } = await db.from('print_agents').upsert({
    agent_id: agentId,
    shop_id: shopId,
    device_name: agentId,
    // Only the agent can report which selection it has actually applied.
    printer_name: printerName,
    system_info: systemInfo,
    mode,
    status: 'ONLINE',
    last_heartbeat: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (agentError) throw agentError;

  const nowIso = new Date().toISOString();
  const discoveredNames = new Set<string>();

  if (Array.isArray(installedPrinters)) {
    for (const name of installedPrinters) {
      if (typeof name === 'string' && name.trim()) {
        const trimmed = name.trim();
        if (!isVirtualSystemPrinter(trimmed)) {
          discoveredNames.add(trimmed);
        }
      }
    }
  }
  if (!Array.isArray(installedPrinters) && printerName && !isVirtualSystemPrinter(printerName.trim())) {
    discoveredNames.add(printerName.trim());
  }

  if (discoveredNames.size > 0) {
    const { error: printerError } = await db.from('printers').upsert(
      [...discoveredNames].map((name) => ({
        shop_id: shopId,
        agent_id: agentId,
        name,
        system_identifier: name,
        status: printerDetails?.find((p) => p.name === name)?.status || 'UNKNOWN',
        last_seen: nowIso,
        updated_at: nowIso,
      })),
      { onConflict: 'shop_id,system_identifier' }
    );
    if (printerError) throw printerError;
  }

  // A complete successful scan retires missing devices from this agent only.
  // Keep their last_seen unchanged so the UI can show when they disappeared.
  if (Array.isArray(installedPrinters)) {
    const { data: previous, error: previousError } = await db.from('printers')
      .select('id, name').eq('shop_id', shopId).eq('agent_id', agentId);
    if (previousError) throw previousError;
    const missing = (previous || []).filter((p) => !discoveredNames.has(p.name)).map((p) => p.id);
    if (missing.length) {
      const { error } = await db.from('printers').update({ status: 'OFFLINE', updated_at: nowIso })
        .eq('shop_id', shopId).eq('agent_id', agentId).in('id', missing);
      if (error) throw error;
    }
  }

  return { activePrinter };
}

export function isVirtualSystemPrinter(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return true;
  const lower = name.toLowerCase().trim();
  if (!lower) return true;
  return (
    lower.includes('onenote') ||
    lower === 'sandbox simulation' || lower === 'unavailable' ||
    lower.includes('xps document writer') ||
    lower.includes('print to pdf') ||
    lower === 'fax' ||
    lower.includes('root print queue') ||
    lower.includes('send to onenote')
  );
}

export async function getShopPrinters(): Promise<{
  printers: ShopPrinterItem[];
  activePrinter: string | null;
  agentOnline: boolean;
  agentMode: string | null;
  appliedPrinter: string | null;
  selectionPending: boolean;
}> {
  const db = database();
  const shopId = getCurrentShopId();

  const { data: settings, error: settingsError } = await db
    .from('shop_settings')
    .select('pricing')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (settingsError) throw settingsError;
  const configured = settings?.pricing?.selected_printer;
  const selectedPrinter = !isVirtualSystemPrinter(configured) ? configured : null;

  const { data: agent, error: agentError } = await db
    .from('print_agents')
    .select('printer_name, status, last_heartbeat, mode')
    .eq('shop_id', shopId)
    .order('last_heartbeat', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (agentError) throw agentError;
  const isAgentOnline = Boolean(
    agent?.status === 'ONLINE' &&
    agent?.last_heartbeat &&
    Date.now() - new Date(agent.last_heartbeat).getTime() < 90000
  );

  const appliedPrinter = !isVirtualSystemPrinter(agent?.printer_name) ? agent?.printer_name : null;
  const activePrinter = selectedPrinter || appliedPrinter || null;

  const { data: rawPrinters, error } = await db
    .from('printers')
    .select('id, name, status, last_seen')
    .eq('shop_id', shopId)
    .order('name', { ascending: true });

  if (error) throw error;

  const list: ShopPrinterItem[] = (rawPrinters || [])
    .filter((p: any) => !isVirtualSystemPrinter(p.name))
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      status: !isAgentOnline || !p.last_seen || Date.now() - new Date(p.last_seen).getTime() >= 90000
        ? 'OFFLINE' : p.status,
      is_selected: Boolean(activePrinter && p.name === activePrinter),
      last_seen: p.last_seen,
    }));

  if (activePrinter && !isVirtualSystemPrinter(activePrinter) && !list.some((p) => p.name === activePrinter)) {
    list.unshift({
      name: activePrinter,
      status: 'UNKNOWN',
      is_selected: true,
    });
  }

  return { printers: list, activePrinter, agentOnline: isAgentOnline,
    agentMode: agent?.mode || null, appliedPrinter: appliedPrinter || null,
    selectionPending: Boolean(activePrinter && (!isAgentOnline || activePrinter !== appliedPrinter)) };
}

export async function deleteShopPrinter(printerName: string): Promise<void> {
  const db = database();
  const shopId = getCurrentShopId();
  const target = printerName?.trim();
  if (!target) return;

  await db
    .from('printers')
    .delete()
    .eq('shop_id', shopId)
    .ilike('name', target);

  const { data: settings } = await db
    .from('shop_settings')
    .select('pricing')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (settings?.pricing?.selected_printer === target) {
    const updatedPricing = {
      ...settings.pricing,
      selected_printer: null,
      updated_at: new Date().toISOString(),
    };
    await db
      .from('shop_settings')
      .upsert({ id: shopId, shop_id: shopId, pricing: updatedPricing }, { onConflict: 'id' });
  }
}

export async function setActivePrinter(printerName: string): Promise<string> {
  printerName = printerName.trim();
  if (isVirtualSystemPrinter(printerName)) throw new HttpError(400, 'Choose a physical printer.');
  const db = database();
  const shopId = getCurrentShopId();

  const { data: current, error: readError } = await db
    .from('shop_settings')
    .select('pricing')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (readError) throw readError;

  const updatedPricing = {
    ...(current?.pricing || defaultPricingConfig),
    selected_printer: printerName,
    updated_at: new Date().toISOString(),
  };

  const { error: settingsError } = await db
    .from('shop_settings')
    .upsert({ id: shopId, shop_id: shopId, pricing: updatedPricing }, { onConflict: 'id' });

  if (settingsError) throw settingsError;

  return printerName;
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
    if (!file.storage_path.startsWith('orders/') && !file.storage_path.startsWith(`${shopId}/orders/`)) {
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
