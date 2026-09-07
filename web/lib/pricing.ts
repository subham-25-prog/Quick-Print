import {PricingConfig,OrderItemOptions,PriceBreakdown} from '@/types';
import {defaultPricingConfig} from './config';
/** All rates, including duplex, are per document page; arithmetic uses paisa. */
export function calculateOrderPrice(pageCount:number,options:OrderItemOptions,pricing:PricingConfig=defaultPricingConfig):PriceBreakdown{
  if(!Number.isSafeInteger(pageCount)||pageCount<1||!Number.isSafeInteger(options.copies)||options.copies<1)throw new Error('Invalid page or copy count');
  const prefix=options.paperSize.toLowerCase(),color=options.colorMode==='COLOR'?'color':'bw';
  const key=prefix==='photo'?'photo_paper_per_page':prefix+'_'+color+(options.printSides==='DOUBLE'?'_double':'')+'_per_page';
  const rate=Number((pricing as any)[key]);
  if(!Number.isFinite(rate)||rate<0)throw new Error('Pricing unavailable for this option');
  const rateMinor=Math.round(rate*100),printMinor=pageCount*options.copies*rateMinor;
  const addOnsBreakdown:PriceBreakdown['addOnsBreakdown']=[];
  for(const [key,config,label,perPage] of [
    ['stapling','addon_stapling','Stapling',false],['spiralBinding','addon_spiral_binding','Spiral binding',false],
    ['lamination','addon_lamination','Lamination',true],['hardBinding','addon_hard_binding','Hard binding',false],['softBinding','addon_soft_binding','Soft binding',false]
  ] as const){
    if(options.addOns?.[key]&&pricing.enabled_addons?.[key]===true){
      const value=Math.round(pricing[config]*100);addOnsBreakdown.push({name:label,unitPrice:value/100,total:value*options.copies*(perPage?pageCount:1)/100});
    }
  }
  for(const a of pricing.custom_addons||[])if(a.enabled&&options.addOns?.customAddons?.[a.id]){
    const value=Math.round(a.price*100),count=a.unit==='per_page'?pageCount*options.copies:a.unit==='per_copy'?options.copies:1;
    addOnsBreakdown.push({name:a.name,unitPrice:value/100,total:value*count/100});
  }
  const addonMinor=addOnsBreakdown.reduce((sum,a)=>sum+Math.round(a.total*100),0);
  const totalMinor=Math.max(printMinor+addonMinor,Math.round((pricing.form_fields?.minOrderAmount??1)*100));
  return{pageCount,copies:options.copies,baseRatePerPage:rateMinor/100,effectiveRatePerPage:rateMinor/100,printSubtotal:printMinor/100,addOnsBreakdown,addOnsSubtotal:addonMinor/100,totalAmount:totalMinor/100,currency:'INR'};
}

