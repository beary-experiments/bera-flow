// Combined starter - runs server + collector
const { spawn } = require('child_process');
const path = require('path');

console.log('🐻 BERA Flow Dashboard + Collector');
console.log('===================================\n');

// Start collector
const collector = require('./collector.js');
console.log('[Collector] Starting background data collection...\n');

// Initial collection
collector.collect().catch(e => console.error('[Collector] Error:', e.message));

// Collection interval (5 min)
setInterval(() => {
  collector.collect().catch(e => console.error('[Collector] Error:', e.message));
}, 5 * 60 * 1000);

// Start server (import after collector to share any state)
require('./server.js');
