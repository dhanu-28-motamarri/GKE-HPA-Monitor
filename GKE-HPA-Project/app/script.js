/**
 * GKE HPA Monitor - Production Observability Frontend Logic
 * Strictly preserves security boundaries: No privileged in-browser shell execution.
 * Distinguishes manifest specifications, live API telemetry, and sample preview data.
 */

// ============================================================================
// Global Cluster & Manifest Configuration
// ============================================================================
const CONFIG = {
    deploymentName: 'gke-hpa-monitor',
    serviceName: 'gke-hpa-monitor-service',
    hpaName: 'gke-hpa-monitor-hpa',
    minReplicas: 2,
    maxReplicas: 10,
    targetCpuUtilization: 50, // 50% average CPU target
    cpuRequestMillicores: 100, // 100m
    cpuLimitMillicores: 250,   // 250m
    memRequestMiB: 128,        // 128Mi
    memLimitMiB: 256,          // 256Mi
    apiBaseUrl: '/api',
    pollIntervalMs: 5000
};

// ============================================================================
// State Management
// ============================================================================
const state = {
    isSampleMode: false,
    isApiConnected: false,
    lastRefreshed: null,
    pods: [],
    hpa: {
        currentReplicas: 2,
        desiredReplicas: 2,
        currentCpuPercent: null,
        condition: 'Stabilized'
    },
    events: [],
    metricsHistory: {
        timestamps: [],
        cpuPercentages: [],
        memoryMiB: []
    }
};

// ============================================================================
// Sample Telemetry Dataset (Representative Simulation for Preview Mode)
// ============================================================================
const SAMPLE_DATA = {
    pods: [
        { name: 'gke-hpa-monitor-7b8f94d84-c8vx2', status: 'Running', ready: '1/1', cpu: '24m (24%)', mem: '34 MiB', restarts: 0, ip: '10.244.1.18' },
        { name: 'gke-hpa-monitor-7b8f94d84-m9pl0', status: 'Running', ready: '1/1', cpu: '22m (22%)', mem: '31 MiB', restarts: 0, ip: '10.244.2.14' },
        { name: 'gke-hpa-monitor-7b8f94d84-xk45w', status: 'Running', ready: '1/1', cpu: '68m (68%)', mem: '38 MiB', restarts: 0, ip: '10.244.1.19' },
        { name: 'gke-hpa-monitor-7b8f94d84-9zq2a', status: 'Running', ready: '1/1', cpu: '71m (71%)', mem: '36 MiB', restarts: 0, ip: '10.244.2.15' }
    ],
    hpa: {
        currentReplicas: 4,
        desiredReplicas: 4,
        currentCpuPercent: 46,
        condition: 'ScalingActive'
    },
    events: [
        {
            time: '2m ago',
            type: 'ScaleUp',
            replicas: '2 → 4 pods',
            reason: 'SuccessfulRescale',
            desc: 'New size: 4; reason: cpu resource utilization (percentage of request) above target 50%'
        },
        {
            time: '12m ago',
            type: 'Normal',
            replicas: '2 pods',
            reason: 'MetricsEvaluation',
            desc: 'Observed average utilization: 18% / 50% target. Within threshold.'
        },
        {
            time: '25m ago',
            type: 'Normal',
            replicas: '2 pods',
            reason: 'DeploymentInitialized',
            desc: 'HorizontalPodAutoscaler created targeting Deployment/gke-hpa-monitor'
        }
    ],
    metricsHistory: {
        timestamps: ['10m ago', '8m ago', '6m ago', '4m ago', '2m ago', 'Just now'],
        cpuPercentages: [15, 18, 42, 78, 65, 46],
        memoryMiB: [30, 31, 33, 38, 36, 35]
    }
};

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initMobileDrawer();
    initBannerDismiss();
    initSampleModeToggle();
    initCopyCommand();
    initBackendStressTestTrigger();
    initRefreshButton();

    // Check cluster backend connectivity
    checkBackendConnectivity();

    // Initial render based on static manifest specifications
    renderDashboard();

    // Setup periodic polling
    setInterval(() => {
        if (!state.isSampleMode) {
            checkBackendConnectivity();
        }
    }, CONFIG.pollIntervalMs);
});

