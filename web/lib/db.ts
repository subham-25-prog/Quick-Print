import { Order, OrderStatus, PricingConfig, PrintAgentInfo, OrderEvent } from '@/types';
import { getAdminClient } from './supabase/admin';
import { defaultPricingConfig } from './config';
import bundledPricing from '../public/config/pricing_config.json';

import * as fs from 'fs';
import * as path from 'path';

// In-Memory fallback store for development or offline testing
class LocalMemoryStore {
  pricing: PricingConfig = { ...defaultPricingConfig, ...(bundledPricing as any) };
  orders: Map<string, Order> = new Map();
  events: OrderEvent[] = [];
  agents: Map<string, PrintAgentInfo> = new Map();
  printJobs: Map<string, { id: string; order_id: string; agent_id?: string; status: string; created_at: string }> = new Map();
  files: Map<string, Buffer> = new Map();

  constructor() {
    // Load persisted pricing if exists on disk
    try {
      const saved = readSavedPricingFile();
      if (saved) {
        this.pricing = { ...defaultPricingConfig, ...(bundledPricing as any), ...saved };
      }
    } catch (err) {
      console.warn('Could not load saved pricing_config.json:', err);
    }

    // Load persisted orders if exists on disk
    try {
      const savedOrders = readSavedOrdersFile();
      for (const o of savedOrders) {
        if (o && o.id) {
          this.orders.set(o.id, o);
        }
      }
    } catch (err) {
      console.warn('Could not load saved orders.json:', err);
    }

    // Seed initial mock agent
    this.agents.set('agent-main-pc', {
      agent_id: 'agent-main-pc',
      printer_name: 'HP LaserJet 1020',
      status: 'ONLINE',
      last_heartbeat: new Date().toISOString(),
      system_info: 'Windows 11 Pro 64-bit',
    });
  }
}

const globalForStore = globalThis as unknown as { localStore?: LocalMemoryStore };
export const localStore = globalForStore.localStore || new LocalMemoryStore();
if (process.env.NODE_ENV !== 'production') globalForStore.localStore = localStore;

/**
 * Persist uploaded document buffer to memory & local disk
 */
export function saveFileBuffer(storagePath: string, buffer: Buffer): void {
  localStore.files.set(storagePath, buffer);
  const cleanPath = storagePath.replace(/^shop-documents\//, '');
  localStore.files.set(cleanPath, buffer);

  try {
    const fullPath = path.join(process.cwd(), 'uploads', cleanPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, buffer);
  } catch (err) {
    console.error('Failed to save file to local uploads directory:', err);
  }
}

/**
 * Retrieve uploaded document buffer from memory or local disk
 */
export function getFileBuffer(storagePath: string): Buffer | null {
  if (localStore.files.has(storagePath)) {
    return localStore.files.get(storagePath)!;
  }
  const cleanPath = storagePath.replace(/^shop-documents\//, '');
  if (localStore.files.has(cleanPath)) {
    return localStore.files.get(cleanPath)!;
  }

  try {
    const fullPath = path.join(process.cwd(), 'uploads', cleanPath);
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      localStore.files.set(storagePath, buf);
      return buf;
    }
  } catch (err) {
    console.error('Failed to read file from local disk:', err);
  }

  return null;
}

function cleanUpiString(val?: string): string {
  if (!val) return '';
  return String(val).trim();
}

function cleanNameString(val?: string, defaultFallback: string = ''): string {
  if (!val) return defaultFallback;
  return String(val).trim();
}

function getPricingConfigFilePaths(): string[] {
  const cwd = process.cwd();
  const paths = new Set<string>();

  const isWebDir = path.basename(cwd) === 'web';
  const webRoot = isWebDir ? cwd : path.join(cwd, 'web');
  const projectRoot = isWebDir ? path.dirname(cwd) : cwd;

  paths.add(path.join(webRoot, 'public', 'config', 'pricing_config.json'));
  paths.add(path.join(webRoot, 'uploads', 'pricing_config.json'));
  paths.add(path.join(projectRoot, 'uploads', 'pricing_config.json'));

  return Array.from(paths);
}

function readSavedPricingFile(): any | null {
  let newestConfig: any = null;
  let newestMtime = 0;

  const candidatePaths = getPricingConfigFilePaths();

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const stats = fs.statSync(p);
        const raw = fs.readFileSync(p, 'utf8');
        if (raw && raw.trim()) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if (stats.mtimeMs > newestMtime || !newestConfig) {
              newestMtime = stats.mtimeMs;
              newestConfig = parsed;
            }
          }
        }
      }
    } catch (e) {}
  }

  return newestConfig || bundledPricing || null;
}

