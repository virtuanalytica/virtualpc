"use strict";
/**
 * Timeseries analyzer — CSV upload, per-column statistics, Pearson pair
 * correlations, z-score anomaly detection.
 *
 * Scoped to the ChemE simulator use case first: reactor temperature, pressure,
 * NPK, yield, market prices. Analyst + Atlas consume the output.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCsv = parseCsv;
exports.analyzeCsv = analyzeCsv;
/** Parse a CSV string into { header: string[], rows: string[][] }. */
function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0)
        return { header: [], rows: [] };
    // Simple splitter — no support for quoted commas (kept lean for ChemE data).
    const split = (l) => l.split(/[,;\t]/).map(s => s.trim());
    const header = split(lines[0]);
    const rows = lines.slice(1).map(split);
    return { header, rows };
}
/** Identify likely timestamp column by name and parseability. */
function findTimestampColumn(header, rows) {
    const namePriority = /time|timestamp|date|ts|t$/i;
    const namedIdx = header.findIndex(h => namePriority.test(h));
    if (namedIdx >= 0)
        return namedIdx;
    // Fall back: first column whose top-N values all parse as dates. Require the
    // value to be NON-numeric first — Date.parse() leniently accepts bare
    // integers (e.g. Date.parse('2') is a valid date), which would otherwise
    // misclassify a numeric data column (reactor temp/pressure) as the timestamp
    // and drop it from analysis entirely.
    const sample = rows.slice(0, 8);
    for (let c = 0; c < header.length; c++) {
        if (sample.length === 0)
            break;
        const allDates = sample.every(r => r[c] && isNaN(Number(r[c])) && !isNaN(Date.parse(r[c])));
        if (allDates)
            return c;
    }
    return -1;
}
function computeColumnStats(name, values, rawValues, timestamps, zThreshold = 3) {
    const n = values.length;
    if (n === 0) {
        return { name, count: 0, mean: 0, std: 0, min: 0, max: 0, anomalies: [] };
    }
    let sum = 0, min = Infinity, max = -Infinity;
    for (const v of values) {
        sum += v;
        if (v < min)
            min = v;
        if (v > max)
            max = v;
    }
    const mean = sum / n;
    let sqSum = 0;
    for (const v of values)
        sqSum += (v - mean) ** 2;
    const std = n > 1 ? Math.sqrt(sqSum / (n - 1)) : 0;
    const anomalies = [];
    if (std > 0) {
        // Walk rawValues so indexes align with the original row sequence
        let numericIdx = 0;
        for (let i = 0; i < rawValues.length; i++) {
            const raw = rawValues[i];
            if (raw === undefined || raw === '')
                continue;
            const v = Number(raw);
            if (isNaN(v))
                continue;
            const z = (v - mean) / std;
            if (Math.abs(z) > zThreshold) {
                anomalies.push({
                    index: i,
                    value: v,
                    z: Math.round(z * 100) / 100,
                    timestamp: timestamps ? timestamps[i] : undefined,
                });
            }
            numericIdx++;
        }
    }
    return {
        name,
        count: n,
        mean: Math.round(mean * 10000) / 10000,
        std: Math.round(std * 10000) / 10000,
        min,
        max,
        anomalies,
    };
}
function pearson(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3)
        return { r: 0, n };
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += xs[i];
        sumY += ys[i];
        sumXY += xs[i] * ys[i];
        sumX2 += xs[i] * xs[i];
        sumY2 += ys[i] * ys[i];
    }
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denominator === 0)
        return { r: 0, n };
    return { r: Math.round((numerator / denominator) * 10000) / 10000, n };
}
function analyzeCsv(text, opts = {}) {
    const started = Date.now();
    const zThreshold = opts.zThreshold ?? 3;
    const maxPairs = opts.maxCorrelationPairs ?? 50;
    const { header, rows } = parseCsv(text);
    if (header.length === 0) {
        return {
            rowCount: 0, columnCount: 0, timestampColumn: null,
            columns: [], correlations: [], topAnomalies: [], processingMs: Date.now() - started,
        };
    }
    const tsColIdx = findTimestampColumn(header, rows);
    const timestampColumn = tsColIdx >= 0 ? header[tsColIdx] : null;
    const timestamps = tsColIdx >= 0 ? rows.map(r => r[tsColIdx] || '') : null;
    // For each non-timestamp column, collect numeric values
    const columnStats = [];
    const numericColumns = [];
    for (let c = 0; c < header.length; c++) {
        if (c === tsColIdx)
            continue;
        const raw = rows.map(r => r[c]);
        const vals = [];
        for (const r of raw) {
            if (r === undefined || r === '')
                continue;
            const v = Number(r);
            if (!isNaN(v))
                vals.push(v);
        }
        // Only treat as numeric if most values parse
        if (vals.length >= rows.length * 0.5 && vals.length >= 3) {
            columnStats.push(computeColumnStats(header[c], vals, raw, timestamps, zThreshold));
            numericColumns.push({ name: header[c], values: vals });
        }
    }
    // Pair correlations — O(k²) over numeric columns, capped
    const correlations = [];
    for (let i = 0; i < numericColumns.length; i++) {
        for (let j = i + 1; j < numericColumns.length; j++) {
            const a = numericColumns[i];
            const b = numericColumns[j];
            const minLen = Math.min(a.values.length, b.values.length);
            const { r, n } = pearson(a.values.slice(0, minLen), b.values.slice(0, minLen));
            if (Math.abs(r) >= 0.3) {
                correlations.push({ a: a.name, b: b.name, pearson: r, n });
            }
        }
    }
    correlations.sort((x, y) => Math.abs(y.pearson) - Math.abs(x.pearson));
    if (correlations.length > maxPairs)
        correlations.length = maxPairs;
    // Top anomalies across all columns (ordered by |z| desc)
    const topAnomalies = [];
    for (const col of columnStats) {
        for (const a of col.anomalies) {
            topAnomalies.push({ column: col.name, index: a.index, value: a.value, z: a.z, timestamp: a.timestamp });
        }
    }
    topAnomalies.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
    if (topAnomalies.length > 20)
        topAnomalies.length = 20;
    return {
        rowCount: rows.length,
        columnCount: header.length,
        timestampColumn,
        columns: columnStats,
        correlations,
        topAnomalies,
        processingMs: Date.now() - started,
    };
}
//# sourceMappingURL=timeseries.js.map