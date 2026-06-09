import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export class ArchiveRepository {
    constructor(archiveDir = 'archives') {
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }

        const dbPath = path.join(archiveDir, 'm5_candles.sqlite');
        this.db = new Database(dbPath);

        this.initDatabase();
    }

    initDatabase() {
        this.db.pragma('journal_mode = WAL');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS market_m5_candles (
                ticker INTEGER NOT NULL,
                timestamp INTEGER NOT NULL,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                volume INTEGER,
                vwap REAL,
                trades INTEGER,
                PRIMARY KEY (ticker, timestamp)
            ) WITHOUT ROWID;
        `);

        // Prepare the upsert statement for performance
        this.upsertStmt = this.db.prepare(`
            INSERT INTO market_m5_candles (ticker, timestamp, open, high, low, close, volume, vwap, trades)
            VALUES (@ticker, @timestamp, @open, @high, @low, @close, @volume, @vwap, @trades)
            ON CONFLICT(ticker, timestamp) DO UPDATE SET
                open=excluded.open,
                high=excluded.high,
                low=excluded.low,
                close=excluded.close,
                volume=excluded.volume,
                vwap=excluded.vwap,
                trades=excluded.trades
        `);
    }

    upsertM5Candles(candles) {
        if (!candles || candles.length === 0) return 0;

        const insertMany = this.db.transaction((candlesToInsert) => {
            let count = 0;
            for (const candle of candlesToInsert) {
                this.upsertStmt.run({
                    ticker: candle.ticker,
                    timestamp: candle.timestamp,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume,
                    vwap: candle.vwap,
                    trades: candle.trades
                });
                count++;
            }
            return count;
        });

        return insertMany(candles);
    }
}
