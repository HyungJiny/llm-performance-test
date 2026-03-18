// Internal state for stats
let testRunning = false;
let sseSource = null;

// Metrics storage
let results = [];
let currentConfig = null;
let chartLatency, chartTps;

// DOM Elements
const form = document.getElementById('config-form');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnClear = document.getElementById('btn-clear');
const btnExportJson = document.getElementById('btn-export-json');
const btnExportMd = document.getElementById('btn-export-md');
const dot = document.getElementById('run-status-dot');
const statusText = document.getElementById('run-status-text');

// Initialize Charts
function initCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    const ctxLat = document.getElementById('chart-latency').getContext('2d');
    chartLatency = new Chart(ctxLat, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Latency (s)', borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', data: [], fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, animation: { duration: 0 } }
    });

    const ctxTps = document.getElementById('chart-tps').getContext('2d');
    chartTps = new Chart(ctxTps, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'TPS', borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', data: [], fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, animation: { duration: 0 } }
    });
}

function updateStatsUI() {
    if (results.length === 0) {
        document.getElementById('stat-total').innerText = '0';
        document.getElementById('stat-success').innerText = '100%';
        document.getElementById('stat-tokens').innerText = '0';
        
        const resetIds = ['val-ttft-avg', 'val-ttft-min', 'val-ttft-max', 'val-lat-avg', 'val-lat-min', 'val-lat-max', 'val-tpot-avg', 'val-tpot-min', 'val-tpot-max', 'val-tps-avg', 'val-tps-min', 'val-tps-max'];
        resetIds.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerText = '0.00';
        });
        return;
    }

    const successful = results.filter(r => r.success);
    const errCount = results.length - successful.length;
    
    document.getElementById('stat-total').innerText = results.length;
    document.getElementById('stat-success').innerText = `${((successful.length / results.length) * 100).toFixed(1)}%`;
    
    let totalTokens = 0;
    let sumTtft = 0, sumLat = 0, sumTpot = 0, sumTps = 0;
    let minTtft = Infinity, maxTtft = 0;
    let minLat = Infinity, maxLat = 0;
    let minTpot = Infinity, maxTpot = 0;
    let minTps = Infinity, maxTps = 0;

    successful.forEach(r => {
        totalTokens += r.output_tokens;
        
        sumTtft += r.ttft;
        minTtft = Math.min(minTtft, r.ttft);
        maxTtft = Math.max(maxTtft, r.ttft);
        
        sumLat += r.latency;
        minLat = Math.min(minLat, r.latency);
        maxLat = Math.max(maxLat, r.latency);
        
        let tpot = r.tpot * 1000; // to ms
        if(tpot > 0) {
            sumTpot += tpot;
            minTpot = Math.min(minTpot, tpot);
            maxTpot = Math.max(maxTpot, tpot);
        }

        let tps = r.latency > 0 ? (r.output_tokens / r.latency) : 0;
        sumTps += tps;
        minTps = Math.min(minTps, tps);
        maxTps = Math.max(maxTps, tps);
    });

    document.getElementById('stat-tokens').innerText = totalTokens;

    const vTtftAvg = successful.length ? (sumTtft / successful.length) : 0;
    const vLatAvg = successful.length ? (sumLat / successful.length) : 0;
    const vTpotAvg = successful.length ? (sumTpot / successful.length) : 0;
    const vTpsAvg = successful.length ? (sumTps / successful.length) : 0;

    const fmt = (v) => v === Infinity ? "0.00" : v.toFixed(2);

    document.getElementById('val-ttft-avg').innerText = fmt(vTtftAvg);
    document.getElementById('val-ttft-min').innerText = fmt(minTtft);
    document.getElementById('val-ttft-max').innerText = fmt(maxTtft);

    document.getElementById('val-lat-avg').innerText = fmt(vLatAvg);
    document.getElementById('val-lat-min').innerText = fmt(minLat);
    document.getElementById('val-lat-max').innerText = fmt(maxLat);

    document.getElementById('val-tpot-avg').innerText = fmt(vTpotAvg);
    document.getElementById('val-tpot-min').innerText = fmt(minTpot);
    document.getElementById('val-tpot-max').innerText = fmt(maxTpot);

    document.getElementById('val-tps-avg').innerText = fmt(vTpsAvg);
    document.getElementById('val-tps-min').innerText = fmt(minTps);
    document.getElementById('val-tps-max').innerText = fmt(maxTps);
}

