/* Public market data only. Fixed upstream allowlist; never accepts URLs or credentials. */
export const MARKETS=[
 {id:'gold',name:'Gold',code:'088691',report:'disagg'}, {id:'silver',name:'Silver',code:'084691',report:'disagg'}, {id:'oil',name:'Crude oil (WTI)',code:'067651',report:'disagg'},
 {id:'dxy',name:'US dollar index',code:'098662',report:'tff'}, {id:'eur',name:'Euro',code:'099741',report:'tff'}, {id:'gbp',name:'British pound',code:'096742',report:'tff'}, {id:'jpy',name:'Japanese yen',code:'097741',report:'tff'}, {id:'aud',name:'Australian dollar',code:'232741',report:'tff'}, {id:'cad',name:'Canadian dollar',code:'090741',report:'tff'}, {id:'chf',name:'Swiss franc',code:'092741',report:'tff'}, {id:'nzd',name:'New Zealand dollar',code:'112741',report:'tff'}, {id:'btc',name:'Bitcoin',code:'133741',report:'tff'}
];
const FEEDS=[
 {id:'cnbc',name:'CNBC',market:'Global',url:'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114'},
 {id:'economy',name:'CNBC Economy',market:'Forex',url:'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258'},
 {id:'india',name:'Economic Times',market:'Indian Market',url:'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'},
 {id:'fed',name:'Federal Reserve',market:'Forex',url:'https://www.federalreserve.gov/feeds/press_all.xml'}
];
const COMMON=['cftc_contract_market_code','market_and_exchange_names','report_date_as_yyyy_mm_dd','open_interest_all','nonrept_positions_long_all','nonrept_positions_short_all'];
const FIELDS={legacy:['noncomm_positions_long_all','noncomm_positions_short_all','comm_positions_long_all','comm_positions_short_all','change_in_noncomm_long_all','change_in_noncomm_short_all'],disagg:['m_money_positions_long_all','m_money_positions_short_all','prod_merc_positions_long','prod_merc_positions_short','swap_positions_long_all','swap__positions_short_all','other_rept_positions_long','other_rept_positions_short','change_in_m_money_long_all','change_in_m_money_short_all'],tff:['lev_money_positions_long','lev_money_positions_short','dealer_positions_long_all','dealer_positions_short_all','asset_mgr_positions_long','asset_mgr_positions_short','other_rept_positions_long','other_rept_positions_short','change_in_lev_money_long','change_in_lev_money_short']};
const DATASETS={legacy:'6dca-aqww',disagg:'72hh-3qpy',tff:'gpe5-46if'};
const upstreamPending=new Map(),upstreamCache=new Map();
export async function upstream(url,type='json'){
 const key=String(url),cached=upstreamCache.get(key);if(cached&&Date.now()-cached.at<60000)return structuredClone(cached.data);
 if(upstreamPending.has(key))return structuredClone(await upstreamPending.get(key));
 const task=fetchUpstream(url,type);upstreamPending.set(key,task);
 try{const data=await task;if(upstreamCache.size>80)upstreamCache.delete(upstreamCache.keys().next().value);upstreamCache.set(key,{data,at:Date.now()});return structuredClone(data);}finally{upstreamPending.delete(key);}
}
async function fetchUpstream(url,type){
 const response=await fetch(url,{headers:{Accept:type==='json'?'application/json':'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(12000),cf:{cacheTtl:60,cacheEverything:true}});
 if(!response.ok)throw Error('Source returned HTTP '+response.status);
 const text=await response.text();if(text.length>2500000)throw Error('Source response exceeded size limit');
 return type==='json'?JSON.parse(text):text;
}
function decodeXml(text){return String(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>=0&&c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[n]).replace(/<[^>]*>/g,'').trim();}
export function parseRss(xml,source){
 const items=Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi));
 return items.slice(0,35).flatMap(([,body])=>{
  const tag=name=>decodeXml(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i').exec(body)?.[1]||'');
  const title=tag('title'),url=tag('link'),published=tag('pubDate'),date=new Date(published);
  if(!title||!/^https?:\/\//i.test(url)||Number.isNaN(date.getTime()))return [];
  const rawCategories=Array.from(body.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi),m=>decodeXml(m[1]));
  const text=(title+' '+rawCategories.join(' ')).toLowerCase();
  const tags=[];for(const [tag,pattern] of [['Fed',/\bfed\b|fomc|powell|federal reserve/],['Inflation',/inflation|\bcpi\b|\bpce\b/],['Jobs',/payroll|employment|jobs|\bnfp\b/],['Gold',/\bgold\b|bullion/],['Oil',/\boil\b|crude|opec/],['USD',/dollar|\busd\b/],['India',/india|nifty|sensex|\brbi\b|rupee/],['Equity',/stock|equities|earnings|shares/],['Politics',/trump|tariff|white house|election/]])if(pattern.test(text))tags.push(tag);
  return [{id:url,title,url,published:date.toISOString(),source:source.name,sourceId:source.id,market:source.market,tags}];
 });
}
export async function getHeadlines(){
 const results=await Promise.allSettled(FEEDS.map(async feed=>({feed,items:parseRss(await upstream(feed.url,'text'),feed)})));
 const sources=results.map((r,i)=>({id:FEEDS[i].id,name:FEEDS[i].name,ok:r.status==='fulfilled'&&r.value.items.length>0,error:r.status==='rejected'?r.reason.message:r.value.items.length?'': 'No dated headlines returned'}));
 const unique=new Map();for(const r of results)if(r.status==='fulfilled')for(const item of r.value.items){const existing=unique.get(item.url);if(existing)existing.tags=[...new Set([...existing.tags,...item.tags])];else unique.set(item.url,item);}
 return {items:[...unique.values()].sort((a,b)=>Date.parse(b.published)-Date.parse(a.published)).slice(0,120),sources,fetchedAt:new Date().toISOString(),cadence:'Feeds checked every 60 seconds; publisher delivery may be delayed.'};
}
const number=value=>value===undefined||value===null||value===''?null:Number.isFinite(Number(value))?Number(value):null;
function group(row,name,longKey,shortKey){const long=number(row[longKey]),short=number(row[shortKey]);return{name,long,short,net:long!==null&&short!==null?long-short:null};}
export function normalizeCot(row,report){
 let groups,changeLong,changeShort;
 if(report==='disagg'){groups=[group(row,'Managed money','m_money_positions_long_all','m_money_positions_short_all'),group(row,'Producers / merchants','prod_merc_positions_long','prod_merc_positions_short'),group(row,'Swap dealers','swap_positions_long_all','swap__positions_short_all'),group(row,'Other reportables','other_rept_positions_long','other_rept_positions_short')];changeLong=row.change_in_m_money_long_all;changeShort=row.change_in_m_money_short_all;}
 else if(report==='tff'){groups=[group(row,'Leveraged funds','lev_money_positions_long','lev_money_positions_short'),group(row,'Dealers','dealer_positions_long_all','dealer_positions_short_all'),group(row,'Asset managers','asset_mgr_positions_long','asset_mgr_positions_short'),group(row,'Other reportables','other_rept_positions_long','other_rept_positions_short')];changeLong=row.change_in_lev_money_long;changeShort=row.change_in_lev_money_short;}
 else{groups=[group(row,'Large speculators','noncomm_positions_long_all','noncomm_positions_short_all'),group(row,'Commercials','comm_positions_long_all','comm_positions_short_all')];changeLong=row.change_in_noncomm_long_all;changeShort=row.change_in_noncomm_short_all;}
 groups.push(group(row,'Small traders','nonrept_positions_long_all','nonrept_positions_short_all'));
 const primary=groups[0],cl=number(changeLong),cs=number(changeShort);
 return {date:row.report_date_as_yyyy_mm_dd?.slice(0,10),code:row.cftc_contract_market_code,exchange:row.market_and_exchange_names,report,openInterest:number(row.open_interest_all),groups,net:primary.net,long:primary.long,short:primary.short,change:cl!==null&&cs!==null?cl-cs:null};
}
async function cotRows(report,codes,limit){
 const url=new URL('https://publicreporting.cftc.gov/resource/'+DATASETS[report]+'.json');url.searchParams.set('$where',"cftc_contract_market_code in ("+codes.map(code=>"'"+code+"'").join(',')+")");url.searchParams.set('$select',[...COMMON,...FIELDS[report]].join(','));url.searchParams.set('$order','report_date_as_yyyy_mm_dd DESC');url.searchParams.set('$limit',String(limit));
 const rows=await upstream(url.href);if(!Array.isArray(rows))throw Error('Unexpected CFTC response');return rows.map(row=>normalizeCot(row,report));
}
export async function getCot(marketId){
 if(marketId){const market=MARKETS.find(m=>m.id===marketId);if(!market)throw Error('Unknown market');const results=await Promise.allSettled([cotRows(market.report,[market.code],157),cotRows('legacy',[market.code],157)]);return{market,history:results[0].status==='fulfilled'?results[0].value:[],legacy:results[1].status==='fulfilled'?results[1].value:[],errors:results.filter(r=>r.status==='rejected').map(r=>r.reason.message),fetchedAt:new Date().toISOString()};}
 const results=await Promise.allSettled(['disagg','tff'].map(report=>cotRows(report,MARKETS.filter(m=>m.report===report).map(m=>m.code),MARKETS.filter(m=>m.report===report).length*2)));
 const all=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
 return {markets:MARKETS.map(m=>({...m,...all.find(row=>row.code===m.code)})),errors:results.filter(r=>r.status==='rejected').map(r=>r.reason.message),fetchedAt:new Date().toISOString()};
}
export function normalizeFedEvents(events){
 return events.filter(e=>e.mutually_exclusive && e.strike_date && Date.parse(e.strike_date)>Date.now()).map(e=>{
  const outcomes=(e.markets||[]).filter(m=>m.status==='active'||m.status==='open').map(m=>{
   const bid=number(m.yes_bid_dollars),ask=number(m.yes_ask_dollars),last=number(m.last_price_dollars),previous=number(m.previous_price_dollars);
   const price=bid!==null&&ask!==null&&bid<=ask?(bid+ask)/2:last;
   const strike=m.custom_strike||{};let move=null;
   if(strike.Cut)move=-Number(String(strike.Cut).replace(/[^\d.]/g,''));else if(strike.Hike)move=Number(String(strike.Hike).replace(/[^\d.]/g,''));else if(/hold|maintain|no change/i.test(m.yes_sub_title||m.title))move=0;
   if(move!==null&&/>/.test(String(strike.Cut||strike.Hike||'')))move=move<0?-50:50;
   return {label:m.yes_sub_title||m.subtitle||m.title,ticker:m.ticker,price,previous,move,volume:number(m.volume_24h_fp)};
  });
  const total=outcomes.reduce((s,o)=>s+(o.price??0),0),complete=outcomes.every(o=>o.price!==null);
  return {ticker:e.event_ticker,title:e.title,date:e.strike_date,outcomes:outcomes.map(o=>({...o,probability:complete&&total>0&&o.price!==null?o.price/total*100:null,change:o.previous!==null&&o.price!==null?(o.price-o.previous)*100:null})),method:'Bid/ask midpoint, scaled to 100% across mutually exclusive outcomes. >25 bp buckets use 50 bp for expected moves.'};
 }).filter(e=>e.outcomes.length).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
export async function getFed(){
 const results=await Promise.allSettled([upstream('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/90.json'),(async()=>{const path='/trade-api/v2/events?series_ticker=KXFEDDECISION&status=open&with_nested_markets=true&limit=20';try{return await upstream('https://external-api.kalshi.com'+path);}catch{return await upstream('https://api.elections.kalshi.com'+path);}})()]);
 const rates=results[0].status==='fulfilled'?results[0].value.refRates||[]:[],events=results[1].status==='fulfilled'?normalizeFedEvents(results[1].value.events||[]):[];
 return {rate:rates[0]||null,rates,meetings:events,errors:results.filter(r=>r.status==='rejected').map(r=>r.reason.message),fetchedAt:new Date().toISOString(),sources:[{name:'Federal Reserve Bank of New York',url:'https://www.newyorkfed.org/markets/reference-rates/effr'},{name:'Kalshi prediction markets',url:'https://kalshi.com/markets/kxfeddecision'}]};
}
export async function onRequestGet(context){
 const url=new URL(context.request.url),kind=url.searchParams.get('kind')||'headlines',market=url.searchParams.get('market');
 if(!['headlines','cot','fed'].includes(kind)||market&&!MARKETS.some(m=>m.id===market))return Response.json({error:'Unknown data request'},{status:400});
 const ttl=kind==='cot'?3600:60,cache=globalThis.caches?.default;
 const key=new Request(url.origin+'/api/terminal?kind='+kind+(kind==='cot'&&market?'&market='+market:''));
 if(cache){const hit=await cache.match(key);if(hit)return hit;}
 try{
  const data=kind==='headlines'?await getHeadlines():kind==='cot'?await getCot(market):await getFed();
  const hasData=kind==='headlines'?data.items.length:kind==='cot'?market?data.history.length||data.legacy.length:data.markets.some(m=>m.date):data.rate||data.meetings.length;
  const response=Response.json(data,{status:hasData?200:503,headers:{'Cache-Control':hasData?'public, max-age='+ttl:'no-store','X-Content-Type-Options':'nosniff'}});
  if(cache&&hasData)context.waitUntil(cache.put(key,response.clone()));return response;
 }catch(error){return Response.json({error:'Market data is temporarily unavailable',detail:error.message},{status:502,headers:{'Cache-Control':'no-store'}});}
}
