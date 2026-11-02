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
const MACRO_SERIES={cpi:['CUSR0000SA0','CUSR0000SA0L1E','CUUR0000SA0','CUUR0000SA0L1E'],nfp:['CES0000000001','LNS14000000','CES0500000003']};
// Official schedules verified 2026-11-02; fallback is always labelled, never inferred from weekdays.
const RELEASE_DATES={cpi:['2026-11-10','2026-12-10','2027-01-13','2027-02-11','2027-03-10','2027-04-13','2027-05-12','2027-06-10','2027-07-14','2027-08-11','2027-09-14','2027-10-14','2027-11-10','2027-12-10'],nfp:['2026-11-06','2026-12-04','2027-01-08','2027-02-05','2027-03-05','2027-04-02','2027-05-07','2027-06-04','2027-07-02','2027-08-06','2027-09-03','2027-10-08','2027-11-05','2027-12-03']};
export function easternRelease(date){
 const base=Date.parse(date+'T08:30:00Z');let utc=base;
 for(let i=0;i<2;i++){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));utc+=base-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);}
 return new Date(utc).toISOString();
}
export function normalizeBls(payload){
 if(payload.status!=='REQUEST_SUCCEEDED')throw Error('BLS data unavailable: '+(payload.message||[]).join(' '));
 return (payload.Results?.series?.[0]?.data||[]).filter(r=>/^M(0[1-9]|1[0-2])$/.test(r.period)&&number(r.value)!==null).map(r=>({date:r.year+'-'+r.period.slice(1)+'-01',value:number(r.value),notes:(r.footnotes||[]).map(n=>n.text||'').filter(Boolean).join('; ')})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function macroHistory(series,kind){
 const rows=series[0]||[],at=(i,date)=>series[i]?.find(r=>r.date===date)?.value??null;
 const prev=(date,months)=>{const d=new Date(date+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-months);return d.toISOString().slice(0,10);};
 const pct=(a,b)=>a!==null&&b!==null&&b!==0?(a/b-1)*100:null;
 return rows.map(r=>{const previous=at(0,prev(r.date,1));return kind==='cpi'?{date:r.date,mom:pct(r.value,previous),coreMom:pct(at(1,r.date),at(1,prev(r.date,1))),yoy:pct(at(2,r.date),at(2,prev(r.date,12))),coreYoy:pct(at(3,r.date),at(3,prev(r.date,12)))}:{date:r.date,payrolls:previous===null?null:r.value-previous,unemployment:at(1,r.date),wages:pct(at(2,r.date),at(2,prev(r.date,1))),notes:r.notes};}).slice(-24).reverse();
}
export function parseBlsCalendar(text,kind){
 const unfolded=text.replace(/\r?\n[ \t]/g,'');
 return [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].flatMap(([,body])=>{
  const title=body.match(/(?:^|\n)SUMMARY:(.*)/)?.[1]?.trim()||'';
  if(!(kind==='cpi'?/Consumer Price Index/i:/Employment Situation/i).test(title))return [];
  const match=body.match(/DTSTART(?:;TZID=([^:\r\n]+))?:(\d{8})T(\d{6})(Z?)/);if(!match)return [];
  const d=match[2],date=d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8),t=match[3];
  // BLS publishes these releases at 08:30 Eastern. Unknown timezone/time is not guessed.
  if(!match[4]&&(!/^(America\/New_York|US\/Eastern|Eastern Standard Time)$/.test(match[1]||'')||t!=='083000'))return [];
  return [{date:match[4]?date+'T'+t.slice(0,2)+':'+t.slice(2,4)+':'+t.slice(4,6)+'Z':easternRelease(date),title}];
 }).sort((a,b)=>a.date.localeCompare(b.date));
}
let blsBatchCache=null,blsBatchPending=null;
async function getBlsBatch(){
 if(blsBatchCache&&Date.now()-blsBatchCache.at<3600000)return blsBatchCache.data;
 if(blsBatchPending)return blsBatchPending;
 blsBatchPending=(async()=>{
  const cache=globalThis.caches?.default,key=new Request('https://alpha-terminal-7bo.pages.dev/api/bls-batch-cache');
  const hit=cache?await cache.match(key):null;if(hit){const data=await hit.json();blsBatchCache={at:Date.now(),data};return data;}
  const year=new Date().getUTCFullYear();
  const response=await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seriesid:Object.values(MACRO_SERIES).flat(),startyear:String(year-2),endyear:String(year)}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('BLS returned HTTP '+response.status);const data=await response.json();if(data.status!=='REQUEST_SUCCEEDED')throw Error((data.message||[]).join(' ')||'BLS unavailable');
  blsBatchCache={at:Date.now(),data};if(cache)await cache.put(key,Response.json(data,{headers:{'Cache-Control':'public, max-age=3600'}}));return data;
 })();try{return await blsBatchPending;}finally{blsBatchPending=null;}
}
export async function getMacro(kind){
 let payload=null,blsError='';
 try{payload=await getBlsBatch();}catch(e){blsError=e.message;}
 const results=MACRO_SERIES[kind].map(id=>{const series=payload?.Results?.series?.find(s=>s.seriesID===id);try{if(!series)throw Error(blsError||'Series missing from BLS response');const value=normalizeBls({status:payload.status,message:payload.message,Results:{series:[series]}});if(!value.length)throw Error('No observations returned');return {status:'fulfilled',value};}catch(reason){return {status:'rejected',reason};}});
 let schedule,scheduleLive=false;
 try{schedule=parseBlsCalendar(await upstream('https://www.bls.gov/schedule/news_release/bls.ics','text'),kind);scheduleLive=schedule.some(r=>Date.parse(r.date)>Date.now());}catch{}
 if(!scheduleLive)schedule=RELEASE_DATES[kind].map(date=>({date:easternRelease(date),title:kind==='cpi'?'U.S. Consumer Price Index':'U.S. Nonfarm Payrolls'}));
 const history=macroHistory(results.map(r=>r.status==='fulfilled'?r.value:[]),kind);
 return {kind,history,schedule:schedule.filter(r=>Date.parse(r.date)>Date.now()),scheduleLive,scheduleVerified:scheduleLive?new Date().toISOString():'2026-11-02',errors:results.flatMap((r,i)=>r.status==='rejected'?[MACRO_SERIES[kind][i]+': '+r.reason.message]:[]),fetchedAt:new Date().toISOString(),source:'https://www.bls.gov/news.release/'+(kind==='cpi'?'cpi':'empsit')+'.htm',scheduleSource:'https://www.bls.gov/schedule/news_release/'+(kind==='cpi'?'cpi':'empsit')+'.htm'};
}