// ============================================================================
// Navigation & UX Handlers
// ============================================================================
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section-container');

    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 120;
            if (window.scrollY >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });

    // Close mobile drawer on navigation click
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
        });
    });
}

function initMobileDrawer() {
    const toggleBtn = document.getElementById('mobile-toggle-btn');
    const sidebar = document.getElementById('sidebar');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggleBtn) {
                sidebar.classList.remove('open');
            }
        });
    }
}

function initBannerDismiss() {
    const dismissBtn = document.getElementById('banner-dismiss-btn');
    const banner = document.getElementById('telemetry-banner');
    if (dismissBtn && banner) {
        dismissBtn.addEventListener('click', () => {
            banner.style.display = 'none';
        });
    }
}

function initSampleModeToggle() {
    const toggle = document.getElementById('sample-mode-toggle');
    const label = document.getElementById('preview-mode-label');

    if (toggle) {
        toggle.addEventListener('change', (e) => {
            state.isSampleMode = e.target.checked;
            if (state.isSampleMode) {
                label.innerHTML = '<span class="text-accent font-bold">Sample Preview Active</span>';
            } else {
                label.innerText = 'Sample Data Mode';
            }
            renderDashboard();
        });
    }
}

function initRefreshButton() {
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.classList.add('spinning');
            if (state.isSampleMode) {
                // Slightly randomize sample numbers for dynamic feeling
                SAMPLE_DATA.hpa.currentCpuPercent = Math.floor(40 + Math.random() * 25);
                SAMPLE_DATA.metricsHistory.cpuPercentages.push(SAMPLE_DATA.hpa.currentCpuPercent);
                SAMPLE_DATA.metricsHistory.cpuPercentages.shift();
                renderDashboard();
            } else {
                checkBackendConnectivity();
            }
            setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
        });
    }
}

function initCopyCommand() {
    const copyBtn = document.getElementById('btn-copy-command');
    const copyText = document.getElementById('copy-text');
    const commandPre = document.getElementById('load-command');

    if (copyBtn && commandPre) {
        copyBtn.addEventListener('click', () => {
            const command = commandPre.innerText.trim();
            navigator.clipboard.writeText(command).then(() => {
                copyText.innerText = 'Copied!';
                copyBtn.style.borderColor = 'var(--success)';
                setTimeout(() => {
                    copyText.innerText = 'Copy Command';
                    copyBtn.style.borderColor = '';
                }, 2000);
            }).catch(() => {
                copyText.innerText = 'Failed';
            });
        });
    }
}

