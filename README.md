# 🐻 BERA Flow Dashboard

Real-time taker flow analysis for $BERA across 7 spot and 5 perpetual exchanges.

![Dashboard Preview](https://img.shields.io/badge/exchanges-9-blue) ![Data](https://img.shields.io/badge/data-real--time-green)

## Features

- **Aggregated Spot Flow** — Binance, OKX, Upbit, Bybit, KuCoin, MEXC, Bitget
- **Perpetuals Flow** — Binance, OKX (taker buy/sell breakdown)
- **Funding Rates** — Binance, OKX, Bybit, MEXC
- **Open Interest** — 5 exchanges
- **Korean Market** — Upbit KRW orderbook + flow
- **Background Collector** — Builds historical data over time

## Quick Start

```bash
# Clone and run
git clone https://github.com/YOUR_USERNAME/bera-flow.git
cd bera-flow
npm start
```

Dashboard runs at `http://localhost:8080`

## Timeframes

| Period | Data Source |
|--------|-------------|
| 1H-24H | Live API data |
| 3D-30D | Binance/OKX historical + collector data |

## Data Sources

**Full Historical Support:**
- ✅ Binance spot klines (1000 candles)
- ✅ Binance perp taker flow
- ✅ OKX spot + perp taker

**Recent Snapshot (collector builds history):**
- ⚠️ Upbit — last 200 trades
- ⚠️ Bybit — last 200 trades
- ⚠️ KuCoin — last ~50 trades
- ⚠️ MEXC — last 200 trades
- ⚠️ Bitget — last 200 trades

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. Connect your GitHub repo
2. Railway auto-detects Node.js
3. Start command: `npm start`
4. Done!

## Architecture

```
bera-flow/
├── server.js      # Dashboard server + API
├── collector.js   # Background data collector (5 min interval)
├── start.js       # Combined launcher
├── index.html     # Dashboard UI
└── data/          # Stored flow data (JSON per day)
```

## API Endpoints

- `GET /api/data` — Current flow data from all exchanges
- `GET /api/depth` — Binance orderbook
- `GET /api/historical?hours=24` — Aggregated historical data

## License

MIT