export async function onRequestGet(context){
 const url=new URL(context.request.url),kind=url.searchParams.get('kind')||'headlines',market=url.searchParams.get('market');
 if(!['headlines','cot','fed','cpi','nfp'].includes(kind)||market&&!MARKETS.some(m=>m.id===market))return Response.json({error:'Unknown data request'},{status:400});
 const ttl=['cot','cpi','nfp'].includes(kind)?3600:60,cache=globalThis.caches?.default;
 const key=new Request(url.origin+'/api/terminal?kind='+kind+(kind==='cot'&&market?'&market='+market:''));
 if(cache){const hit=await cache.match(key);if(hit)return hit;}
 try{
  const data=kind==='headlines'?await getHeadlines():kind==='cot'?await getCot(market):kind==='fed'?await getFed():await getMacro(kind);
  const hasData=kind==='headlines'?data.items.length:kind==='cot'?market?data.history.length||data.legacy.length:data.markets.some(m=>m.date):kind==='fed'?data.rate||data.meetings.length:data.history.length||data.schedule.length;
  const response=Response.json(data,{status:hasData?200:503,headers:{'Cache-Control':hasData?'public, max-age='+ttl:'no-store','X-Content-Type-Options':'nosniff'}});
  if(cache&&hasData)context.waitUntil(cache.put(key,response.clone()));return response;
 }catch(error){return Response.json({error:'Market data is temporarily unavailable',detail:error.message},{status:502,headers:{'Cache-Control':'no-store'}});}
}
