const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const CACHE_TTL = 30000; // 30 seconds
const cache = {};

// Helper to fetch JSON from URL
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'BERA-Flow-Dashboard/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Fetch with POST
function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'BERA-Flow-Dashboard/1.0' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// Cached fetch
async function cachedFetch(key, fetchFn) {
  const now = Date.now();
  if (cache[key] && now - cache[key].time < CACHE_TTL) {
    return cache[key].data;
  }
  try {
    const data = await fetchFn();
    cache[key] = { data, time: now };
    return data;
  } catch (e) {
    console.error(`Error fetching ${key}:`, e.message);
    return cache[key]?.data || null;
  }
}

// Aggregate all exchange data
async function getAllData(interval = '1d', limit = 7) {
  const periodMap = { '1h': '1h', '4h': '4h', '1d': '1d' };
  const okxPeriod = { '1h': '1H', '4h': '4H', '1d': '1D' };
  
  const [
    // Binance
    binanceSpotKlines,
    okxKlines,
    binanceSpotTicker,
    binanceFuturesTicker,
    binanceFuturesOI,
    binanceFuturesFunding,
    binanceTakerFlow,
    binanceLSGlobal,
    binanceLSTop,
    // OKX
    okxSpotTicker,
    okxPerpTicker,
    okxFunding,
    okxTakerVol,
    okxOI,
    // Bybit
    bybitSpotTicker,
    bybitPerpTicker,
    bybitOI,
    bybitFunding,
    bybitLS,
    bybitPerpTrades,
    // KuCoin
    kucoinSpot,
    // MEXC
    mexcSpot,
    mexcPerp,
    mexcFunding,
    mexcPerpTrades,
    // Bitget
    bitgetSpot,
    bitgetOI,
    bitgetPerpTrades,
    // BingX
    bingxPerp,
    bingxOI,
    bingxPerpTrades,
    // Hyperliquid
    hyperliquidMeta,
    // Upbit
    upbitOrderbook,
    upbitTrades,
    upbitTicker,
    // Additional spot taker flow
    okxSpotTaker,
    bybitSpotTrades,
    kucoinTrades,
    mexcSpotTrades,
    bitgetSpotTrades
  ] = await Promise.all([
    // Binance
    cachedFetch(`binance-klines-${interval}-${limit}`, () => 
      fetchJSON(`https://api.binance.com/api/v3/klines?symbol=BERAUSDT&interval=${interval}&limit=${limit}`)),
    // OKX klines as fallback
    cachedFetch(`okx-klines-${interval}-${limit}`, () => 
      fetchJSON(`https://www.okx.com/api/v5/market/candles?instId=BERA-USDT&bar=${interval === '1h' ? '1H' : interval === '4h' ? '4H' : '1D'}&limit=${limit}`)),
    cachedFetch('binance-spot-ticker', () => 
      fetchJSON('https://api.binance.com/api/v3/ticker/24hr?symbol=BERAUSDT')),
    cachedFetch('binance-futures-ticker', () => 
      fetchJSON('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BERAUSDT')),
    cachedFetch('binance-futures-oi', () => 
      fetchJSON('https://fapi.binance.com/fapi/v1/openInterest?symbol=BERAUSDT')),
    cachedFetch('binance-futures-funding', () => 
      fetchJSON('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BERAUSDT&limit=1')),
    cachedFetch(`binance-taker-${interval}-${limit}`, () => 
      fetchJSON(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BERAUSDT&period=${periodMap[interval]}&limit=${limit}`)),
    cachedFetch('binance-ls-global', () => 
      fetchJSON('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BERAUSDT&period=1d&limit=1')),
    cachedFetch('binance-ls-top', () => 
      fetchJSON('https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=BERAUSDT&period=1d&limit=1')),
    // OKX
    cachedFetch('okx-spot-ticker', () => 
      fetchJSON('https://www.okx.com/api/v5/market/ticker?instId=BERA-USDT')),
    cachedFetch('okx-perp-ticker', () => 
      fetchJSON('https://www.okx.com/api/v5/market/ticker?instId=BERA-USDT-SWAP')),
    cachedFetch('okx-funding', () => 
      fetchJSON('https://www.okx.com/api/v5/public/funding-rate?instId=BERA-USDT-SWAP')),
    cachedFetch(`okx-taker-${interval}`, () => 
      fetchJSON(`https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BERA&instType=CONTRACTS&period=${okxPeriod[interval]}`)),
    cachedFetch('okx-oi', () => 
      fetchJSON('https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BERA&period=1D')),
    // Bybit
    cachedFetch('bybit-spot-ticker', () => 
      fetchJSON('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BERAUSDT')),
    cachedFetch('bybit-perp-ticker', () => 
      fetchJSON('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BERAUSDT')),
    cachedFetch('bybit-oi', () => 
      fetchJSON('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BERAUSDT&intervalTime=1d&limit=1')),
    cachedFetch('bybit-funding', () => 
      fetchJSON('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BERAUSDT&limit=1')),
    cachedFetch('bybit-ls', () => 
      fetchJSON('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BERAUSDT&period=1d&limit=1')),
    cachedFetch('bybit-perp-trades', () =>
      fetchJSON('https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=BERAUSDT&limit=500')),
    // KuCoin
    cachedFetch('kucoin-spot', () => 
      fetchJSON('https://api.kucoin.com/api/v1/market/stats?symbol=BERA-USDT')),
    // MEXC
    cachedFetch('mexc-spot', () => 
      fetchJSON('https://api.mexc.com/api/v3/ticker/24hr?symbol=BERAUSDT')),
    cachedFetch('mexc-perp', () => 
      fetchJSON('https://contract.mexc.com/api/v1/contract/ticker?symbol=BERA_USDT')),
    cachedFetch('mexc-funding', () => 
      fetchJSON('https://contract.mexc.com/api/v1/contract/funding_rate/BERA_USDT')),
    cachedFetch('mexc-perp-trades', () =>
      fetchJSON('https://contract.mexc.com/api/v1/contract/deals/BERA_USDT?limit=500')),
    // Bitget
    cachedFetch('bitget-spot', () => 
      fetchJSON('https://api.bitget.com/api/v2/spot/market/tickers?symbol=BERAUSDT')),
    cachedFetch('bitget-oi', () => 
      fetchJSON('https://api.bitget.com/api/v2/mix/market/open-interest?symbol=BERAUSDT&productType=USDT-FUTURES')),
    cachedFetch('bitget-perp-trades', () =>
      fetchJSON('https://api.bitget.com/api/v2/mix/market/fills?symbol=BERAUSDT&productType=USDT-FUTURES&limit=500')),
    // BingX
    cachedFetch('bingx-perp', () => 
      fetchJSON('https://open-api.bingx.com/openApi/swap/v2/quote/ticker?symbol=BERA-USDT')),
    cachedFetch('bingx-oi', () => 
      fetchJSON('https://open-api.bingx.com/openApi/swap/v2/quote/openInterest?symbol=BERA-USDT')),
    cachedFetch('bingx-perp-trades', () =>
      fetchJSON('https://open-api.bingx.com/openApi/swap/v2/quote/trades?symbol=BERA-USDT&limit=500')),
    // Hyperliquid
    cachedFetch('hyperliquid-meta', () => 
      postJSON('https://api.hyperliquid.xyz/info', { type: 'allMids' })),
    // Upbit (Korean exchange)
    cachedFetch('upbit-orderbook', () => 
      fetchJSON('https://api.upbit.com/v1/orderbook?markets=KRW-BERA')),
    cachedFetch('upbit-trades', () => 
      fetchJSON('https://api.upbit.com/v1/trades/ticks?market=KRW-BERA&count=200')),
    cachedFetch('upbit-ticker', () => 
      fetchJSON('https://api.upbit.com/v1/ticker?markets=KRW-BERA')),
    // OKX Spot taker volume
    cachedFetch('okx-spot-taker', () =>
      fetchJSON('https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BERA&instType=SPOT&period=1D')),
    // Bybit Spot trades (for taker flow)
    cachedFetch('bybit-spot-trades', () =>
      fetchJSON('https://api.bybit.com/v5/market/recent-trade?category=spot&symbol=BERAUSDT&limit=200')),
    // KuCoin trades (for taker flow)
    cachedFetch('kucoin-trades', () =>
      fetchJSON('https://api.kucoin.com/api/v1/market/histories?symbol=BERA-USDT')),
    // MEXC spot trades
    cachedFetch('mexc-spot-trades', () =>
      fetchJSON('https://api.mexc.com/api/v3/trades?symbol=BERAUSDT&limit=200')),
    // Bitget spot trades
    cachedFetch('bitget-spot-trades', () =>
      fetchJSON('https://api.bitget.com/api/v2/spot/market/fills?symbol=BERAUSDT&limit=200'))
  ]);

  // Get current price for OI calculations (fallback chain: Binance -> OKX -> Bybit -> 0.45)
  const currentPrice = binanceSpotTicker?.lastPrice ? +binanceSpotTicker.lastPrice 
    : okxSpotTicker?.data?.[0]?.last ? +okxSpotTicker.data[0].last
    : bybitSpotTicker?.result?.list?.[0]?.lastPrice ? +bybitSpotTicker.result.list[0].lastPrice
    : 0.45;
  
  // KRW to USD conversion (approximate)
  const KRW_USD = 1450;
  
  // Calculate Upbit taker flow from recent trades
  const upbitTakerFlow = { buyVol: 0, sellVol: 0, volume24h: 0 };
  if (upbitTrades && Array.isArray(upbitTrades)) {
    for (const trade of upbitTrades) {
      const usdVol = (trade.trade_price * trade.trade_volume) / KRW_USD;
      if (trade.ask_bid === 'BID') {
        upbitTakerFlow.buyVol += usdVol;
      } else {
        upbitTakerFlow.sellVol += usdVol;
      }
    }
  }
  // Get 24h volume from ticker
  if (upbitTicker?.[0]?.acc_trade_price_24h) {
    upbitTakerFlow.volume24h = +upbitTicker[0].acc_trade_price_24h / KRW_USD;
  }
  
  // OKX spot taker flow (today's data from API)
  const okxSpotFlow = { buyVol: 0, sellVol: 0 };
  if (okxSpotTaker?.data?.[0]) {
    // Format: [timestamp, sellVol, buyVol]
    okxSpotFlow.sellVol = +okxSpotTaker.data[0][1];
    okxSpotFlow.buyVol = +okxSpotTaker.data[0][2];
  }
  
  // Bybit spot taker flow from recent trades
  const bybitSpotFlow = { buyVol: 0, sellVol: 0 };
  if (bybitSpotTrades?.result?.list) {
    for (const trade of bybitSpotTrades.result.list) {
      const usdVol = +trade.price * +trade.size;
      if (trade.side === 'Buy') {
        bybitSpotFlow.buyVol += usdVol;
      } else {
        bybitSpotFlow.sellVol += usdVol;
      }
    }
  }
  
  // KuCoin spot taker flow from recent trades
  const kucoinSpotFlow = { buyVol: 0, sellVol: 0 };
  if (kucoinTrades?.data) {
    for (const trade of kucoinTrades.data) {
      const usdVol = +trade.price * +trade.size;
      if (trade.side === 'buy') {
        kucoinSpotFlow.buyVol += usdVol;
      } else {
        kucoinSpotFlow.sellVol += usdVol;
      }
    }
  }
  
  // MEXC spot taker flow (isBuyerMaker: true = taker sold, false = taker bought)
  const mexcSpotFlow = { buyVol: 0, sellVol: 0 };
  if (mexcSpotTrades && Array.isArray(mexcSpotTrades)) {
    for (const trade of mexcSpotTrades) {
      const usdVol = +trade.quoteQty;
      if (trade.isBuyerMaker) {
        mexcSpotFlow.sellVol += usdVol; // Maker is buyer, so taker sold
      } else {
        mexcSpotFlow.buyVol += usdVol; // Maker is seller, so taker bought
      }
    }
  }
  
  // Bitget spot taker flow
  const bitgetSpotFlow = { buyVol: 0, sellVol: 0 };
  if (bitgetSpotTrades?.data) {
    for (const trade of bitgetSpotTrades.data) {
      const usdVol = +trade.price * +trade.size;
      if (trade.side === 'buy') {
        bitgetSpotFlow.buyVol += usdVol;
      } else {
        bitgetSpotFlow.sellVol += usdVol;
      }
    }
  }

  // === PERP TAKER FLOW FROM RECENT TRADES ===
  
  // Bybit perp taker flow
  const bybitPerpFlow = { buyVol: 0, sellVol: 0 };
  if (bybitPerpTrades?.result?.list) {
    for (const trade of bybitPerpTrades.result.list) {
      const usdVol = +trade.price * +trade.size;
      if (trade.side === 'Buy') {
        bybitPerpFlow.buyVol += usdVol;
      } else {
        bybitPerpFlow.sellVol += usdVol;
      }
    }
  }
  
  // MEXC perp taker flow (T: 1=buy, 2=sell)
  const mexcPerpFlow = { buyVol: 0, sellVol: 0 };
  if (mexcPerpTrades?.data && Array.isArray(mexcPerpTrades.data)) {
    for (const trade of mexcPerpTrades.data) {
      const usdVol = +trade.p * +trade.v;
      if (trade.T === 1) {
        mexcPerpFlow.buyVol += usdVol;
      } else {
        mexcPerpFlow.sellVol += usdVol;
      }
    }
  }
  
  // Bitget perp taker flow
  const bitgetPerpFlow = { buyVol: 0, sellVol: 0 };
  if (bitgetPerpTrades?.data && Array.isArray(bitgetPerpTrades.data)) {
    for (const trade of bitgetPerpTrades.data) {
      const usdVol = +trade.price * +trade.size;
      if (trade.side === 'buy') {
        bitgetPerpFlow.buyVol += usdVol;
      } else {
        bitgetPerpFlow.sellVol += usdVol;
      }
    }
  }
  
  // BingX perp taker flow (isBuyerMaker: true = taker sold, false = taker bought)
  const bingxPerpFlow = { buyVol: 0, sellVol: 0 };
  if (bingxPerpTrades?.data && Array.isArray(bingxPerpTrades.data)) {
    for (const trade of bingxPerpTrades.data) {
      const usdVol = +trade.quoteQty;
      if (trade.isBuyerMaker) {
        bingxPerpFlow.sellVol += usdVol;
      } else {
        bingxPerpFlow.buyVol += usdVol;
      }
    }
  }

  // Process data
  const result = {
    price: currentPrice,
    priceChange24h: binanceSpotTicker?.priceChangePercent ? +binanceSpotTicker.priceChangePercent 
      : okxSpotTicker?.data?.[0]?.sodUtc0 ? ((currentPrice - +okxSpotTicker.data[0].sodUtc0) / +okxSpotTicker.data[0].sodUtc0 * 100)
      : 0,
    
    // Spot klines for flow calculation (Binance primary, OKX fallback)
    spotKlines: (Array.isArray(binanceSpotKlines) && binanceSpotKlines.length > 0) 
      ? binanceSpotKlines.map(k => ({
          time: k[0],
          exchange: 'Binance',
          open: +k[1], high: +k[2], low: +k[3], close: +k[4],
          volume: +k[5], quoteVolume: +k[7],
          takerBuyQuote: +k[10],
          netFlow: (2 * +k[10]) - +k[7]
        }))
      : (okxKlines?.data || []).map(k => ({
          time: +k[0],
          exchange: 'OKX',
          open: +k[1], high: +k[2], low: +k[3], close: +k[4],
          volume: +k[5], quoteVolume: +k[6],
          takerBuyQuote: 0, // OKX doesn't provide taker buy in klines
          netFlow: 0 // Can't calculate without taker data
        })).reverse(),
    
    // Aggregated spot flow across all exchanges with detailed breakdown
    spotFlowTotal: {
      exchanges: {
        Binance: { net: (Array.isArray(binanceSpotKlines) ? binanceSpotKlines : []).reduce((sum, k) => sum + ((2 * +k[10]) - +k[7]), 0), source: '7d klines' },
        OKX: { net: okxSpotFlow.buyVol - okxSpotFlow.sellVol, buy: okxSpotFlow.buyVol, sell: okxSpotFlow.sellVol, source: '24h taker API' },
        Upbit: { net: upbitTakerFlow.buyVol - upbitTakerFlow.sellVol, buy: upbitTakerFlow.buyVol, sell: upbitTakerFlow.sellVol, source: 'recent trades' },
        Bybit: { net: bybitSpotFlow.buyVol - bybitSpotFlow.sellVol, buy: bybitSpotFlow.buyVol, sell: bybitSpotFlow.sellVol, source: 'recent trades' },
        KuCoin: { net: kucoinSpotFlow.buyVol - kucoinSpotFlow.sellVol, buy: kucoinSpotFlow.buyVol, sell: kucoinSpotFlow.sellVol, source: 'recent trades' },
        MEXC: { net: mexcSpotFlow.buyVol - mexcSpotFlow.sellVol, buy: mexcSpotFlow.buyVol, sell: mexcSpotFlow.sellVol, source: 'recent trades' },
        Bitget: { net: bitgetSpotFlow.buyVol - bitgetSpotFlow.sellVol, buy: bitgetSpotFlow.buyVol, sell: bitgetSpotFlow.sellVol, source: 'recent trades' }
      },
      get total() { 
        return Object.values(this.exchanges).reduce((sum, ex) => sum + ex.net, 0);
      }
    },
    
    // Get Binance time range to align OKX data
    const binanceData = Array.isArray(binanceTakerFlow) ? binanceTakerFlow : [];
    const binanceMinTime = binanceData.length ? Math.min(...binanceData.map(d => d.timestamp)) : 0;
    const binanceMaxTime = binanceData.length ? Math.max(...binanceData.map(d => d.timestamp)) : Date.now();
    
    // Filter OKX data to match Binance time range (for fair comparison)
    const okxDataRaw = okxTakerVol?.data || [];
    const okxDataFiltered = okxDataRaw.filter(d => {
      const ts = +d[0];
      return ts >= binanceMinTime && ts <= binanceMaxTime;
    });
    
    // Perp taker flow (historical time series from Binance/OKX APIs - aligned time range)
    perpFlow: [
      ...binanceData.map(d => ({
        exchange: 'Binance', time: d.timestamp,
        buyVol: +d.buyVol, sellVol: +d.sellVol,
        netFlow: +d.buyVol - +d.sellVol, ratio: +d.buySellRatio
      })),
      ...okxDataFiltered.map(d => ({
        exchange: 'OKX', time: +d[0],
        sellVol: +d[1], buyVol: +d[2],
        netFlow: +d[2] - +d[1], ratio: +d[2] / +d[1]
      }))
    ].sort((a, b) => b.time - a.time),
    
    // Aggregated perp flow across all exchanges with detailed breakdown (historical totals - aligned periods)
    perpFlowTotal: {
      exchanges: {
        Binance: { 
          net: binanceData.reduce((sum, d) => sum + (+d.buyVol - +d.sellVol), 0),
          buy: binanceData.reduce((sum, d) => sum + +d.buyVol, 0),
          sell: binanceData.reduce((sum, d) => sum + +d.sellVol, 0),
          periods: binanceData.length,
          source: 'historical (aligned)'
        },
        OKX: { 
          net: okxDataFiltered.reduce((sum, d) => sum + (+d[2] - +d[1]), 0),
          buy: okxDataFiltered.reduce((sum, d) => sum + +d[2], 0),
          sell: okxDataFiltered.reduce((sum, d) => sum + +d[1], 0),
          periods: okxDataFiltered.length,
          source: 'historical (aligned)'
        },
        Bybit: { 
          net: bybitPerpFlow.buyVol - bybitPerpFlow.sellVol, 
          buy: bybitPerpFlow.buyVol, 
          sell: bybitPerpFlow.sellVol, 
          source: 'recent trades' 
        },
        MEXC: { 
          net: mexcPerpFlow.buyVol - mexcPerpFlow.sellVol, 
          buy: mexcPerpFlow.buyVol, 
          sell: mexcPerpFlow.sellVol, 
          source: 'recent trades' 
        },
        Bitget: { 
          net: bitgetPerpFlow.buyVol - bitgetPerpFlow.sellVol, 
          buy: bitgetPerpFlow.buyVol, 
          sell: bitgetPerpFlow.sellVol, 
          source: 'recent trades' 
        },
        BingX: { 
          net: bingxPerpFlow.buyVol - bingxPerpFlow.sellVol, 
          buy: bingxPerpFlow.buyVol, 
          sell: bingxPerpFlow.sellVol, 
          source: 'recent trades' 
        }
      },
      get total() { 
        return Object.values(this.exchanges).reduce((sum, ex) => sum + ex.net, 0);
      }
    },
    
    // Volumes
    volumes: [
      { exchange: 'Binance', type: 'spot', volume: binanceSpotTicker?.quoteVolume ? +binanceSpotTicker.quoteVolume : 0 },
      { exchange: 'Binance', type: 'perp', volume: binanceFuturesTicker?.quoteVolume ? +binanceFuturesTicker.quoteVolume : 0 },
      { exchange: 'OKX', type: 'spot', volume: okxSpotTicker?.data?.[0]?.volCcy24h ? +okxSpotTicker.data[0].volCcy24h : 0 },
      { exchange: 'OKX', type: 'perp', volume: okxPerpTicker?.data?.[0]?.volCcy24h ? +okxPerpTicker.data[0].volCcy24h : 0 },
      { exchange: 'Bybit', type: 'spot', volume: bybitSpotTicker?.result?.list?.[0]?.turnover24h ? +bybitSpotTicker.result.list[0].turnover24h : 0 },
      { exchange: 'Bybit', type: 'perp', volume: bybitPerpTicker?.result?.list?.[0]?.turnover24h ? +bybitPerpTicker.result.list[0].turnover24h : 0 },
      { exchange: 'KuCoin', type: 'spot', volume: kucoinSpot?.data?.volValue ? +kucoinSpot.data.volValue : 0 },
      { exchange: 'MEXC', type: 'spot', volume: mexcSpot?.quoteVolume ? +mexcSpot.quoteVolume : 0 },
      { exchange: 'MEXC', type: 'perp', volume: mexcPerp?.data?.volume24 ? +mexcPerp.data.volume24 : 0 },
      { exchange: 'Bitget', type: 'spot', volume: bitgetSpot?.data?.[0]?.quoteVolume ? +bitgetSpot.data[0].quoteVolume : 0 },
      { exchange: 'BingX', type: 'perp', volume: bingxPerp?.data?.quoteVolume ? +bingxPerp.data.quoteVolume : 0 },
      { exchange: 'Upbit', type: 'spot', volume: upbitTakerFlow.volume24h }
    ].filter(v => v.volume > 0),
    
    // Open Interest
    openInterest: {
      Binance: binanceFuturesOI?.openInterest ? +binanceFuturesOI.openInterest * currentPrice : 0,
      OKX: okxOI?.data?.[0]?.[1] ? +okxOI.data[0][1] : 0,
      Bybit: bybitOI?.result?.list?.[0]?.openInterest ? +bybitOI.result.list[0].openInterest * currentPrice : 0,
      Bitget: bitgetOI?.data?.openInterestList?.[0]?.size ? +bitgetOI.data.openInterestList[0].size * currentPrice : 0,
      BingX: bingxOI?.data?.openInterest ? +bingxOI.data.openInterest * currentPrice : 0
    },
    
    // Funding rates (annualized % = rate * 3 * 365 * 100)
    funding: {
      Binance: binanceFuturesFunding?.[0]?.fundingRate ? +binanceFuturesFunding[0].fundingRate * 100 : 0,
      OKX: okxFunding?.data?.[0]?.fundingRate ? +okxFunding.data[0].fundingRate * 100 : 0,
      Bybit: bybitFunding?.result?.list?.[0]?.fundingRate ? +bybitFunding.result.list[0].fundingRate * 100 : 0,
      MEXC: mexcFunding?.data?.fundingRate ? +mexcFunding.data.fundingRate * 100 : 0
    },
    
    // Long/Short ratios
    longShort: {
      'Binance Global': binanceLSGlobal?.[0] ? { long: +binanceLSGlobal[0].longAccount * 100, short: +binanceLSGlobal[0].shortAccount * 100 } : null,
      'Binance Top': binanceLSTop?.[0] ? { long: +binanceLSTop[0].longAccount * 100, short: +binanceLSTop[0].shortAccount * 100 } : null,
      'Bybit': bybitLS?.result?.list?.[0] ? { long: +bybitLS.result.list[0].buyRatio * 100, short: +bybitLS.result.list[0].sellRatio * 100 } : null
    },
    
    // Hyperliquid price
    hyperliquid: hyperliquidMeta?.BERA ? { price: +hyperliquidMeta.BERA } : null,
    
    // Upbit (Korean exchange - spot only, major BERA market)
    upbit: {
      volume24h: upbitTakerFlow.volume24h,
      takerBuyVol: upbitTakerFlow.buyVol,
      takerSellVol: upbitTakerFlow.sellVol,
      netFlow: upbitTakerFlow.buyVol - upbitTakerFlow.sellVol,
      flowRatio: upbitTakerFlow.buyVol / (upbitTakerFlow.sellVol || 1),
      price: upbitTicker?.[0]?.trade_price ? +upbitTicker[0].trade_price / KRW_USD : null,
      priceKRW: upbitTicker?.[0]?.trade_price ? +upbitTicker[0].trade_price : null,
      change24h: upbitTicker?.[0]?.signed_change_rate ? +upbitTicker[0].signed_change_rate * 100 : 0,
      orderbook: upbitOrderbook?.[0] ? {
        totalBidSize: +upbitOrderbook[0].total_bid_size,
        totalAskSize: +upbitOrderbook[0].total_ask_size,
        bidAskRatio: +upbitOrderbook[0].total_bid_size / +upbitOrderbook[0].total_ask_size,
        top5: upbitOrderbook[0].orderbook_units?.slice(0, 5).map(u => ({
          bidPrice: u.bid_price, bidSize: u.bid_size,
          askPrice: u.ask_price, askSize: u.ask_size
        }))
      } : null
    },
    
    timestamp: Date.now()
  };
  
  return result;
}

// Get order book depth
async function getDepth() {
  const depth = await cachedFetch('binance-depth', () => 
    fetchJSON('https://api.binance.com/api/v3/depth?symbol=BERAUSDT&limit=10'));
  
  if (!depth || !depth.bids || !depth.asks) return null;
  
  return {
    bids: (depth.bids || []).slice(0, 5).map(b => ({ price: +b[0], qty: +b[1], usd: +b[0] * +b[1] })),
    asks: (depth.asks || []).slice(0, 5).map(a => ({ price: +a[0], qty: +a[1], usd: +a[0] * +a[1] }))
  };
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // API endpoints
  if (url.pathname === '/api/data') {
    const interval = url.searchParams.get('interval') || '1d';
    const limit = parseInt(url.searchParams.get('limit')) || 7;
    
    try {
      const data = await getAllData(interval, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  
  if (url.pathname === '/api/depth') {
    try {
      const depth = await getDepth();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(depth));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  
  // Historical data from collector
  if (url.pathname === '/api/historical') {
    try {
      const collector = require('./collector.js');
      const hours = parseInt(url.searchParams.get('hours')) || 24;
      const toTs = Date.now();
      const fromTs = toTs - (hours * 60 * 60 * 1000);
      const data = collector.getHistoricalFlow(fromTs, toTs);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ fromTs, toTs, hours, ...data }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No historical data yet. Collector needs time to gather data.', spot: {}, perp: {} }));
    }
    return;
  }
  
  // Serve static files
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(__dirname, filePath);
  
  const extname = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json'
  };
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[extname] || 'text/plain' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`🐻 BERA Flow Dashboard running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
