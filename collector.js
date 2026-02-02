const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Config
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const KRW_USD = 1450;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Simple JSON-based storage (one file per day)
function getDataFile(type, date = new Date()) {
  const dateStr = date.toISOString().split('T')[0];
  return path.join(DATA_DIR, `${type}-${dateStr}.json`);
}

function loadDayData(type, date = new Date()) {
  const file = getDataFile(type, date);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return [];
}

function saveDayData(type, data, date = new Date()) {
  const file = getDataFile(type, date);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function appendRecord(type, record) {
  const data = loadDayData(type);
  data.push(record);
  saveDayData(type, data);
}

// Helper to fetch JSON
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { 
      headers: { 'User-Agent': 'BERA-Flow-Collector/1.0' },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Collect from all exchanges
async function collect() {
  const timestamp = Date.now();
  const record = {
    timestamp,
    time: new Date().toISOString(),
    spot: {},
    perp: {}
  };
  
  console.log(`[${record.time}] Collecting data...`);
  
  // === SPOT EXCHANGES ===
  
  // Binance Spot
  try {
    const trades = await fetchJSON('https://api.binance.com/api/v3/trades?symbol=BERAUSDT&limit=1000');
    const ticker = await fetchJSON('https://api.binance.com/api/v3/ticker/24hr?symbol=BERAUSDT');
    let buy = 0, sell = 0;
    if (Array.isArray(trades)) {
      for (const t of trades) {
        const usd = +t.price * +t.qty;
        if (t.isBuyerMaker) sell += usd; else buy += usd;
      }
    }
    record.spot.Binance = { buy, sell, net: buy - sell, price: +ticker?.lastPrice || 0 };
  } catch (e) { console.error('  Binance spot:', e.message); }
  
  // OKX Spot
  try {
    const data = await fetchJSON('https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BERA&instType=SPOT&period=5m');
    if (data?.data?.[0]) {
      const [ts, sell, buy] = data.data[0];
      record.spot.OKX = { buy: +buy, sell: +sell, net: +buy - +sell };
    }
  } catch (e) { console.error('  OKX spot:', e.message); }
  
  // Upbit
  try {
    const trades = await fetchJSON('https://api.upbit.com/v1/trades/ticks?market=KRW-BERA&count=200');
    const ticker = await fetchJSON('https://api.upbit.com/v1/ticker?markets=KRW-BERA');
    let buy = 0, sell = 0;
    for (const t of trades) {
      const usd = (t.trade_price * t.trade_volume) / KRW_USD;
      if (t.ask_bid === 'BID') buy += usd; else sell += usd;
    }
    record.spot.Upbit = { buy, sell, net: buy - sell, price: ticker?.[0]?.trade_price / KRW_USD };
  } catch (e) { console.error('  Upbit:', e.message); }
  
  // Bybit Spot
  try {
    const trades = await fetchJSON('https://api.bybit.com/v5/market/recent-trade?category=spot&symbol=BERAUSDT&limit=200');
    let buy = 0, sell = 0;
    for (const t of trades?.result?.list || []) {
      const usd = +t.price * +t.size;
      if (t.side === 'Buy') buy += usd; else sell += usd;
    }
    record.spot.Bybit = { buy, sell, net: buy - sell };
  } catch (e) { console.error('  Bybit spot:', e.message); }
  
  // KuCoin
  try {
    const trades = await fetchJSON('https://api.kucoin.com/api/v1/market/histories?symbol=BERA-USDT');
    let buy = 0, sell = 0;
    for (const t of trades?.data || []) {
      const usd = +t.price * +t.size;
      if (t.side === 'buy') buy += usd; else sell += usd;
    }
    record.spot.KuCoin = { buy, sell, net: buy - sell };
  } catch (e) { console.error('  KuCoin:', e.message); }
  
  // MEXC
  try {
    const trades = await fetchJSON('https://api.mexc.com/api/v3/trades?symbol=BERAUSDT&limit=200');
    let buy = 0, sell = 0;
    if (Array.isArray(trades)) {
      for (const t of trades) {
        const usd = +t.quoteQty;
        if (t.isBuyerMaker) sell += usd; else buy += usd;
      }
    }
    record.spot.MEXC = { buy, sell, net: buy - sell };
  } catch (e) { console.error('  MEXC:', e.message); }
  
  // Bitget
  try {
    const trades = await fetchJSON('https://api.bitget.com/api/v2/spot/market/fills?symbol=BERAUSDT&limit=200');
    let buy = 0, sell = 0;
    for (const t of trades?.data || []) {
      const usd = +t.price * +t.size;
      if (t.side === 'buy') buy += usd; else sell += usd;
    }
    record.spot.Bitget = { buy, sell, net: buy - sell };
  } catch (e) { console.error('  Bitget:', e.message); }
  
  // === PERP EXCHANGES ===
  
  // Binance Futures
  try {
    const [taker, funding, oi] = await Promise.all([
      fetchJSON('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BERAUSDT&period=5m&limit=1'),
      fetchJSON('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BERAUSDT&limit=1'),
      fetchJSON('https://fapi.binance.com/fapi/v1/openInterest?symbol=BERAUSDT')
    ]);
    if (taker?.[0]) {
      record.perp.Binance = {
        buy: +taker[0].buyVol,
        sell: +taker[0].sellVol,
        net: +taker[0].buyVol - +taker[0].sellVol,
        funding: funding?.[0]?.fundingRate ? +funding[0].fundingRate : null,
        oi: oi?.openInterest ? +oi.openInterest : null
      };
    }
  } catch (e) { console.error('  Binance perp:', e.message); }
  
  // OKX Perp
  try {
    const [taker, funding] = await Promise.all([
      fetchJSON('https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BERA&instType=CONTRACTS&period=5m'),
      fetchJSON('https://www.okx.com/api/v5/public/funding-rate?instId=BERA-USDT-SWAP')
    ]);
    if (taker?.data?.[0]) {
      const [ts, sell, buy] = taker.data[0];
      record.perp.OKX = {
        buy: +buy,
        sell: +sell,
        net: +buy - +sell,
        funding: funding?.data?.[0]?.fundingRate ? +funding.data[0].fundingRate : null
      };
    }
  } catch (e) { console.error('  OKX perp:', e.message); }
  
  // Store record
  appendRecord('flow', record);
  
  // Log summary
  const spotNet = Object.values(record.spot).reduce((s, x) => s + (x.net || 0), 0);
  const perpNet = Object.values(record.perp).reduce((s, x) => s + (x.net || 0), 0);
  console.log(`  Spot: ${Object.keys(record.spot).length} exchanges, net $${spotNet.toFixed(0)}`);
  console.log(`  Perp: ${Object.keys(record.perp).length} exchanges, net $${perpNet.toFixed(0)}`);
  
  return record;
}

// Query historical data
function getHistoricalFlow(fromTs, toTs) {
  const results = { spot: {}, perp: {} };
  
  // Load all days in range
  const fromDate = new Date(fromTs);
  const toDate = new Date(toTs);
  const current = new Date(fromDate);
  
  while (current <= toDate) {
    const dayData = loadDayData('flow', current);
    for (const record of dayData) {
      if (record.timestamp >= fromTs && record.timestamp <= toTs) {
        // Aggregate spot
        for (const [ex, data] of Object.entries(record.spot || {})) {
          if (!results.spot[ex]) results.spot[ex] = { buy: 0, sell: 0, net: 0, samples: 0 };
          results.spot[ex].buy += data.buy || 0;
          results.spot[ex].sell += data.sell || 0;
          results.spot[ex].net += data.net || 0;
          results.spot[ex].samples++;
        }
        // Aggregate perp
        for (const [ex, data] of Object.entries(record.perp || {})) {
          if (!results.perp[ex]) results.perp[ex] = { buy: 0, sell: 0, net: 0, samples: 0, funding: [] };
          results.perp[ex].buy += data.buy || 0;
          results.perp[ex].sell += data.sell || 0;
          results.perp[ex].net += data.net || 0;
          results.perp[ex].samples++;
          if (data.funding) results.perp[ex].funding.push(data.funding);
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }
  
  // Calculate average funding
  for (const ex of Object.keys(results.perp)) {
    const f = results.perp[ex].funding;
    results.perp[ex].avgFunding = f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
    delete results.perp[ex].funding;
  }
  
  return results;
}

// Get latest record
function getLatestRecord() {
  const data = loadDayData('flow');
  return data.length ? data[data.length - 1] : null;
}

// Export for use in server
module.exports = { collect, getHistoricalFlow, getLatestRecord, loadDayData };

// Run if executed directly
if (require.main === module) {
  console.log('🐻 BERA Flow Collector starting...');
  console.log(`   Data dir: ${DATA_DIR}`);
  console.log(`   Interval: ${POLL_INTERVAL / 1000}s`);
  
  // Run immediately
  collect().catch(e => console.error('Collection error:', e));
  
  // Then on interval
  setInterval(() => {
    collect().catch(e => console.error('Collection error:', e));
  }, POLL_INTERVAL);
}
