-- ==============================================================================
-- QuickPrint Database Schema (Supabase / PostgreSQL)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- File details
    file_name TEXT NOT NULL,
    file_url TEXT,
    storage_path TEXT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 1,
    
    -- Print options
    paper_size VARCHAR(10) NOT NULL DEFAULT 'A4',
    color_mode VARCHAR(10) NOT NULL DEFAULT 'BW',
    print_sides VARCHAR(10) NOT NULL DEFAULT 'SINGLE',
    copies INTEGER NOT NULL DEFAULT 1,
    add_ons JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Price breakdown & snapshot
    per_page_rate NUMERIC(10, 2) NOT NULL,
    print_subtotal NUMERIC(10, 2) NOT NULL,
    addons_subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    pricing_snapshot JSONB NOT NULL,
    
    -- Payment state
    payment_method VARCHAR(20) NOT NULL DEFAULT 'UPI',
    payment_status VARCHAR(40) NOT NULL DEFAULT 'AWAITING_VERIFICATION',
    
    -- Order lifecycle state
    order_status VARCHAR(40) NOT NULL DEFAULT 'PAYMENT_VERIFICATION_PENDING',
    
    -- Customer info & metadata
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    customer_notes TEXT,
    advanced_config JSONB,
    transaction_ref TEXT,
    rejection_reason TEXT,
    failure_reason TEXT,
    
    approved_at TIMESTAMP WITH TIME ZONE,
    printed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS advanced_config JSONB;

-- The web server uses the service-role key. No client may directly read or modify orders.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public update on orders" ON public.orders;

-- Intentionally no anon/authenticated policies. Service-role requests bypass RLS.

-- 3. Shop Pricing & Configuration Table (Single Source of Truth)
CREATE TABLE IF NOT EXISTS public.shop_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default_shop',
    pricing JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on shop_settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Allow public insert on shop_settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Allow public update on shop_settings" ON public.shop_settings;

-- Intentionally no anon/authenticated policies. Public pricing is exposed through a
-- server endpoint that strips any legacy sensitive fields.

-- 4. Audit log and print-agent heartbeat tables used by the server application.
CREATE TABLE IF NOT EXISTS public.order_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    previous_status VARCHAR(40),
    new_status VARCHAR(40) NOT NULL,
    actor VARCHAR(20) NOT NULL,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON public.order_events(order_id, created_at DESC);
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.print_agents (
    agent_id TEXT PRIMARY KEY,
    printer_name TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
    last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    system_info TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.print_agents ENABLE ROW LEVEL SECURITY;

-- 5. Storage Bucket for uploaded documents
INSERT INTO storage.buckets (id, name, public, file_size_limit) 
VALUES ('shop-documents', 'shop-documents', false, 104857600)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 104857600;

-- Customer files are uploaded and retrieved only through authenticated server routes.
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public customer uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow service role & signed URL reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow service role deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin access to shop documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin delete shop documents" ON storage.objects;