function writeSavedPricingFile(pricingData: PricingConfig) {
  const jsonStr = JSON.stringify(pricingData, null, 2);
  const candidatePaths = getPricingConfigFilePaths();
  for (const p of candidatePaths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, jsonStr, 'utf8');
    } catch (e) {}
  }
}

function getOrdersConfigFilePaths(): string[] {
  const cwd = process.cwd();
  const paths = new Set<string>();

  const isWebDir = path.basename(cwd) === 'web';
  const webRoot = isWebDir ? cwd : path.join(cwd, 'web');
  const projectRoot = isWebDir ? path.dirname(cwd) : cwd;

  paths.add(path.join(webRoot, 'uploads', 'orders.json'));
  paths.add(path.join(projectRoot, 'uploads', 'orders.json'));

  return Array.from(paths);
}

function readSavedOrdersFile(): Order[] {
  const candidatePaths = getOrdersConfigFilePaths();
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        if (raw && raw.trim()) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      }
    } catch (e) {}
  }
  return [];
}

function writeSavedOrdersFile(orders: Order[]) {
  const jsonStr = JSON.stringify(orders, null, 2);
  const candidatePaths = getOrdersConfigFilePaths();
  for (const p of candidatePaths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, jsonStr, 'utf8');
    } catch (e) {}
  }
}

