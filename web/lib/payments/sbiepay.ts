/**
 * SBIePay integration boundary.
 *
 * SBIePay's public pages confirm that UPI is available, but the merchant
 * initiation, encryption, callback and verification contract is available
 * only after merchant onboarding. Do not add an endpoint or cipher here until
 * SBI supplies that official merchant integration kit.
 */
export function isSbiEpayConfigured() {
  return false;
}

export function sbiEpayNotReadyMessage() {
  return 'Online payment is temporarily unavailable while SBIePay merchant integration is being configured. Please pay by cash or contact the shop.';
}