function initBackendStressTestTrigger() {
    const triggerBtn = document.getElementById('btn-trigger-api-test');
    const feedback = document.getElementById('api-test-feedback');
    const durationInput = document.getElementById('load-duration');
    const intensityInput = document.getElementById('load-intensity');

    if (triggerBtn && feedback) {
        triggerBtn.addEventListener('click', async () => {
            feedback.innerText = 'Triggering POST /api/workload/generate-load...';
            feedback.style.color = 'var(--accent-light)';

            try {
                const response = await fetch(`${CONFIG.apiBaseUrl}/workload/generate-load`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        durationSeconds: parseInt(durationInput.value, 10) || 60,
                        concurrency: parseInt(intensityInput.value, 10) || 10
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    feedback.innerText = `Success: ${data.message || 'Stress test launched by backend'}`;
                    feedback.style.color = 'var(--success)';
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (err) {
                feedback.innerText = `Backend Unreachable (${err.message}). In static NGINX mode, run Method A in terminal.`;
                feedback.style.color = 'var(--warning)';
            }
        });
    }
}

// ============================================================================
// Telemetry Backend Connectivity Checker
// ============================================================================
async function checkBackendConnectivity() {
    const statusDot = document.getElementById('sidebar-indicator-dot');
    const statusTitle = document.getElementById('sidebar-status-title');
    const statusHint = document.getElementById('sidebar-status-hint');

    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/cluster/status`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-cache'
        });

        if (response.ok) {
            const data = await response.json();
            state.isApiConnected = true;
            statusDot.classList.add('online');
            statusTitle.innerText = 'Backend Connected';
            statusHint.innerText = 'Live In-Cluster Telemetry';

            // Update live telemetry state if API available
            state.pods = data.pods || [];
            state.hpa = data.hpa || state.hpa;
            state.events = data.events || [];
            state.metricsHistory = data.metricsHistory || state.metricsHistory;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch {
        state.isApiConnected = false;
        statusDot.classList.remove('online');
        statusTitle.innerText = 'Frontend Standalone';
        statusHint.innerText = 'API Disconnected';
    }

    if (!state.isSampleMode) {
        renderDashboard();
    }
}

// ============================================================================
// Core Dashboard Rendering
// ============================================================================
function renderDashboard() {
    renderKPIs();
    renderPodsTable();
    renderHpaSection();
    renderCharts();
    renderScalingEvents();
}

function renderKPIs() {
    const clusterStatusEl = document.getElementById('kpi-cluster-status');
    const clusterDetailEl = document.getElementById('kpi-cluster-detail');
    const podCountEl = document.getElementById('kpi-pod-count');
    const podSubtitleEl = document.getElementById('kpi-pod-subtitle');
    const desiredReplicasEl = document.getElementById('kpi-desired-replicas');
    const minMaxEl = document.getElementById('kpi-min-max');
    const targetCpuEl = document.getElementById('kpi-target-cpu');

    minMaxEl.innerText = `${CONFIG.minReplicas} / ${CONFIG.maxReplicas}`;
    targetCpuEl.innerText = `${CONFIG.targetCpuUtilization}%`;

    if (state.isSampleMode) {
        clusterStatusEl.innerHTML = '<span class="badge badge-warning">Sample Mode</span>';
        clusterDetailEl.innerText = 'Simulated Cluster Preview';
        podCountEl.innerHTML = `${SAMPLE_DATA.pods.length} <span class="kpi-unit">(Active)</span>`;
        podSubtitleEl.innerText = 'Simulated live running pods';
        desiredReplicasEl.innerText = SAMPLE_DATA.hpa.desiredReplicas;
    } else if (state.isApiConnected) {
        clusterStatusEl.innerHTML = '<span class="badge badge-success">Live API</span>';
        clusterDetailEl.innerText = 'GKE Metrics Server Connected';
        podCountEl.innerText = state.pods.length;
        podSubtitleEl.innerText = 'Live reported pods in cluster';
        desiredReplicasEl.innerText = state.hpa.desiredReplicas;
    } else {
        clusterStatusEl.innerText = 'Disconnected';
        clusterDetailEl.innerText = 'No Telemetry Feed';
        podCountEl.innerHTML = `2 <span class="kpi-unit">(Spec)</span>`;
        podSubtitleEl.innerText = 'Initial manifest replicas';
        desiredReplicasEl.innerText = '2 (Spec)';
    }
}

function renderPodsTable() {
    const tbody = document.getElementById('pods-tbody');
    const emptyState = document.getElementById('pods-empty-state');
    const sourceBadge = document.getElementById('pod-source-badge');

    tbody.innerHTML = '';

    if (state.isSampleMode) {
        emptyState.style.display = 'none';
        sourceBadge.className = 'badge badge-warning';
        sourceBadge.innerText = 'Source: Sample Simulation';

        SAMPLE_DATA.pods.forEach(pod => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-mono">${escapeHtml(pod.name)}</td>
                <td><span class="badge badge-success">${escapeHtml(pod.status)}</span></td>
                <td><span class="text-success font-bold">${escapeHtml(pod.ready)}</span></td>
                <td><span class="font-mono">${escapeHtml(pod.cpu)}</span></td>
                <td><span class="font-mono">${escapeHtml(pod.mem)}</span></td>
                <td>${pod.restarts}</td>
                <td class="font-mono text-muted">${escapeHtml(pod.ip)}</td>
            `;
            tbody.appendChild(tr);
        });
    } else if (state.isApiConnected && state.pods.length > 0) {
        emptyState.style.display = 'none';
        sourceBadge.className = 'badge badge-success';
        sourceBadge.innerText = 'Source: Live K8s API';

        state.pods.forEach(pod => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-mono">${escapeHtml(pod.name)}</td>
                <td><span class="badge badge-success">${escapeHtml(pod.status)}</span></td>
                <td>${escapeHtml(pod.ready || '1/1')}</td>
                <td class="font-mono">${escapeHtml(pod.cpu || 'N/A')}</td>
                <td class="font-mono">${escapeHtml(pod.mem || 'N/A')}</td>
                <td>${pod.restarts ?? 0}</td>
                <td class="font-mono text-muted">${escapeHtml(pod.ip || 'ClusterIP')}</td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        // Disconnected mode: Render static spec rows to show what is deployed
        sourceBadge.className = 'badge badge-neutral';
        sourceBadge.innerText = 'Source: Manifest Definition';
        emptyState.style.display = 'none';

        // Render the 2 defined replicas from k8s/deployment.yaml
        for (let i = 1; i <= CONFIG.minReplicas; i++) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-mono text-secondary">${CONFIG.deploymentName}-spec-replica-${i}</td>
                <td><span class="badge badge-info">Provisioned (Spec)</span></td>
                <td>1/1 Expected</td>
                <td><span class="text-muted">Awaiting Metrics Server</span></td>
                <td><span class="text-muted">Awaiting Metrics Server</span></td>
                <td>0</td>
                <td class="font-mono text-muted">Awaiting Cluster</td>
            `;
            tbody.appendChild(tr);
        }
    }
}

function renderHpaSection() {
    const gaugeFill = document.getElementById('hpa-gauge-fill');
    const gaugeText = document.getElementById('hpa-gauge-text');
    const currentReplicasEl = document.getElementById('hpa-current-replicas');
    const desiredReplicasEl = document.getElementById('hpa-desired-replicas');
    const conditionBadge = document.getElementById('hpa-condition-badge');

    if (state.isSampleMode) {
        const cpu = SAMPLE_DATA.hpa.currentCpuPercent;
        gaugeFill.style.width = `${Math.min(cpu, 100)}%`;
        if (cpu > CONFIG.targetCpuUtilization) {
            gaugeFill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
        } else {
            gaugeFill.style.background = 'linear-gradient(90deg, #3b82f6, #06b6d4)';
        }
        gaugeText.innerText = `${cpu}% (Average of Pod Requests)`;
        currentReplicasEl.innerText = SAMPLE_DATA.hpa.currentReplicas;
        desiredReplicasEl.innerText = SAMPLE_DATA.hpa.desiredReplicas;
        conditionBadge.className = 'badge badge-warning';
        conditionBadge.innerText = 'Scaling Active';
    } else if (state.isApiConnected && state.hpa.currentCpuPercent !== null) {
        const cpu = state.hpa.currentCpuPercent;
        gaugeFill.style.width = `${Math.min(cpu, 100)}%`;
        gaugeText.innerText = `${cpu}%`;
        currentReplicasEl.innerText = state.hpa.currentReplicas;
        desiredReplicasEl.innerText = state.hpa.desiredReplicas;
        conditionBadge.innerText = state.hpa.condition;
    } else {
        gaugeFill.style.width = '0%';
        gaugeText.innerText = 'Telemetry Disconnected (Run kubectl get hpa)';
        currentReplicasEl.innerText = '2 (Spec)';
        desiredReplicasEl.innerText = '2 (Spec)';
        conditionBadge.className = 'badge badge-neutral';
        conditionBadge.innerText = 'Awaiting Telemetry';
    }
}

function renderScalingEvents() {
    const timeline = document.getElementById('events-timeline');
    const sourceBadge = document.getElementById('events-source-badge');
    const emptyState = document.getElementById('events-empty-state');

    timeline.innerHTML = '';

    if (state.isSampleMode) {
        emptyState.style.display = 'none';
        sourceBadge.className = 'badge badge-warning';
        sourceBadge.innerText = 'Sample Historical Stream';

        SAMPLE_DATA.events.forEach(ev => {
            const item = document.createElement('div');
            item.className = `timeline-item ${ev.type === 'ScaleUp' ? 'scale-up' : ''}`;
            item.innerHTML = `
                <div class="timeline-marker"></div>
                <div class="timeline-header">
                    <span class="timeline-time">${escapeHtml(ev.time)}</span>
                    <span class="timeline-title">${escapeHtml(ev.reason)} (${escapeHtml(ev.replicas)})</span>
                    <span class="badge ${ev.type === 'ScaleUp' ? 'badge-warning' : 'badge-info'}">${escapeHtml(ev.type)}</span>
                </div>
                <div class="timeline-desc">${escapeHtml(ev.desc)}</div>
            `;
            timeline.appendChild(item);
        });
    } else if (state.isApiConnected && state.events.length > 0) {
        emptyState.style.display = 'none';
        sourceBadge.className = 'badge badge-success';
        sourceBadge.innerText = 'Live Kubernetes Events';

        state.events.forEach(ev => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                <div class="timeline-marker"></div>
                <div class="timeline-header">
                    <span class="timeline-time">${escapeHtml(ev.time || 'recent')}</span>
                    <span class="timeline-title">${escapeHtml(ev.reason)}</span>
                </div>
                <div class="timeline-desc">${escapeHtml(ev.message)}</div>
            `;
            timeline.appendChild(item);
        });
    } else {
        sourceBadge.className = 'badge badge-neutral';
        sourceBadge.innerText = 'Awaiting Events API';
        emptyState.style.display = 'block';
    }
}

