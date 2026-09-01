export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_VERIFICATION_PENDING'
  | 'APPROVED'
  | 'PRINTING'
  | 'PRINTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'FAILED';

export type PaymentMethod = 'UPI' | 'CASH';

export type PaymentStatus =
  | 'PENDING'
  | 'AWAITING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED';

export type PaperSize = 'A4' | 'A3' | 'LEGAL' | 'PHOTO' | string;

export type ColorMode = 'BW' | 'COLOR';

export type PrintSides = 'SINGLE' | 'DOUBLE';

export interface AdvancedPrintConfig {
  pageRangeMode?: 'ALL' | 'RANGE' | 'ODD' | 'EVEN';
  customPageRange?: string;
  pagesPerSheet?: '1' | '2' | '4' | 'booklet';
  pageScaling?: 'FIT' | 'ACTUAL' | 'SHRINK' | 'CUSTOM';
  customScalePercent?: number;
  orientation?: 'AUTO' | 'PORTRAIT' | 'LANDSCAPE';
  printQuality?: 'FAST_DRAFT' | 'STANDARD' | 'HIGH_QUALITY';
  watermark?: 'NONE' | 'CONFIDENTIAL' | 'DRAFT' | 'SAMPLE';
}

export interface AddOnOptions {
  stapling?: boolean;
  spiralBinding?: boolean;
  lamination?: boolean;
  hardBinding?: boolean;
  softBinding?: boolean;
  customAddons?: Record<string, boolean>;
  [key: string]: boolean | Record<string, boolean> | undefined;
}

export interface CustomPaperType {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  bw_single: number;
  bw_double: number;
  color_single: number;
  color_double: number;
}

export interface CustomAddon {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: 'per_copy' | 'per_page' | 'per_order';
  enabled: boolean;
}

export interface FormFieldsConfig {
  announcementText?: string;
  requireCustomerName?: boolean;
  showCustomerName?: boolean;
  requireCustomerPhone?: boolean;
  showCustomerPhone?: boolean;
  allowCashPayment?: boolean;
  allowUpiPayment?: boolean;
  allowColorPrinting?: boolean;
  allowDoubleSided?: boolean;
  enableNotes?: boolean;
  allowCustomerNotes?: boolean;
  autoApproveUpiOrders?: boolean;
  minOrderAmount?: number;
  urgentFee?: number;
}

export interface PricingConfig {
  id?: string;
  // Per-page rates
  a4_bw_per_page: number;
  a4_bw_double_per_page?: number;
  a4_color_per_page: number;
  a4_color_double_per_page?: number;
  a3_bw_per_page: number;
  a3_bw_double_per_page?: number;
  a3_color_per_page: number;
  a3_color_double_per_page?: number;
  legal_bw_per_page: number;
  legal_bw_double_per_page?: number;
  legal_color_per_page: number;
  legal_color_double_per_page?: number;
  photo_paper_per_page: number;
  double_sided_multiplier: number;

  // Add-on rates
  addon_stapling: number;
  addon_spiral_binding: number;
  addon_lamination: number;
  addon_hard_binding: number;
  addon_soft_binding: number;

  // Enabled switches
  enabled_papers?: {
    a4?: boolean;
    a3?: boolean;
    legal?: boolean;
    photo?: boolean;
    [key: string]: boolean | undefined;
  };
  enabled_addons?: {
    stapling?: boolean;
    spiralBinding?: boolean;
    lamination?: boolean;
    hardBinding?: boolean;
    softBinding?: boolean;
    [key: string]: boolean | undefined;
  };

  // Dynamic Custom additions
  custom_papers?: CustomPaperType[];
  custom_addons?: CustomAddon[];

  // Form customizer
  form_fields?: FormFieldsConfig;

  // Store & UPI Customization
  shop_name?: string;
  shop_upi_id?: string;
  shop_upi_name?: string;
  shop_slug?: string;
  shop_phone?: string;
  shop_address?: string;
  shop_merchant_qr_image?: string;
  shop_qr_mode?: 'DYNAMIC' | 'CUSTOM_IMAGE';
  admin_pin?: string;

  currency: string;
  updated_at?: string;
}


export interface OrderItemOptions {
  paperSize: PaperSize;
  colorMode: ColorMode;
  printSides: PrintSides;
  copies: number;
  addOns: AddOnOptions;
}

export interface PriceBreakdown {
  pageCount: number;
  copies: number;
  baseRatePerPage: number;
  effectiveRatePerPage: number;
  printSubtotal: number;
  addOnsBreakdown: {
    name: string;
    unitPrice: number;
    total: number;
  }[];
  addOnsSubtotal: number;
  totalAmount: number;
  currency: string;
}

export interface Order {
  id: string;
  order_number: string;
  created_at: string;
  updated_at: string;
  file_name: string;
  storage_path: string;
  file_url?: string;
  file_type: string;
  file_size_bytes: number;
  page_count: number;
  paper_size: PaperSize;
  color_mode: ColorMode;
  print_sides: PrintSides;
  copies: number;
  add_ons: AddOnOptions;
  per_page_rate: number;
  print_subtotal: number;
  addons_subtotal: number;
  total_amount: number;
  currency: string;
  pricing_snapshot: PricingConfig;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  customer_name?: string;
  customer_phone?: string;
  customer_notes?: string;
  transaction_ref?: string;
  rejection_reason?: string;
  failure_reason?: string;
  approved_at?: string;
  printed_at?: string;
  pickup_token?: string;
}

export interface PrintAgentInfo {
  agent_id: string;
  printer_name: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  last_heartbeat: string;
  system_info?: string;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  previous_status?: OrderStatus | null;
  new_status: OrderStatus;
  actor: 'CUSTOMER' | 'ADMIN' | 'PRINT_AGENT' | 'SYSTEM';
  message?: string;
  created_at: string;
}
