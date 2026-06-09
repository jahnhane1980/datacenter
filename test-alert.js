import 'dotenv/config';
import { EventBus } from './src/core/EventBus.js';

console.log('=== Erstelle Test-Events ===');

// Fake QRA Event
EventBus.emit('QRAController', 'qra_estimate_added', {
    targetQuarter: '2026-Q4',
    releaseDate: '2026-11-01',
    estimatedNetBorrowing: 600000000000, // 600 Mrd.
    estimatedTgaBalance: 850000000000 // 850 Mrd.
});

// Fake Auction Event
EventBus.emit('FiscalController', 'treasury_auction_filled', {
    cusip: '91282CGM2',
    security_type: 'Note',
    security_term: '10-Year',
    auction_date: '2026-06-09',
    total_accepted: 39000000000, // 39 Mrd.
    bid_to_cover_ratio: 2.54,
    high_yield: 4.25
});

console.log('Test-Events erfolgreich in tmp_event/sys_events.json geschrieben.');
console.log('Du kannst jetzt `node alert.js` ausführen!');