// ============================================================================
// HTML5 Canvas Chart Engine (Lightweight, Dependency-Free, Responsive)
// ============================================================================
function renderCharts() {
    const cpuCanvas = document.getElementById('cpuChart');
    const memCanvas = document.getElementById('memoryChart');
    const cpuOverlay = document.getElementById('cpu-empty-overlay');
    const memOverlay = document.getElementById('memory-empty-overlay');
    const cpuBadge = document.getElementById('cpu-chart-source');
    const memBadge = document.getElementById('memory-chart-source');

    if (!cpuCanvas || !memCanvas) return;

    if (state.isSampleMode) {
        cpuOverlay.style.display = 'none';
        memOverlay.style.display = 'none';
        cpuBadge.innerText = 'Sample Trend Line';
        cpuBadge.className = 'chart-badge text-warning';
        memBadge.innerText = 'Sample Trend Line';
        memBadge.className = 'chart-badge text-warning';

        drawChart(cpuCanvas, {
            labels: SAMPLE_DATA.metricsHistory.timestamps,
            values: SAMPLE_DATA.metricsHistory.cpuPercentages,
            targetThreshold: CONFIG.targetCpuUtilization,
            yMax: 100,
            unit: '%',
            color: '#3b82f6',
            fillGradient: ['rgba(59, 130, 246, 0.35)', 'rgba(59, 130, 246, 0.0)']
        });

        drawChart(memCanvas, {
            labels: SAMPLE_DATA.metricsHistory.timestamps,
            values: SAMPLE_DATA.metricsHistory.memoryMiB,
            targetThreshold: CONFIG.memLimitMiB,
            yMax: 256,
            unit: ' MiB',
            color: '#06b6d4',
            fillGradient: ['rgba(6, 182, 212, 0.35)', 'rgba(6, 182, 212, 0.0)']
        });
    } else if (state.isApiConnected && state.metricsHistory.timestamps.length > 0) {
        cpuOverlay.style.display = 'none';
        memOverlay.style.display = 'none';
        cpuBadge.innerText = 'Live Feed';
        memBadge.innerText = 'Live Feed';

        drawChart(cpuCanvas, {
            labels: state.metricsHistory.timestamps,
            values: state.metricsHistory.cpuPercentages,
            targetThreshold: CONFIG.targetCpuUtilization,
            yMax: 100,
            unit: '%',
            color: '#3b82f6',
            fillGradient: ['rgba(59, 130, 246, 0.35)', 'rgba(59, 130, 246, 0.0)']
        });

        drawChart(memCanvas, {
            labels: state.metricsHistory.timestamps,
            values: state.metricsHistory.memoryMiB,
            targetThreshold: CONFIG.memLimitMiB,
            yMax: 256,
            unit: ' MiB',
            color: '#06b6d4',
            fillGradient: ['rgba(6, 182, 212, 0.35)', 'rgba(6, 182, 212, 0.0)']
        });
    } else {
        // Disconnected state: Clear canvases and show overlays
        clearCanvas(cpuCanvas);
        clearCanvas(memCanvas);
        cpuOverlay.style.display = 'flex';
        memOverlay.style.display = 'flex';
        cpuBadge.innerText = 'Empty State';
        memBadge.innerText = 'Empty State';
    }
}

function clearCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawChart(canvas, options) {
    // Resize buffer to canvas display bounding box for sharp retina rendering
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 25, right: 25, bottom: 35, left: 45 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    // Draw horizontal grid lines & Y-axis labels
    const steps = 4;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#64748b';

    for (let i = 0; i <= steps; i++) {
        const val = Math.round((options.yMax / steps) * i);
        const y = padding.top + chartH - (i / steps) * chartH;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillText(`${val}${options.unit}`, padding.left - 8, y);
    }

    // Draw Target Threshold line if defined (e.g. 50% CPU or Memory Limit)
    if (options.targetThreshold !== undefined) {
        const thresholdY = padding.top + chartH - (options.targetThreshold / options.yMax) * chartH;
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padding.left, thresholdY);
        ctx.lineTo(width - padding.right, thresholdY);
        ctx.stroke();
        ctx.restore();
    }

    if (!options.values || options.values.length < 2) return;

    // Calculate Coordinates
    const points = options.values.map((v, idx) => {
        const x = padding.left + (idx / (options.values.length - 1)) * chartW;
        const normalizedVal = Math.min(Math.max(v, 0), options.yMax);
        const y = padding.top + chartH - (normalizedVal / options.yMax) * chartH;
        return { x, y, val: v };
    });

    // Draw Fill Gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, options.fillGradient[0]);
    gradient.addColorStop(1, options.fillGradient[1]);

    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw Smooth Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = options.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw Dots & X-axis Labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#94a3b8';

    points.forEach((p, idx) => {
        // Point dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = options.color;
        ctx.fill();
        ctx.strokeStyle = '#070d19';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // X label
        if (options.labels && options.labels[idx]) {
            ctx.fillStyle = '#64748b';
            ctx.fillText(options.labels[idx], p.x, height - padding.bottom + 10);
        }
    });
}

// Window resize listener to keep charts responsive
window.addEventListener('resize', () => {
    if (state.isSampleMode || state.isApiConnected) {
        renderCharts();
    }
});

// ============================================================================
// Utilities
// ============================================================================
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
