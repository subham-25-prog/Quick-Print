import {test,expect} from '@playwright/test';
import pricing from '../public/config/pricing_config.json';
const id='00000000-0000-4000-8000-000000000003';
test('unconfigured backend fails closed and anonymous admin is redirected',async({page})=>{
  await page.goto('/');await expect(page.getByRole('button',{name:'Pay & Print',exact:false})).toBeDisabled();
  await page.goto('/admin');await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading',{name:'Admin Access Required'})).toBeVisible();
});
test('mobile upload, authoritative checkout UI, pending refresh and backend-confirmed order',async({page})=>{
  // Browser presentation contract fixtures only. No production mock payment route.
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/admin/pricing*',r=>r.fulfill({json:{checkoutEnabled:true,pricing:{...pricing,form_fields:{...pricing.form_fields,requireCustomerName:false}}}}));
  await page.route('**/api/upload',r=>r.fulfill({json:{success:true,fileInfo:{uploadId:id,uploadToken:'a'.repeat(64),fileName:'test.pdf',fileType:'application/pdf',fileSizeBytes:100,pageCount:3,storagePath:'private/test.pdf'}}}));
  await page.route('**/api/orders',r=>r.fulfill({status:201,json:{paymentId:id,accessToken:'test-token'}}));
  let verified=false;
  await page.route('**/api/payments/'+id,r=>r.fulfill({json:verified?{status:'SUCCESS',orderId:id,orderAccessToken:'test-token'}:{status:'PENDING',amount:7.5,reference:'QP-test',environment:'sandbox'}}));
  await page.route('**/api/orders/'+id,r=>r.fulfill({json:{order:{id,order_number:'QP-TEST',payment_status:'PAID',order_status:'CONFIRMED',file_name:'test.pdf',page_count:3,copies:1,paper_size:'A4',color_mode:'BW',print_sides:'SINGLE',total_amount:7.5},job:{status:'PENDING',is_test:true},agentOnline:false}}));
  await page.goto('/');await page.locator('input[type=file]').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 fixture')});
  await page.getByRole('button',{name:'Pay & Print',exact:false}).click();
  await page.getByRole('button',{name:/Pay Online/}).click();
  await expect(page).toHaveURL(/\/payment\//);
  await expect(page.getByRole('heading',{name:'Verifying Your Payment'})).toBeVisible();
  await page.reload();await expect(page.getByText('Order confirmed',{exact:false})).toHaveCount(0);
  verified=true;await expect(page).toHaveURL(/\/status\//,{timeout:15000});
  await expect(page.getByText('QP-TEST',{exact:false}).first()).toBeVisible();
  await expect(page.getByText('Shop Agent Offline (Order Queued)')).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/verified-order-mobile.png',fullPage:true});
});
test('forged return parameters never confirm payment; failed payment returns to checkout',async({page})=>{
  await page.route('**/api/payments/'+id,r=>r.fulfill({json:{status:'FAILED',reference:'QP-failed',amount:5,environment:'sandbox'}}));
  await page.goto('/payment/'+id+'?access_token=invalid&status=SUCCESS&paid=true');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Previous payment was not completed.',{exact:false})).toBeVisible();
  await expect(page.getByText('Order confirmed',{exact:false})).toHaveCount(0);
});
test('missing merchant setup disables payment even with an uploaded document',async({page})=>{
  await page.route('**/api/admin/pricing*',r=>r.fulfill({json:{pricing,checkoutEnabled:false}}));
  await page.route('**/api/upload',r=>r.fulfill({json:{success:true,fileInfo:{uploadId:id,uploadToken:'a'.repeat(64),fileName:'test.pdf',fileType:'application/pdf',fileSizeBytes:100,pageCount:3}}}));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 fixture')});
  await expect(page.getByText('Online ordering is not available yet.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Pay & Print',exact:false})).toBeDisabled();
});

test('dashboard and settings show server data without manual payment approval',async({page})=>{
  await page.addInitScript(() => localStorage.setItem('qp_admin_cached_orders', JSON.stringify([{id:'obsolete',order_number:'STALE-ORDER'}])));
  await page.route('**/api/admin/auth',r=>r.fulfill({json:{authenticated:true}}));
  await page.route('**/api/admin/db-status',r=>r.fulfill({json:{connected:true,message:'Test database'}}));
  await page.route('**/api/admin/dashboard',r=>r.fulfill({json:{stats:{today_orders:2,today_revenue:20,today_pages_submitted:4,pending_jobs:1,failed_jobs:0,review_jobs:0},orders:[],payments:[],agent:{status:'OFFLINE',printer_name:'Test printer'},printers:[]}}));
  await page.route('**/api/admin/pricing*',r=>r.fulfill({json:{pricing}}));
  await page.route('**/api/orders',r=>r.fulfill({json:{orders:[]}}));
  await page.goto('/admin');await expect(page.getByRole('heading',{name:'Orders & History'})).toBeVisible();
  await expect(page.getByText('STALE-ORDER')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Verify & Print'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true});
  await page.goto('/admin/settings');await expect(page.getByRole('heading',{name:'Customize Client Page'})).toBeVisible();
  await expect(page.getByRole('heading',{name:/Payment & Checkout Settings/})).toBeVisible();
  await page.screenshot({path:'test-results/settings-mobile.png',fullPage:true});
});
