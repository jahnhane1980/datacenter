export class SellingClimaxScorer {
    /**
     * Bewertet die aktuellen Marktdaten einer Aktie, um einen "Selling Climax" zu erkennen.
     * 
     * @param {Object} data 
     * @param {Array} data.candles - Array von Daily Candles, aufsteigend sortiert. Benötigt mind. 21 Kerzen.
     * @param {Array} [data.optionsVolume] - Array der letzten CBOE Options-Volumina (mind. 5).
     * @param {Array} [data.shortVolumeRatios] - Array der letzten Short-Volume Ratios (als Dezimalzahl, 0.0 - 1.0, mind. 3).
     * @returns {Object} { score: number, isClimax: boolean, reasons: Array<string> }
     */
    static calculateScore(data) {
        let score = 0;
        let reasons = [];
        
        if (!data || !data.candles || data.candles.length < 21) {
            return { score: 0, isClimax: false, reasons: ["Nicht genug Candle-Daten (benötigt mind. 21 Tage für SMA)"] };
        }

        const candles = data.candles;
        const today = candles[candles.length - 1];
        
        // --- 1. Volumen-Explosion (Max 30 Punkte) ---
        let volSum = 0;
        for (let i = candles.length - 21; i < candles.length - 1; i++) {
            volSum += candles[i].volume;
        }
        const avgVol20 = volSum / 20;
        const volRatio = avgVol20 > 0 ? today.volume / avgVol20 : 0;
        
        if (volRatio > 3.0) {
            score += 30;
            reasons.push(`Massive Volumen-Explosion: ${(volRatio).toFixed(1)}x über dem 20-Tage-Schnitt`);
        } else if (volRatio > 2.0) {
            score += 20;
            reasons.push(`Hohes Volumen: ${(volRatio).toFixed(1)}x über dem 20-Tage-Schnitt`);
        } else if (volRatio > 1.3) {
            score += 10;
        }

        // --- 2. Price Action: Recovery from Low (Max 35 Punkte) ---
        const totalRange = today.high - today.low;
        const recoveryFromLow = today.close - today.low; // Käufer-Erholung vom absoluten Tief
        
        if (totalRange > 0) {
            const recoveryRatio = recoveryFromLow / totalRange;
            
            if (recoveryRatio > 0.6) {
                score += 35;
                reasons.push(`Extreme Erholung vom Tiefpunkt: Käufer haben ${(recoveryRatio * 100).toFixed(0)}% der Kerzenspanne zurückerobert`);
            } else if (recoveryRatio > 0.4) {
                score += 20;
            }

            // Gab es einen Panik-Abverkauf?
            const prevClose = candles[candles.length - 2].close;
            const dropFromOpen = ((today.open - today.low) / today.open) * 100;
            const gapDown = ((prevClose - today.open) / prevClose) * 100;
            
            if (gapDown > 4.0) {
                score += 15; 
                reasons.push(`Panik-Gap-Down: Eröffnete ${gapDown.toFixed(1)}% unter dem Vortagesschluss`);
            } else if (dropFromOpen > 4.0) {
                score += 15;
                reasons.push(`Schwerer Intraday-Drop: Fiel um ${dropFromOpen.toFixed(1)}% vom Open`);
            } else if (dropFromOpen > 2.0 || gapDown > 2.0) {
                score += 5;
            }
        }

        // --- 3. Options-Panik: Volumen Spike (Max 15 Punkte) ---
        if (data.optionsVolume && data.optionsVolume.length >= 5) {
            const todayOptVol = data.optionsVolume[data.optionsVolume.length - 1];
            const avgOptVol = data.optionsVolume.slice(-5, -1).reduce((a,b) => a+b, 0) / 4;
            
            if (avgOptVol > 0) {
                const optVolRatio = todayOptVol / avgOptVol;
                if (optVolRatio > 1.8) {
                    score += 15;
                    reasons.push(`Options-Panik: CBOE Volumen ist um ${(optVolRatio).toFixed(1)}x explodiert`);
                } else if (optVolRatio > 1.3) {
                    score += 5;
                }
            }
        }

        // --- 4. Short-Seller-Kapitulation (Max 20 Punkte) ---
        if (data.shortVolumeRatios && data.shortVolumeRatios.length >= 2) {
            const todayShortRatio = data.shortVolumeRatios[data.shortVolumeRatios.length - 1];
            const prevShortRatio = data.shortVolumeRatios[data.shortVolumeRatios.length - 2];
            
            // Wenn Shorts zuvor über 40% des Volumens ausmachten und plötzlich stark covern
            if (prevShortRatio > 0.40 && todayShortRatio < prevShortRatio * 0.9) {
                score += 20;
                reasons.push(`Massives Short-Covering: Short-Quote fiel plötzlich von ${(prevShortRatio*100).toFixed(1)}% auf ${(todayShortRatio*100).toFixed(1)}%`);
            } else if (todayShortRatio > 0.60) {
                score += 5;
            }
        }

        // --- Cap the score at 100 ---
        score = Math.min(score, 100);

        return {
            score: score,
            isClimax: score >= 80,
            reasons: reasons
        };
    }
}
