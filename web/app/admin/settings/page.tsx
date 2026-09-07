'use client';
import {useEffect,useState} from 'react';
import {AdminHeader} from '@/components/admin/AdminHeader';
import {PricingConfig} from '@/types';
const rates=[['a4_bw_per_page','A4 black & white'],['a4_color_per_page','A4 color'],['a4_bw_double_per_page','A4 duplex B/W, per page'],['a4_color_double_per_page','A4 duplex color, per page'],['a3_bw_per_page','A3 black & white'],['a3_color_per_page','A3 color'],['a3_bw_double_per_page','A3 duplex B/W, per page'],['a3_color_double_per_page','A3 duplex color, per page'],['legal_bw_per_page','Legal B/W'],['legal_color_per_page','Legal color'],['legal_bw_double_per_page','Legal duplex B/W, per page'],['legal_color_double_per_page','Legal duplex color, per page'],['photo_paper_per_page','Photo (A4)']];
export default function SettingsPage(){
  const [pricing,setPricing]=useState<PricingConfig|null>(null),[setup,setSetup]=useState<any>(null),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[confirmed,setConfirmed]=useState(false);
  useEffect(()=>{void Promise.all([fetch('/api/admin/pricing').then(r=>r.json()),fetch('/api/admin/setup').then(r=>r.json())]).then(([p,s])=>{if(p.pricing)setPricing(p.pricing);else setMessage(p.error||'Pricing unavailable. Run shop setup first.');setSetup(s);}).catch(()=>setMessage('Unable to load settings.'));},[]);
  async function save(){if(!pricing)return;setSaving(true);try{
    const res=await fetch('/api/admin/pricing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pricing})});const result=await res.json();if(!res.ok)throw new Error(result.error);setPricing(result.pricing);setMessage('Settings saved.');
  }catch(e){setMessage(e instanceof Error?e.message:'Save failed.');}finally{setSaving(false);}}
  async function activate(){setSaving(true);try{
    const res=await fetch('/api/admin/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchantAccountConfirmed:confirmed,merchantId:setup?.merchant})});const result=await res.json();if(!res.ok)throw new Error(result.error);setMessage(result.message);const fresh=await fetch('/api/admin/setup');setSetup(await fresh.json());
  }catch(e){setMessage(e instanceof Error?e.message:'Activation failed.');}finally{setSaving(false);}}
  const field=(key:string,value:unknown)=>setPricing(p=>p?{...p,[key]:value}:p);
  return <div className="min-h-screen bg-slate-50 text-slate-900"><AdminHeader showSave onSave={save} saving={saving}/><main className="max-w-4xl mx-auto p-4 py-8 space-y-6">
    <h1 className="text-2xl font-bold">Shop settings</h1>{message&&<p role="status" className="p-4 bg-indigo-50 border rounded-xl">{message}</p>}
    {pricing&&<>
      <section className="bg-white border rounded-2xl p-5 space-y-4"><h2 className="font-bold">Shop information</h2>{[['shop_name','Shop name'],['shop_address','Address'],['shop_phone','Contact phone']].map(([key,label])=><label key={key} className="block text-sm">{label}<input className="block mt-1 border rounded-lg p-2 w-full" maxLength={key==='shop_address'?300:100} value={String((pricing as any)[key]||'')} onChange={e=>field(key,e.target.value)}/></label>)}</section>
      <section className="bg-white border rounded-2xl p-5 space-y-4"><h2 className="font-bold">Pricing in INR</h2><p className="text-sm text-slate-500">Single-sided rates are per page. Duplex rates are also per document page, including an odd final page. Physical finishing services are not automated.</p><div className="grid sm:grid-cols-2 gap-4">{rates.map(([key,label])=><label key={key} className="text-sm">{label}<input type="number" min="0" max="100000" step="0.01" className="block border rounded-lg p-2 w-full" value={Number((pricing as any)[key]??0)} onChange={e=>field(key,Number(e.target.value))}/></label>)}</div>
        <div className="flex flex-wrap gap-4">{['a4','a3','legal','photo'].map(k=><label key={k} className="flex gap-2"><input type="checkbox" checked={pricing.enabled_papers?.[k]!==false} onChange={e=>field('enabled_papers',{...pricing.enabled_papers,[k]:e.target.checked})}/>{k.toUpperCase()} enabled</label>)}</div>
        <label className="block text-sm">Minimum checkout amount (at least ₹1)<input type="number" min="1" step="0.01" className="block border rounded-lg p-2" value={pricing.form_fields?.minOrderAmount??1} onChange={e=>field('form_fields',{...pricing.form_fields,minOrderAmount:Number(e.target.value)})}/></label>
        {([['allowUpiPayment','Accept online payments'],['allowColorPrinting','Offer color printing'],['allowDoubleSided','Offer duplex printing']] as const).map(([k,label])=><label key={k} className="flex gap-2 text-sm"><input type="checkbox" checked={pricing.form_fields?.[k]!==false} onChange={e=>field('form_fields',{...pricing.form_fields,[k]:e.target.checked})}/>{label}</label>)}
        <button disabled={saving} onClick={save} className="px-5 py-3 rounded-xl bg-indigo-600 text-white">Save shop settings</button>
      </section>
    </>}
    <section className="bg-white border rounded-2xl p-5 space-y-4"><h2 className="font-bold">Payment & agent installation</h2>
      <p className="text-sm">Use this shop's approved PhonePe Payment Gateway credentials in Vercel. A normal merchant QR alone cannot verify payment. Credentials are never entered in this page.</p>
      {setup?.checks&&<ul className="grid sm:grid-cols-2 gap-2 text-sm">{Object.entries(setup.checks).map(([key,value])=><li key={key}>{value?'✓':'—'} {key}: {value?'configured':'needs attention'}</li>)}</ul>}
      <p className="text-sm break-all">Merchant: {setup?.merchant||'Not configured'} · Environment: {setup?.environment||'Not configured'}</p>
      <p className="text-sm break-all">Canonical return URL: {setup?.origin||'Not configured'}</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I checked in the provider dashboard that these API credentials belong to this shop's merchant and settlement account.</label>
      <button disabled={!confirmed||saving||!setup?.merchant} onClick={activate} className="px-4 py-3 rounded-xl bg-indigo-600 text-white disabled:opacity-40">Activate configured merchant</button>
      <p className="text-xs text-slate-500">Activation does not verify a payment. Complete sandbox and live acceptance checks before opening the shop. Configure PRINTER_NAME and pairing credentials on the shop PC, then restart its agent.</p>
    </section>
  </main></div>;
}