function cleanConfigObject(saved: any): PricingConfig {
  if (!saved || typeof saved !== 'object') {
    return { ...defaultPricingConfig };
  }

  const num = (v: any, fallback: number) => {
    const n = Number(v);
    return isNaN(n) ? fallback : n;
  };

  return {
    ...defaultPricingConfig,
    ...saved,
    a4_bw_per_page: num(saved.a4_bw_per_page, defaultPricingConfig.a4_bw_per_page),
    a4_bw_double_per_page: num(saved.a4_bw_double_per_page, defaultPricingConfig.a4_bw_double_per_page ?? 4.0),
    a4_color_per_page: num(saved.a4_color_per_page, defaultPricingConfig.a4_color_per_page),
    a4_color_double_per_page: num(saved.a4_color_double_per_page, defaultPricingConfig.a4_color_double_per_page ?? 18.0),
    a3_bw_per_page: num(saved.a3_bw_per_page, defaultPricingConfig.a3_bw_per_page),
    a3_bw_double_per_page: num(saved.a3_bw_double_per_page, defaultPricingConfig.a3_bw_double_per_page ?? 8.0),
    a3_color_per_page: num(saved.a3_color_per_page, defaultPricingConfig.a3_color_per_page),
    a3_color_double_per_page: num(saved.a3_color_double_per_page, defaultPricingConfig.a3_color_double_per_page ?? 35.0),
    legal_bw_per_page: num(saved.legal_bw_per_page, defaultPricingConfig.legal_bw_per_page ?? 3.0),
    legal_bw_double_per_page: num(saved.legal_bw_double_per_page, defaultPricingConfig.legal_bw_double_per_page ?? 5.0),
    legal_color_per_page: num(saved.legal_color_per_page, defaultPricingConfig.legal_color_per_page ?? 12.0),
    legal_color_double_per_page: num(saved.legal_color_double_per_page, defaultPricingConfig.legal_color_double_per_page ?? 22.0),
    photo_paper_per_page: num(saved.photo_paper_per_page, defaultPricingConfig.photo_paper_per_page ?? 25.0),
    addon_stapling: num(saved.addon_stapling, defaultPricingConfig.addon_stapling ?? 5.0),
    addon_spiral_binding: num(saved.addon_spiral_binding, defaultPricingConfig.addon_spiral_binding ?? 30.0),
    addon_lamination: num(saved.addon_lamination, defaultPricingConfig.addon_lamination ?? 20.0),
    addon_hard_binding: num(saved.addon_hard_binding, defaultPricingConfig.addon_hard_binding ?? 120.0),
    addon_soft_binding: num(saved.addon_soft_binding, defaultPricingConfig.addon_soft_binding ?? 40.0),
    double_sided_multiplier: num(saved.double_sided_multiplier, 1.0),
    enabled_papers: saved.enabled_papers
      ? {
          a4: saved.enabled_papers.a4 !== false,
          a3: saved.enabled_papers.a3 !== false,
          legal: saved.enabled_papers.legal !== false,
          photo: saved.enabled_papers.photo !== false,
        }
      : { ...defaultPricingConfig.enabled_papers },
    enabled_addons: saved.enabled_addons
      ? {
          stapling: saved.enabled_addons.stapling !== false,
          spiralBinding: saved.enabled_addons.spiralBinding !== false,
          lamination: saved.enabled_addons.lamination !== false,
          hardBinding: saved.enabled_addons.hardBinding !== false,
          softBinding: saved.enabled_addons.softBinding === true,
        }
      : { ...defaultPricingConfig.enabled_addons },
    form_fields: saved.form_fields
      ? {
          requireCustomerName: saved.form_fields.requireCustomerName !== false,
          requireCustomerPhone: saved.form_fields.requireCustomerPhone !== false,
          allowCustomerNotes: saved.form_fields.allowCustomerNotes !== false,
          allowDoubleSided: saved.form_fields.allowDoubleSided !== false,
          allowColorPrinting: saved.form_fields.allowColorPrinting !== false,
          allowCashPayment: saved.form_fields.allowCashPayment !== false,
          allowUpiPayment: saved.form_fields.allowUpiPayment !== false,
          autoApproveUpiOrders: saved.form_fields.autoApproveUpiOrders === true,
        }
      : { ...defaultPricingConfig.form_fields },
    custom_papers: Array.isArray(saved.custom_papers) ? saved.custom_papers : [],
    custom_addons: Array.isArray(saved.custom_addons) ? saved.custom_addons : [],
    shop_name: saved.shop_name !== undefined ? saved.shop_name : defaultPricingConfig.shop_name,
    shop_upi_id: saved.shop_upi_id !== undefined ? cleanUpiString(saved.shop_upi_id) : defaultPricingConfig.shop_upi_id,
    shop_upi_name: saved.shop_upi_name !== undefined ? saved.shop_upi_name : defaultPricingConfig.shop_upi_name,
    shop_slug: saved.shop_slug !== undefined ? saved.shop_slug : defaultPricingConfig.shop_slug,
    shop_phone: saved.shop_phone !== undefined ? saved.shop_phone : defaultPricingConfig.shop_phone,
    shop_address: saved.shop_address !== undefined ? saved.shop_address : defaultPricingConfig.shop_address,
    shop_merchant_qr_image: saved.shop_merchant_qr_image !== undefined ? saved.shop_merchant_qr_image : defaultPricingConfig.shop_merchant_qr_image,
    shop_qr_mode: saved.shop_qr_mode !== undefined ? saved.shop_qr_mode : defaultPricingConfig.shop_qr_mode,
    admin_pin: saved.admin_pin !== undefined ? saved.admin_pin : defaultPricingConfig.admin_pin,
    updated_at: saved.updated_at || new Date().toISOString(),
  };
}

/**
 * Get active pricing configuration (Codebase-driven)
 */