function appendLog(reqNo, metric) {
    const tbody = document.querySelector('#logs-table tbody');
    const tr = document.createElement('tr');
    
    let tps = metric.latency > 0 ? (metric.output_tokens / metric.latency).toFixed(2) : "0.00";

    if (metric.success) {
        tr.innerHTML = `
            <td>${reqNo}</td>
            <td class="status-ok">OK</td>
            <td>${metric.ttft.toFixed(3)}</td>
            <td>${metric.latency.toFixed(3)}</td>
            <td>${metric.output_tokens}</td>
            <td>${metric.prompt_tokens}</td>
            <td>${tps}</td>
        `;
    } else {
        tr.innerHTML = `
            <td>${reqNo}</td>
            <td class="status-err">ERR</td>
            <td colspan="5">${metric.error || 'Unknown Error'}</td>
        `;
    }
    
    tbody.prepend(tr);
    if (tbody.children.length > 50) {
        tbody.removeChild(tbody.lastChild);
    }
}

function updateCharts(reqNo, metric) {
    if (!metric.success) return;

    chartLatency.data.labels.push(reqNo);
    chartLatency.data.datasets[0].data.push(metric.latency);
    
    let tps = metric.latency > 0 ? (metric.output_tokens / metric.latency) : 0;
    chartTps.data.labels.push(reqNo);
    chartTps.data.datasets[0].data.push(tps);

    // Keep last 50 points
    if (chartLatency.data.labels.length > 50) {
        chartLatency.data.labels.shift();
        chartLatency.data.datasets[0].data.shift();
        chartTps.data.labels.shift();
        chartTps.data.datasets[0].data.shift();
    }

    chartLatency.update();
    chartTps.update();
}

function resetUI() {
    results = [];
    document.querySelector('#logs-table tbody').innerHTML = '';
    
    // Completely recreate canvas elements to prevent Chart.js state errors
    const containerLat = document.getElementById('chart-latency').parentElement;
    containerLat.innerHTML = '<canvas id="chart-latency"></canvas>';
    
    const containerTps = document.getElementById('chart-tps').parentElement;
    containerTps.innerHTML = '<canvas id="chart-tps"></canvas>';
    
    initCharts();
    updateStatsUI();
}

function handleSSE() {
    sseSource = new EventSource('/api/stream_metrics');
    
    sseSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'status' && data.status === 'completed') {
            stopTestLocal();
            return;
        }

        if (data.type === 'metric') {
            results.push(data);
            const reqNo = results.length;
            updateStatsUI();
            appendLog(reqNo, data);
            updateCharts(reqNo, data);
        }
    };

    sseSource.onerror = (e) => {
        console.error("SSE Error", e);
        stopTestLocal();
    };
}

