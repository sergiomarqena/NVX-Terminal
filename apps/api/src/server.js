import http from "node:http";

const PORT=Number(process.env.PORT||3001);
const FRONTEND_ORIGIN=process.env.FRONTEND_ORIGIN||"https://nvx-frontend-production.up.railway.app";
const TIMEFRAMES=new Set(["1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"]);
const SYMBOL=/^[A-Z0-9]{5,20}$/;
const PROVIDERS=[
  {id:"binance",label:"Binance",keys:["BINANCE_API_KEY","BINANCE_API_SECRET"],publicMarketData:true},
  {id:"bybit",label:"Bybit",keys:["BYBIT_API_KEY","BYBIT_API_SECRET"],publicMarketData:true},
  {id:"mexc",label:"MEXC",keys:[],publicMarketData:true},
  {id:"coingecko",label:"CoinGecko",keys:["COINGECKO_API_KEY"],publicMarketData:true},
  {id:"coinmarketcap",label:"CoinMarketCap",keys:["COINMARKETCAP_API_KEY"],publicMarketData:true}
];
const send=(res,status,data)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(data));};
const candle=(time,open,high,low,close,volume)=>({time:Number(time),open:Number(open),high:Number(high),low:Number(low),close:Number(close),volume:Number(volume)});
async function upstream(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{const r=await fetch(url,{signal:controller.signal,headers:{"user-agent":"NORDVEX-Charting/0.1"}});if(!r.ok)throw new Error("Upstream returned HTTP "+r.status);return await r.json();}
  finally{clearTimeout(timer);}
}
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(origin===FRONTEND_ORIGIN||!origin)res.setHeader("access-control-allow-origin",origin||FRONTEND_ORIGIN);
  res.setHeader("vary","Origin");res.setHeader("access-control-allow-methods","GET,OPTIONS");res.setHeader("access-control-allow-headers","content-type");
  if(req.method==="OPTIONS"){res.writeHead(204);return res.end();}
  const url=new URL(req.url,"http://localhost");
  if(req.method!=="GET")return send(res,405,{error:"Method not allowed"});
  if(url.pathname==="/"||url.pathname==="/health")return send(res,200,{name:"NORDVEX CHARTING API",status:"online",version:"0.2.0",timestamp:new Date().toISOString()});
  if(url.pathname==="/api/v1/providers"){
    return send(res,200,{providers:PROVIDERS.map(p=>({id:p.id,name:p.label,credentialsConfigured:p.keys.length?p.keys.every(k=>Boolean(process.env[k])):false,publicMarketData:p.publicMarketData})),note:"Credential presence only. Secret values are never returned."});
  }
  if(url.pathname==="/api/v1/market/tickers"){
    const exchange=(url.searchParams.get("exchange")||"binance").toLowerCase();
    const limit=Math.min(200,Math.max(10,Number(url.searchParams.get("limit")||100)));
    if(!["binance","bybit","mexc"].includes(exchange))return send(res,400,{error:"Unsupported exchange"});
    try{
      let rows=[];
      if(exchange==="bybit"){
        const data=await upstream("https://api.bybit.com/v5/market/tickers?category=spot");
        if(data.retCode!==0)throw new Error(data.retMsg||"Bybit ticker error");
        rows=(data.result.list||[]).filter(x=>x.symbol.endsWith("USDT")).map(x=>({symbol:x.symbol,lastPrice:+x.lastPrice,priceChangePercent:+x.price24hPcnt*100,quoteVolume:+x.turnover24h,highPrice:+x.highPrice24h,lowPrice:+x.lowPrice24h,volume:+x.volume24h}));
      }else{
        const host=exchange==="binance"?"https://api.binance.com":"https://api.mexc.com";
        const data=await upstream(host+"/api/v3/ticker/24hr");
        rows=(Array.isArray(data)?data:[]).filter(x=>x.symbol.endsWith("USDT")).map(x=>({symbol:x.symbol,lastPrice:+x.lastPrice,priceChangePercent:+x.priceChangePercent,quoteVolume:+x.quoteVolume,highPrice:+x.highPrice,lowPrice:+x.lowPrice,volume:+x.volume}));
      }
      rows=rows.filter(x=>Number.isFinite(x.lastPrice)&&Number.isFinite(x.priceChangePercent)&&Number.isFinite(x.quoteVolume)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,limit);
      return send(res,200,{exchange,count:rows.length,tickers:rows,source:"exchange-native",retrievedAt:new Date().toISOString()});
    }catch(e){return send(res,502,{error:"Ticker feed unavailable",provider:exchange,detail:e.message});}
  }
  if(url.pathname==="/api/v1/market/orderbook"){
    const exchange=(url.searchParams.get("exchange")||"binance").toLowerCase();
    const symbol=(url.searchParams.get("symbol")||"BTCUSDT").toUpperCase();
    const limit=Math.min(100,Math.max(5,Number(url.searchParams.get("limit")||25)));
    if(!["binance","bybit","mexc"].includes(exchange)||!SYMBOL.test(symbol))return send(res,400,{error:"Invalid exchange or symbol"});
    try{
      let bids=[],asks=[];
      if(exchange==="bybit"){
        const d=await upstream("https://api.bybit.com/v5/market/orderbook?category=spot&symbol="+symbol+"&limit="+limit);
        if(d.retCode!==0)throw new Error(d.retMsg||"Bybit order book error");
        bids=d.result.b||[];asks=d.result.a||[];
      }else{
        const host=exchange==="binance"?"https://api.binance.com":"https://api.mexc.com";
        const d=await upstream(host+"/api/v3/depth?symbol="+symbol+"&limit="+limit);
        bids=d.bids||[];asks=d.asks||[];
      }
      return send(res,200,{exchange,symbol,bids:bids.map(x=>({price:+x[0],quantity:+x[1]})),asks:asks.map(x=>({price:+x[0],quantity:+x[1]})),source:"exchange-native",retrievedAt:new Date().toISOString()});
    }catch(e){return send(res,502,{error:"Order book feed unavailable",provider:exchange,detail:e.message});}
  }
  if(url.pathname==="/api/v1/instruments"){
    return send(res,200,{instruments:[
      {symbol:"BTCUSDT",name:"Bitcoin",assetClass:"crypto",exchanges:["binance","bybit","mexc"]},
      {symbol:"ETHUSDT",name:"Ethereum",assetClass:"crypto",exchanges:["binance","bybit","mexc"]},
      {symbol:"XAUUSD",name:"Gold Spot",assetClass:"metals",exchanges:[],note:"Requires a licensed broker or market-data feed"},
      {symbol:"EURUSD",name:"Euro / US Dollar",assetClass:"forex",exchanges:[],note:"Requires an FX data provider"},
      {symbol:"USOIL",name:"WTI Crude Oil",assetClass:"energy",exchanges:[],note:"Requires a licensed market-data provider"}
    ]});
  }
  if(url.pathname==="/api/v1/market/candles"){
    const exchange=(url.searchParams.get("exchange")||"binance").toLowerCase();
    const symbol=(url.searchParams.get("symbol")||"BTCUSDT").toUpperCase();
    const interval=url.searchParams.get("interval")||"1h";
    const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get("limit")||500)));
    if(!["binance","bybit","mexc"].includes(exchange)||!SYMBOL.test(symbol)||!TIMEFRAMES.has(interval)||!Number.isInteger(limit))return send(res,400,{error:"Invalid exchange, symbol, interval or limit"});
    try{
      let rows;
      if(exchange==="bybit"){
        const tf=({"1m":"1","3m":"3","5m":"5","15m":"15","30m":"30","1h":"60","2h":"120","4h":"240","6h":"360","12h":"720","1d":"D","1w":"W","1M":"M"})[interval];
        const data=await upstream("https://api.bybit.com/v5/market/kline?category=spot&symbol="+symbol+"&interval="+tf+"&limit="+limit);
        if(data.retCode!==0)throw new Error(data.retMsg||"Bybit API error");
        rows=data.result.list.slice().reverse().map(k=>candle(k[0],k[1],k[2],k[3],k[4],k[5]));
      }else{
        const host=exchange==="binance"?"https://api.binance.com":"https://api.mexc.com";
        const data=await upstream(host+"/api/v3/klines?symbol="+symbol+"&interval="+interval+"&limit="+limit);
        rows=data.map(k=>candle(k[0],k[1],k[2],k[3],k[4],k[5]));
      }
      return send(res,200,{exchange,symbol,interval,count:rows.length,candles:rows,source:"exchange-native",retrievedAt:new Date().toISOString()});
    }catch(e){return send(res,502,{error:"Market data provider unavailable",provider:exchange,detail:e.message});}
  }
  return send(res,404,{error:"Route not found"});
});
server.listen(PORT,"0.0.0.0",()=>console.log("NORDVEX API listening on "+PORT));