export async function getActivePricing(): Promise<PricingConfig> {
  try {
    const saved = readSavedPricingFile();
    if (saved) {
      localStore.pricing = cleanConfigObject(saved);
      return localStore.pricing;
    }
  } catch (err) {
    console.warn('Could not read saved pricing file:', err);
  }

  localStore.pricing = cleanConfigObject(bundledPricing || defaultPricingConfig);
  return localStore.pricing;
}

/**
 * Update pricing configuration
 */
export async function updatePricing(newPricing: Partial<PricingConfig>): Promise<PricingConfig> {
  const current = await getActivePricing();

  const finalUpi = newPricing.shop_upi_id !== undefined ? cleanUpiString(newPricing.shop_upi_id) : (current.shop_upi_id || defaultPricingConfig.shop_upi_id);
  const finalUpiName = newPricing.shop_upi_name !== undefined ? newPricing.shop_upi_name : (current.shop_upi_name || defaultPricingConfig.shop_upi_name);

  const mergedRaw = {
    ...current,
    ...newPricing,
    enabled_papers: newPricing.enabled_papers ? { ...newPricing.enabled_papers } : current.enabled_papers,
    enabled_addons: newPricing.enabled_addons ? { ...newPricing.enabled_addons } : current.enabled_addons,
    form_fields: newPricing.form_fields ? { ...newPricing.form_fields } : current.form_fields,
    shop_upi_id: finalUpi,
    shop_upi_name: finalUpiName,
    updated_at: new Date().toISOString(),
  };

  localStore.pricing = cleanConfigObject(mergedRaw);

  // Write to local disk files
  writeSavedPricingFile(localStore.pricing);

  return localStore.pricing;
}


/**
 * Create a new order with pricing snapshot
 */
export async function createOrder(order: Order): Promise<Order> {
  // Always save to memory store & local disk file so it is instantly available and never vanishes
  localStore.orders.set(order.id, order);
  writeSavedOrdersFile(Array.from(localStore.orders.values()));

  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from('orders')
        .insert({
          id: order.id,
          order_number: order.order_number,
          file_name: order.file_name,
          file_url: order.file_url,
          storage_path: order.storage_path,
          file_type: order.file_type,
          file_size_bytes: order.file_size_bytes,
          page_count: order.page_count,
          paper_size: order.paper_size,
          color_mode: order.color_mode,
          print_sides: order.print_sides,
          copies: order.copies,
          add_ons: order.add_ons,
          per_page_rate: order.per_page_rate,
          print_subtotal: order.print_subtotal,
          addons_subtotal: order.addons_subtotal,
          total_amount: order.total_amount,
          currency: order.currency,
          pricing_snapshot: order.pricing_snapshot,
          payment_method: order.payment_method,
          payment_status: order.payment_status,
          order_status: order.order_status,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          customer_notes: order.customer_notes,
          transaction_ref: order.transaction_ref,
        })
        .select()
        .single();

      if (data && !error) {
        localStore.orders.set(order.id, data as Order);
        writeSavedOrdersFile(Array.from(localStore.orders.values()));
        await recordOrderEvent(order.id, null, order.order_status, 'CUSTOMER', 'Order submitted by customer');
        return data as Order;
      } else if (error) {
        console.warn('Notice saving order to Supabase:', error.message);
      }
    } catch (insertErr) {
      console.warn('Supabase order insert error:', insertErr);
    }
  }

  recordOrderEvent(order.id, null, order.order_status, 'CUSTOMER', 'Order submitted by customer');
  return order;
}

/**
 * Get order by ID
 */
export async function getOrderById(id: string): Promise<Order | null> {
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();

      if (data && !error) {
        localStore.orders.set(id, data as Order);
        return data as Order;
      }
    } catch {}
  }

  return localStore.orders.get(id) || null;
}

/**
 * Get order by order number (e.g. QP-1234)
 */
export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .single();

      if (data && !error) {
        return data as Order;
      }
    } catch {}
  }

  for (const order of Array.from(localStore.orders.values())) {
    if (order.order_number.toUpperCase() === orderNumber.toUpperCase()) {
      return order;
    }
  }
  return null;
}

/**
 * Get all orders with optional status filter
 */