async function startTest(e) {
    e.preventDefault();
    
    let customParams = {};
    const customTxt = document.getElementById('custom_params').value;
    if (customTxt.trim() !== '') {
        try { customParams = JSON.parse(customTxt); } 
        catch (e) { alert("Invalid JSON in custom parameters"); return; }
    }

    const payload = {
        base_url: document.getElementById('base_url').value,
        api_key: document.getElementById('api_key').value || "EMPTY",
        model: document.getElementById('model').value,
        concurrency: parseInt(document.getElementById('concurrency').value),
        iterations: parseInt(document.getElementById('iterations').value),
        duration: parseInt(document.getElementById('duration').value),
        prompt: document.getElementById('prompt').value,
        custom_params: customParams
    };

    try {
        const res = await fetch('/api/start_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.status === 'started') {
            resetUI();
            currentConfig = payload;
            testRunning = true;
            btnStart.disabled = true;
            btnStop.disabled = false;
            dot.className = 'dot running';
            statusText.innerText = 'Running...';
            handleSSE();
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) {
        console.error("Start test error:", err);
        alert(`Failed to start test.\nError: ${err.message}\nStack: ${err.stack}`);
    }
}

async function stopTest() {
    try {
        await fetch('/api/stop_test', { method: 'POST' });
        stopTestLocal();
    } catch (e) {
        console.error("Failed to stop test", e);
    }
}

function stopTestLocal() {
    testRunning = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
    dot.className = 'dot';
    statusText.innerText = 'Completed';
    if (sseSource) {
        sseSource.close();
        sseSource = null;
    }
}

function clearResults() {
    if(testRunning) return alert("Cannot clear while test is running.");
    resetUI();
}

function exportJson() {
    if (results.length === 0) return alert("No metrics to export.");
    
    // YYYYMMDD_HHMM format
    const now = new Date();
    const ts = now.getFullYear() + 
               String(now.getMonth() + 1).padStart(2, '0') + 
               String(now.getDate()).padStart(2, '0') + "_" + 
               String(now.getHours()).padStart(2, '0') + 
               String(now.getMinutes()).padStart(2, '0');
               
    const exportData = {
        configuration: {
            ...currentConfig,
            test_date: now.toLocaleString()
        },
        metrics: results
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const link = document.createElement("a");
    link.href = dataStr;
    link.download = `llm_metrics_${ts}.json`;
    link.click();
}

function exportMd() {
    if (results.length === 0) return alert("No metrics to export.");
    let md = `# LLM Performance Test Report\n\n`;
    
    const now = new Date();
    md += `**Test Date**: ${now.toLocaleString()}\n\n`;
    
    if (currentConfig) {
        md += `## Configuration\n`;
        md += `- **Base URL**: ${currentConfig.base_url}\n`;
        md += `- **Model**: ${currentConfig.model}\n`;
        md += `- **Concurrency**: ${currentConfig.concurrency}\n`;
        md += `- **Iterations / User**: ${currentConfig.iterations}\n`;
        md += `- **Duration limit (s)**: ${currentConfig.duration}\n`;
        md += `- **Prompt**: ${currentConfig.prompt}\n`;
        md += `- **Custom Params**: ${JSON.stringify(currentConfig.custom_params)}\n\n`;
    }
    
    md += `## 1. Summary\n`;
    md += `- Total Requests: ${results.length}\n`;
    const successful = results.filter(r => r.success);
    md += `- Success Rate: ${((successful.length / results.length) * 100).toFixed(1)}%\n`;
    
    let sumTtft = 0, sumLat = 0, sumTpot = 0, sumTps = 0;
    successful.forEach(r => {
        sumTtft += r.ttft;
        sumLat += r.latency;
        let tpotMs = r.tpot * 1000;
        if(tpotMs > 0) sumTpot += tpotMs;
        if(r.latency > 0) sumTps += (r.output_tokens / r.latency);
    });
    
    let avgTtft = successful.length ? sumTtft / successful.length : 0;
    let avgLat = successful.length ? sumLat / successful.length : 0;
    let avgTpot = successful.length ? sumTpot / successful.length : 0;
    let avgTps = successful.length ? sumTps / successful.length : 0;

    md += `- Average TTFT: ${avgTtft.toFixed(3)} s\n`;
    md += `- Average Latency: ${avgLat.toFixed(3)} s\n`;
    md += `- Average TPOT: ${avgTpot.toFixed(3)} ms\n`;
    md += `- Average TPS: ${avgTps.toFixed(3)} tokens/s\n\n`;
    
    md += `## 2. Raw Results (Top 100)\n`;
    md += `| Request # | Success | TTFT (s) | Latency (s) | TPOT (ms) | Output Tokens | TPS |\n`;
    md += `|---|---|---|---|---|---|---|\n`;
    
    results.slice(0, 100).forEach((r, i) => {
        let tpotStr = r.tpot ? (r.tpot * 1000).toFixed(2) : "0.00";
        let tpsStr = r.latency > 0 ? (r.output_tokens / r.latency).toFixed(2) : "0.00";
        md += `| ${i+1} | ${r.success ? 'Pass ✅' : 'Fail ❌'} | ${r.ttft.toFixed(3)} | ${r.latency.toFixed(3)} | ${tpotStr} | ${r.output_tokens} | ${tpsStr} |\n`;
    });
    
    // YYYYMMDD_HHMM format
    const ts = now.getFullYear() + 
               String(now.getMonth() + 1).padStart(2, '0') + 
               String(now.getDate()).padStart(2, '0') + "_" + 
               String(now.getHours()).padStart(2, '0') + 
               String(now.getMinutes()).padStart(2, '0');
               
    const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    const link = document.createElement("a");
    link.href = dataStr;
    link.download = `llm_report_${ts}.md`;
    link.click();
}

// Event Listeners
form.addEventListener('submit', startTest);
btnStop.addEventListener('click', stopTest);
btnClear.addEventListener('click', clearResults);
btnExportJson.addEventListener('click', exportJson);
btnExportMd.addEventListener('click', exportMd);

document.addEventListener('DOMContentLoaded', initCharts);
