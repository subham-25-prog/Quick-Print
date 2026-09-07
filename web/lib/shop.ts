import { HttpError } from './http';

const LEGACY_DEFAULT_SHOP_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Every Vercel deployment is bound to one shop. The explicit ID also lets the
 * same codebase support a future shared deployment without trusting a browser
 * supplied shop identifier.
 */
export function getCurrentShopId() {
  if (process.env.NODE_ENV === 'production' && !process.env.QUICKPRINT_SHOP_ID) {
    throw new HttpError(503, 'Shop setup is incomplete. Set QUICKPRINT_SHOP_ID in Vercel and redeploy.');
  }
  const shopId = process.env.QUICKPRINT_SHOP_ID?.trim() || LEGACY_DEFAULT_SHOP_ID;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(shopId)) {
    throw new HttpError(503, 'Shop setup is invalid. QUICKPRINT_SHOP_ID must be a UUID.');
  }
  return shopId;
}

export { LEGACY_DEFAULT_SHOP_ID };