export async function getAllOrders(statusFilter?: string): Promise<Order[]> {
  const admin = getAdminClient();
  const orderMap = new Map<string, Order>();

  // 1. First add all local in-memory orders
  for (const [id, order] of Array.from(localStore.orders.entries())) {
    orderMap.set(id, order);
  }

  // 2. Fetch all cloud orders from Supabase and merge
  if (admin) {
    try {
      let query = admin.from('orders').select('*').order('created_at', { ascending: false });
      if (statusFilter && statusFilter !== 'ALL') {
        query = query.eq('order_status', statusFilter);
      }
      const { data, error } = await query;
      if (data && !error) {
        for (const o of data) {
          orderMap.set(o.id, o as Order);
          localStore.orders.set(o.id, o as Order);
        }
      } else if (error) {
        console.warn('Notice querying Supabase orders:', error.message);
      }
    } catch (dbErr) {
      console.warn('Supabase getAllOrders error:', dbErr);
    }
  }

  const all = Array.from(orderMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (statusFilter && statusFilter !== 'ALL') {
    return all.filter((o) => o.order_status === statusFilter);
  }
  return all;
}

/**
 * Update order status and trigger events
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  actor: 'CUSTOMER' | 'ADMIN' | 'PRINT_AGENT' | 'SYSTEM',
  extraData?: Partial<Order>
): Promise<Order | null> {
  const current = await getOrderById(orderId);
  const prevStatus = current ? current.order_status : null;

  const updatePayload: Record<string, unknown> = {
    order_status: newStatus,
    updated_at: new Date().toISOString(),
    ...extraData,
  };

  if (newStatus === 'APPROVED' && !extraData?.approved_at) {
    updatePayload.approved_at = new Date().toISOString();
  } else if (newStatus === 'PRINTED' && !extraData?.printed_at) {
    updatePayload.printed_at = new Date().toISOString();
  }

  let finalOrder: Order | null = null;

  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .select()
        .single();

      if (data && !error) {
        finalOrder = data as Order;
      } else if (error) {
        console.warn('Notice updating order in Supabase:', error.message);
      }
    } catch (updErr) {
      console.warn('Supabase updateOrderStatus error:', updErr);
    }
  }

  if (current || finalOrder) {
    const updated: Order = {
      ...(current || {}),
      ...(finalOrder || {}),
      order_status: newStatus,
      updated_at: new Date().toISOString(),
      ...extraData,
    } as Order;

    localStore.orders.set(orderId, updated);
    writeSavedOrdersFile(Array.from(localStore.orders.values()));
    await recordOrderEvent(orderId, prevStatus, newStatus, actor, extraData?.customer_notes || `Status changed to ${newStatus}`);
    return updated;
  }

  return null;
}


/**
 * Record an order lifecycle event
 */
export async function recordOrderEvent(
  orderId: string,
  previousStatus: OrderStatus | null | undefined,
  newStatus: OrderStatus,
  actor: 'CUSTOMER' | 'ADMIN' | 'PRINT_AGENT' | 'SYSTEM',
  message?: string
): Promise<void> {
  const admin = getAdminClient();
  if (admin) {
    await admin.from('order_events').insert({
      order_id: orderId,
      previous_status: previousStatus,
      new_status: newStatus,
      actor,
      message,
    });
    return;
  }

  localStore.events.push({
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    order_id: orderId,
    previous_status: previousStatus,
    new_status: newStatus,
    actor,
    message,
    created_at: new Date().toISOString(),
  });
}

/**
 * Agent: Atomically claim next approved print job
 */
export async function claimNextPrintJob(agentId: string) {
  const admin = getAdminClient();
  if (admin) {
    // 1. Find the oldest approved order directly from orders table
    const { data: approvedOrders, error } = await admin
      .from('orders')
      .select('*')
      .eq('order_status', 'APPROVED')
      .order('created_at', { ascending: true })
      .limit(1);

    if (!error && approvedOrders && approvedOrders.length > 0) {
      const order = approvedOrders[0];

      // Mark status as PRINTING so no other agent claims it
      await admin
        .from('orders')
        .update({
          order_status: 'PRINTING',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      // Generate signed download URL for the document
      const cleanPath = (order.storage_path || '').replace(/^shop-documents\//, '');
      let downloadUrl = order.file_url || '';
      if (!downloadUrl && cleanPath) {
        const { data: signed } = await admin.storage
          .from('shop-documents')
          .createSignedUrl(cleanPath, 3600);
        downloadUrl = signed?.signedUrl || '';
      }

      return {
        success: true,
        job: {
          job_id: `job-${order.id}`,
          order_id: order.id,
          order_number: order.order_number,
          file_name: order.file_name,
          file_type: order.file_type,
          download_url: downloadUrl || `/api/orders/${order.id}/file`,
          page_count: order.page_count,
          copies: order.copies,
          paper_size: order.paper_size,
          color_mode: order.color_mode,
          print_sides: order.print_sides,
        },
      };
    }
  }

  // Fallback for local memory store
  for (const [orderId, order] of Array.from(localStore.orders.entries())) {
    if (order.order_status === 'APPROVED') {
      order.order_status = 'PRINTING';
      order.updated_at = new Date().toISOString();

      return {
        success: true,
        job: {
          job_id: `job-${order.id}`,
          order_id: order.id,
          order_number: order.order_number,
          file_name: order.file_name,
          file_type: order.file_type,
          download_url: `/api/orders/${order.id}/file`,
          page_count: order.page_count,
          copies: order.copies,
          paper_size: order.paper_size,
          color_mode: order.color_mode,
          print_sides: order.print_sides,
        },
      };
    }
  }

  return { success: true, job: null };
}

/**
 * Agent: Complete or fail print job
 */
export async function completePrintJob(
  orderId: string,
  success: boolean,
  errorMessage?: string
): Promise<boolean> {
  const newStatus: OrderStatus = success ? 'PRINTED' : 'FAILED';
  const updated = await updateOrderStatus(orderId, newStatus, 'PRINT_AGENT', {
    failure_reason: errorMessage,
    printed_at: success ? new Date().toISOString() : undefined,
  });

  return !!updated;
}

/**
 * Record agent heartbeat
 */
export async function recordAgentHeartbeat(
  agentId: string,
  printerName: string,
  systemInfo?: string
): Promise<void> {
  const admin = getAdminClient();
  if (admin) {
    await admin.from('print_agents').upsert({
      agent_id: agentId,
      printer_name: printerName,
      status: 'ONLINE',
      last_heartbeat: new Date().toISOString(),
      system_info: systemInfo,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  localStore.agents.set(agentId, {
    agent_id: agentId,
    printer_name: printerName,
    status: 'ONLINE',
    last_heartbeat: new Date().toISOString(),
    system_info: systemInfo,
  });
}

/**
 * Get print agent status
 */
export async function getPrintAgentInfo(agentId = 'agent-main-pc'): Promise<PrintAgentInfo | null> {
  const admin = getAdminClient();
  if (admin) {
    const { data } = await admin
      .from('print_agents')
      .select('*')
      .eq('agent_id', agentId)
      .single();
    if (data) return data as PrintAgentInfo;
  }

  return localStore.agents.get(agentId) || {
    agent_id: agentId,
    printer_name: 'Shop Printer',
    status: 'OFFLINE',
    last_heartbeat: new Date(Date.now() - 3600000).toISOString(),
    system_info: 'Windows 11',
  };
}

/**
 * Generate secure signed download URL for file
 */
export async function getSignedFileUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const admin = getAdminClient();
  if (admin && storagePath.startsWith('shop-documents/')) {
    const path = storagePath.replace('shop-documents/', '');
    const { data } = await admin.storage.from('shop-documents').createSignedUrl(path, expiresIn);
    if (data?.signedUrl) return data.signedUrl;
  }
  return `/api/files/preview?path=${encodeURIComponent(storagePath)}`;
}
