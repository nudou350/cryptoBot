// API Base URL
const API_URL = '/api';

// State
let selectedBot = '';
let updateInterval = null;
let logEventSource = null;
let autoScroll = true;
let logLineCount = 0;

// DOM Elements
const modeSelect = document.getElementById('mode');
const budgetInput = document.getElementById('budget');
const apiKeysDiv = document.getElementById('api-keys');
const apiKeyInput = document.getElementById('apiKey');
const apiSecretInput = document.getElementById('apiSecret');
const initializeBtn = document.getElementById('initialize-btn');
const configSection = document.getElementById('config-section');
const controlSection = document.getElementById('control-section');
const botSection = document.getElementById('bot-section');
const statsSection = document.getElementById('stats-section');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const backtestBtn = document.getElementById('backtest-btn');
const statusSpan = document.getElementById('status');
const botSelect = document.getElementById('bot-select');
const currentBotName = document.getElementById('current-bot-name');
const currentPrice = document.getElementById('current-price');

// Backtest modal elements
const backtestModal = document.getElementById('backtest-modal');
const backtestResults = document.getElementById('backtest-results');
const closeModal = document.querySelector('.close-modal');

// Log viewer elements
const logsSection = document.getElementById('logs-section');
const logsContainer = document.getElementById('logs-container');
const logBotName = document.getElementById('log-bot-name');
const refreshLogsBtn = document.getElementById('refresh-logs-btn');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const autoScrollToggle = document.getElementById('auto-scroll-toggle');
const logLineCountSpan = document.getElementById('log-line-count');
const logStatusSpan = document.getElementById('log-status');
const logLastUpdateSpan = document.getElementById('log-last-update');

// Performance dashboard elements
const performanceSection = document.getElementById('performance-section');

// Show/hide API keys based on mode
modeSelect.addEventListener('change', () => {
    if (modeSelect.value === 'real') {
        apiKeysDiv.style.display = 'block';
    } else {
        apiKeysDiv.style.display = 'none';
    }
});

// Initialize system
initializeBtn.addEventListener('click', async () => {
    const mode = modeSelect.value;
    const initialBudget = parseFloat(budgetInput.value);
    const apiKey = apiKeyInput.value.trim();
    const apiSecret = apiSecretInput.value.trim();

    if (!initialBudget || initialBudget < 10) {
        alert('Please enter a valid budget (minimum $10)');
        return;
    }

    if (mode === 'real' && (!apiKey || !apiSecret)) {
        alert('Please enter your Binance API credentials for real trading');
        return;
    }

    try {
        initializeBtn.disabled = true;
        initializeBtn.textContent = 'Initializing...';

        const response = await fetch(`${API_URL}/initialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, initialBudget, apiKey, apiSecret })
        });

        const data = await response.json();

        if (data.success) {
            alert('System initialized successfully!');
            configSection.style.display = 'none';
            controlSection.style.display = 'block';
            botSection.style.display = 'block';

            // Load available bots
            await loadBots();
        } else {
            alert(`Error: ${data.error}`);
            initializeBtn.disabled = false;
            initializeBtn.textContent = 'Initialize System';
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
        initializeBtn.disabled = false;
        initializeBtn.textContent = 'Initialize System';
    }
});

// Start all bots
startBtn.addEventListener('click', async () => {
    try {
        startBtn.disabled = true;
        startBtn.textContent = 'Starting...';

        const response = await fetch(`${API_URL}/start`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            statusSpan.textContent = 'Running';
            statusSpan.className = 'status running';
            startBtn.disabled = true;
            stopBtn.disabled = false;

            // Start auto-update
            startAutoUpdate();
        } else {
            alert(`Error: ${data.error}`);
            startBtn.disabled = false;
            startBtn.textContent = 'Start All Bots';
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
        startBtn.disabled = false;
        startBtn.textContent = 'Start All Bots';
    }
});

// Stop all bots
stopBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to stop all bots? This will close all open positions.')) {
        return;
    }

    try {
        stopBtn.disabled = true;
        stopBtn.textContent = 'Stopping...';

        const response = await fetch(`${API_URL}/stop`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            statusSpan.textContent = 'Stopped';
            statusSpan.className = 'status stopped';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            stopBtn.textContent = 'Stop All Bots';

            // Stop auto-update
            stopAutoUpdate();
        } else {
            alert(`Error: ${data.error}`);
            stopBtn.disabled = false;
            stopBtn.textContent = 'Stop All Bots';
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
        stopBtn.disabled = false;
        stopBtn.textContent = 'Stop All Bots';
    }
});

// Backtest button
backtestBtn.addEventListener('click', async () => {
    try {
        // Show modal with loading state
        backtestModal.classList.add('active');
        backtestResults.innerHTML = `
            <div class="backtest-loading">
                <div class="spinner"></div>
                <p>Running backtest... This may take a few minutes.</p>
                <p class="loading-subtext">Fetching 2 years of historical BTC data and simulating trades...</p>
            </div>
        `;

        backtestBtn.disabled = true;
        backtestBtn.textContent = 'Running...';

        // Get initial budget from the input
        const initialBudget = parseFloat(budgetInput.value) || 1000;

        const response = await fetch(`${API_URL}/backtest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                initialBudget: initialBudget
            })
        });

        const data = await response.json();

        if (data.success) {
            displayBacktestResults(data.results);
        } else {
            backtestResults.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #f56565;">
                    <h3>Error Running Backtest</h3>
                    <p>${data.error}</p>
                </div>
            `;
        }

        backtestBtn.disabled = false;
        backtestBtn.textContent = '📊 Run Backtest (2 Years)';
    } catch (error) {
        backtestResults.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #f56565;">
                <h3>Error</h3>
                <p>${error.message}</p>
            </div>
        `;
        backtestBtn.disabled = false;
        backtestBtn.textContent = '📊 Run Backtest (2 Years)';
    }
});

// Close modal
closeModal.addEventListener('click', () => {
    backtestModal.classList.remove('active');
});

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    if (event.target === backtestModal) {
        backtestModal.classList.remove('active');
    }
});

// Display backtest results
function displayBacktestResults(results) {
    // Sort results by total PnL to find best strategy
    const sortedResults = [...results].sort((a, b) => b.totalPnL - a.totalPnL);
    const bestStrategy = sortedResults[0];

    let html = '<div class="backtest-results-grid">';

    // Display each strategy result
    results.forEach(result => {
        const isBest = result.strategyName === bestStrategy.strategyName;
        const startDate = new Date(result.startDate).toLocaleDateString();
        const endDate = new Date(result.endDate).toLocaleDateString();
        const avgHoldingHours = (result.avgHoldingPeriod / 60).toFixed(1);

        html += `
            <div class="strategy-result">
                <h3>
                    ${result.strategyName}
                    ${isBest ? '<span class="winner-badge">🏆 BEST</span>' : ''}
                </h3>
                <p style="color: #718096; margin-bottom: 15px;">
                    <strong>Period:</strong> ${startDate} - ${endDate}
                </p>
                <div class="backtest-stats">
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Win Rate</div>
                        <div class="backtest-stat-value ${result.winRate >= 50 ? 'positive' : 'negative'}">
                            ${result.winRate.toFixed(2)}%
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Total PnL</div>
                        <div class="backtest-stat-value ${result.totalPnL >= 0 ? 'positive' : 'negative'}">
                            $${result.totalPnL.toFixed(2)} (${result.totalPnLPercent.toFixed(2)}%)
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Final Budget</div>
                        <div class="backtest-stat-value">
                            $${result.finalBudget.toFixed(2)}
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Total Trades</div>
                        <div class="backtest-stat-value">
                            ${result.totalTrades}
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Winning / Losing</div>
                        <div class="backtest-stat-value">
                            <span style="color: #48bb78;">${result.winningTrades}</span> /
                            <span style="color: #f56565;">${result.losingTrades}</span>
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Avg Win</div>
                        <div class="backtest-stat-value positive">
                            ${result.avgWinPercent.toFixed(2)}%
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Avg Loss</div>
                        <div class="backtest-stat-value negative">
                            ${result.avgLossPercent.toFixed(2)}%
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Profit Factor</div>
                        <div class="backtest-stat-value ${result.profitFactor >= 1 ? 'positive' : 'negative'}">
                            ${result.profitFactor.toFixed(2)}
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Max Drawdown</div>
                        <div class="backtest-stat-value negative">
                            $${result.maxDrawdown.toFixed(2)} (${result.maxDrawdownPercent.toFixed(2)}%)
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Largest Win</div>
                        <div class="backtest-stat-value positive">
                            $${result.largestWin.toFixed(2)}
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Largest Loss</div>
                        <div class="backtest-stat-value negative">
                            $${result.largestLoss.toFixed(2)}
                        </div>
                    </div>
                    <div class="backtest-stat">
                        <div class="backtest-stat-label">Avg Hold Time</div>
                        <div class="backtest-stat-value">
                            ${avgHoldingHours}h
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';

    // Add comparison table
    html += `
        <div class="backtest-comparison">
            <h3>📊 Strategy Comparison</h3>
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th>Strategy</th>
                        <th>Win Rate</th>
                        <th>Total PnL</th>
                        <th>Trades</th>
                        <th>Profit Factor</th>
                        <th>Max Drawdown</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sortedResults.forEach((result, index) => {
        html += `
            <tr>
                <td>
                    <strong>${result.strategyName}</strong>
                    ${index === 0 ? '<span class="winner-badge">🏆</span>' : ''}
                </td>
                <td class="${result.winRate >= 50 ? 'positive' : 'negative'}">
                    ${result.winRate.toFixed(2)}%
                </td>
                <td class="${result.totalPnL >= 0 ? 'positive' : 'negative'}">
                    $${result.totalPnL.toFixed(2)}
                </td>
                <td>${result.totalTrades}</td>
                <td class="${result.profitFactor >= 1 ? 'positive' : 'negative'}">
                    ${result.profitFactor.toFixed(2)}
                </td>
                <td class="negative">
                    $${result.maxDrawdown.toFixed(2)}
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    backtestResults.innerHTML = html;
}

// Bot selection changed
botSelect.addEventListener('change', () => {
    selectedBot = botSelect.value;

    if (selectedBot) {
        // Show individual bot stats and logs
        statsSection.style.display = 'block';
        logsSection.style.display = 'block';
        performanceSection.style.display = 'none';

        currentBotName.textContent = selectedBot;
        logBotName.textContent = selectedBot;
        updateStats();
        loadBotLogs(selectedBot);
    } else {
        // Show overall performance dashboard
        statsSection.style.display = 'none';
        logsSection.style.display = 'none';
        performanceSection.style.display = 'block';

        stopLogStream();
        loadPerformanceDashboard();
    }
});

// Update statistics
async function updateStats() {
    if (!selectedBot) return;

    try {
        const response = await fetch(`${API_URL}/stats/${selectedBot}`);
        const data = await response.json();

        if (data.success) {
            const stats = data.stats;

            // Update stat cards
            document.getElementById('stat-strategy').textContent = stats.strategy;
            document.getElementById('stat-status').textContent = stats.isRunning ? 'Running' : 'Stopped';
            document.getElementById('stat-initial-budget').textContent = `$${stats.initialBudget.toFixed(2)}`;
            document.getElementById('stat-current-budget').textContent = `$${stats.currentBudget.toFixed(2)}`;

            // PnL with color
            const pnlElement = document.getElementById('stat-total-pnl');
            pnlElement.textContent = `$${stats.totalPnL.toFixed(2)}`;
            pnlElement.className = `stat-value ${stats.totalPnL >= 0 ? 'positive' : 'negative'}`;

            document.getElementById('stat-total-trades').textContent = stats.totalTrades;
            document.getElementById('stat-winning-trades').textContent = stats.winningTrades;
            document.getElementById('stat-losing-trades').textContent = stats.losingTrades;
            document.getElementById('stat-win-rate').textContent = `${stats.winRate.toFixed(2)}%`;
            document.getElementById('stat-open-positions').textContent = stats.positions.length;
            document.getElementById('stat-open-orders').textContent = stats.openOrders.length;
            document.getElementById('stat-drawdown').textContent = `${stats.currentDrawdown.toFixed(2)}%`;

            // Update positions table
            updatePositionsTable(stats.positions);
        }
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Update positions table
function updatePositionsTable(positions) {
    const tbody = document.getElementById('positions-body');

    if (positions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No open positions</td></tr>';
        return;
    }

    tbody.innerHTML = positions.map(pos => `
        <tr>
            <td>${pos.symbol}</td>
            <td><strong>${pos.side.toUpperCase()}</strong></td>
            <td>$${pos.entryPrice.toFixed(2)}</td>
            <td>${pos.amount.toFixed(6)}</td>
            <td>$${pos.currentPrice.toFixed(2)}</td>
            <td class="${pos.unrealizedPnL >= 0 ? 'positive' : 'negative'}">
                $${pos.unrealizedPnL.toFixed(2)}
            </td>
            <td>${pos.stopLoss ? '$' + pos.stopLoss.toFixed(2) : '-'}</td>
            <td>${pos.takeProfit ? '$' + pos.takeProfit.toFixed(2) : '-'}</td>
        </tr>
    `).join('');
}

// Update current price
async function updateCurrentPrice() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const data = await response.json();

        if (data.success && data.currentPrice) {
            currentPrice.textContent = `$${data.currentPrice.toFixed(2)}`;
        }
    } catch (error) {
        console.error('Error updating price:', error);
    }
}

// Start auto-update
function startAutoUpdate() {
    // Update immediately
    if (selectedBot) {
        updateStats();
    } else {
        loadPerformanceDashboard();
    }
    updateCurrentPrice();

    // Then update every 5 seconds
    updateInterval = setInterval(() => {
        if (selectedBot) {
            updateStats();
        } else {
            loadPerformanceDashboard();
        }
        updateCurrentPrice();
    }, 5000);
}

// Stop auto-update
function stopAutoUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

// Load available bots
async function loadBots() {
    try {
        const response = await fetch(`${API_URL}/bots`);
        const data = await response.json();

        if (data.success && data.bots) {
            // Bot display names with win rates
            const botDisplayNames = {
                'GridTrading': 'Grid Trading (70-75% win rate)',
                'MeanReversion': 'Mean Reversion (65-70% win rate)',
                'TrendFollowing': 'Trend Following (60-65% win rate)',
                'Sasha-LiqProviding': 'Sasha-LiqProviding (70-75% win rate)',
                'Sasha-MMLadder': 'Sasha-MMLadder (65-70% win rate)',
                'Sasha-Hybrid': 'Sasha-Hybrid (70-75% win rate)'
            };

            // Clear existing options except the first one
            botSelect.innerHTML = '<option value="">Choose a bot...</option>';

            // Add all bots from the server
            data.bots.forEach(botName => {
                const option = document.createElement('option');
                option.value = botName;
                option.textContent = botDisplayNames[botName] || botName;
                botSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading bots:', error);
    }
}

// Check server status on load
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/status`);
        const data = await response.json();

        if (data.initialized) {
            configSection.style.display = 'none';
            controlSection.style.display = 'block';
            botSection.style.display = 'block';

            // Load bots
            await loadBots();

            if (data.running) {
                statusSpan.textContent = 'Running';
                statusSpan.className = 'status running';
                startBtn.disabled = true;
                stopBtn.disabled = false;
                startAutoUpdate();

                // Show performance dashboard by default when no bot is selected
                if (!selectedBot) {
                    performanceSection.style.display = 'block';
                    loadPerformanceDashboard();
                }
            }
        }
    } catch (error) {
        console.error('Error checking server status:', error);
    }
}

// ============= LOG VIEWER FUNCTIONALITY =============

// Load bot logs
async function loadBotLogs(botName) {
    try {
        // Stop any existing stream
        stopLogStream();

        // Clear container
        logsContainer.innerHTML = '<div class="log-empty-state"><p>Loading logs...</p></div>';
        logLineCount = 0;
        updateLogStatus('Loading...');

        // Fetch initial logs
        const response = await fetch(`${API_URL}/logs/bot/${botName}`);
        const data = await response.json();

        if (data.success && data.logs) {
            displayLogs(data.logs);
            updateLogStatus('Connected');

            // Start streaming new logs
            startLogStream(botName);
        } else {
            logsContainer.innerHTML = '<div class="log-empty-state"><p>No logs available for this bot</p></div>';
            updateLogStatus('No logs');
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        logsContainer.innerHTML = '<div class="log-empty-state"><p>Error loading logs</p></div>';
        updateLogStatus('Error');
    }
}

// Display logs in the container
function displayLogs(logs) {
    if (!logs || logs.length === 0) {
        logsContainer.innerHTML = '<div class="log-empty-state"><p>No logs available</p></div>';
        logLineCount = 0;
        updateLogLineCount();
        return;
    }

    logsContainer.innerHTML = '';
    logs.forEach(log => {
        appendLogLine(log);
    });
}

// Append a single log line
function appendLogLine(logText) {
    const logLine = document.createElement('div');
    logLine.className = 'log-line';

    // Parse log line: [timestamp] [LEVEL] [Bot] Message
    const timestampMatch = logText.match(/^\[([\d\-:T\.Z]+)\]/);
    const levelMatch = logText.match(/\[(INFO|DEBUG|WARN|ERROR)\]/);
    const botMatch = logText.match(/\[([^\]]+)\]/g);

    if (timestampMatch && levelMatch) {
        const timestamp = timestampMatch[1];
        const level = levelMatch[1];
        const botName = botMatch && botMatch[1] ? botMatch[1].replace(/[\[\]]/g, '') : '';

        // Extract message (everything after the bot name bracket)
        const messageStart = logText.indexOf(']', logText.indexOf(level) + level.length) + 1;
        const message = logText.substring(messageStart).trim();

        logLine.innerHTML = `
            <span class="log-timestamp">${new Date(timestamp).toLocaleTimeString()}</span>
            <span class="log-level-${level}">[${level}]</span>
            ${botName ? `<span class="log-bot-name">[${botName}]</span>` : ''}
            <span class="log-message">${message}</span>
        `;
    } else {
        // Raw log line if parsing fails
        logLine.innerHTML = `<span class="log-message">${logText}</span>`;
    }

    logsContainer.appendChild(logLine);
    logLineCount++;
    updateLogLineCount();

    // Auto-scroll if enabled
    if (autoScroll) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
}

// Start real-time log streaming
function startLogStream(botName) {
    // Stop any existing stream
    stopLogStream();

    // Create new EventSource for streaming
    logEventSource = new EventSource(`${API_URL}/logs/bot/${botName}/stream`);

    logEventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'log' && data.log) {
            appendLogLine(data.log);
            updateLogStatus('Live');
            updateLastUpdate();
        }
    };

    logEventSource.onerror = (error) => {
        console.error('Log stream error:', error);
        updateLogStatus('Disconnected');
        stopLogStream();
    };
}

// Stop log streaming
function stopLogStream() {
    if (logEventSource) {
        logEventSource.close();
        logEventSource = null;
    }
}

// Refresh logs button
refreshLogsBtn.addEventListener('click', () => {
    if (selectedBot) {
        loadBotLogs(selectedBot);
    }
});

// Clear logs button
clearLogsBtn.addEventListener('click', async () => {
    if (!selectedBot) return;

    if (!confirm('Are you sure you want to clear the logs for this bot?')) {
        return;
    }

    try {
        // Find the log file name
        const response = await fetch(`${API_URL}/logs`);
        const data = await response.json();

        if (data.success && data.logs) {
            // Find log file for selected bot
            const logFile = data.logs.find(log =>
                log.name.includes(selectedBot) ||
                log.name.toLowerCase().replace(/[-_]/g, '') === selectedBot.toLowerCase().replace(/[-_]/g, '')
            );

            if (logFile) {
                const deleteResponse = await fetch(`${API_URL}/logs/${logFile.name}`, {
                    method: 'DELETE'
                });

                const deleteData = await deleteResponse.json();

                if (deleteData.success) {
                    logsContainer.innerHTML = '<div class="log-empty-state"><p>Logs cleared</p></div>';
                    logLineCount = 0;
                    updateLogLineCount();
                    updateLogStatus('Cleared');
                } else {
                    alert('Error clearing logs: ' + deleteData.error);
                }
            }
        }
    } catch (error) {
        console.error('Error clearing logs:', error);
        alert('Error clearing logs');
    }
});

// Auto-scroll toggle
autoScrollToggle.addEventListener('click', () => {
    autoScroll = !autoScroll;

    if (autoScroll) {
        autoScrollToggle.classList.add('active');
        logsContainer.scrollTop = logsContainer.scrollHeight;
    } else {
        autoScrollToggle.classList.remove('active');
    }
});

// Update log line count
function updateLogLineCount() {
    logLineCountSpan.textContent = `${logLineCount} line${logLineCount !== 1 ? 's' : ''}`;
}

// Update log status
function updateLogStatus(status) {
    logStatusSpan.textContent = '●';

    switch (status) {
        case 'Connected':
        case 'Live':
            logStatusSpan.style.color = '#48bb78';
            break;
        case 'Loading...':
            logStatusSpan.style.color = '#ed8936';
            break;
        case 'Disconnected':
        case 'Error':
            logStatusSpan.style.color = '#f56565';
            break;
        default:
            logStatusSpan.style.color = '#718096';
    }
}

// Update last update timestamp
function updateLastUpdate() {
    const now = new Date();
    logLastUpdateSpan.textContent = `Last update: ${now.toLocaleTimeString()}`;
}

// Stop log stream when page unloads
window.addEventListener('beforeunload', () => {
    stopLogStream();
});

// ============= PERFORMANCE DASHBOARD FUNCTIONALITY =============

// Load performance dashboard
async function loadPerformanceDashboard() {
    try {
        // Fetch snapshot and leaderboard in parallel
        const [snapshotResponse, leaderboardResponse, alertsResponse] = await Promise.all([
            fetch(`${API_URL}/monitoring/snapshot`),
            fetch(`${API_URL}/monitoring/leaderboard`),
            fetch(`${API_URL}/monitoring/alerts`)
        ]);

        const snapshotData = await snapshotResponse.json();
        const leaderboardData = await leaderboardResponse.json();
        const alertsData = await alertsResponse.json();

        if (snapshotData.success) {
            updatePerformanceSummary(snapshotData.snapshot);
        }

        if (leaderboardData.success) {
            updateLeaderboard(leaderboardData.leaderboard);
        }

        if (alertsData.success && alertsData.alerts.length > 0) {
            displayAlerts(alertsData.alerts);
        } else {
            document.getElementById('alerts-container').style.display = 'none';
        }

        // Check for recommendations
        if (snapshotData.success && snapshotData.snapshot.recommendations && snapshotData.snapshot.recommendations.length > 0) {
            displayRecommendations(snapshotData.snapshot.recommendations);
        }

    } catch (error) {
        console.error('Error loading performance dashboard:', error);
    }
}

// Update performance summary
function updatePerformanceSummary(snapshot) {
    const portfolio = snapshot.portfolio;

    // Portfolio PnL
    const pnlElement = document.getElementById('portfolio-pnl');
    pnlElement.textContent = `$${portfolio.totalPnL.toFixed(2)}`;
    pnlElement.className = `summary-value ${portfolio.totalPnL >= 0 ? 'positive' : 'negative'}`;

    // PnL percentage
    const pnlPercentElement = document.getElementById('portfolio-pnl-percent');
    pnlPercentElement.textContent = `${portfolio.totalPnLPercent >= 0 ? '+' : ''}${portfolio.totalPnLPercent.toFixed(2)}%`;
    pnlPercentElement.className = `summary-subtext ${portfolio.totalPnL >= 0 ? 'positive' : 'negative'}`;

    // Active bots
    document.getElementById('active-bots-count').textContent =
        `${portfolio.activeBotsCount}/${portfolio.totalBotsCount}`;

    // Combined win rate
    document.getElementById('combined-win-rate').textContent =
        `${portfolio.combinedWinRate.toFixed(1)}%`;

    // Total trades
    document.getElementById('total-trades').textContent = portfolio.totalTrades;

    // Open positions
    const openPositions = snapshot.bots.reduce((sum, bot) => sum + bot.openPositions, 0);
    document.getElementById('total-positions').textContent = openPositions;

    // Sharpe ratio
    const sharpeElement = document.getElementById('portfolio-sharpe');
    sharpeElement.textContent = portfolio.portfolioSharpe.toFixed(2);
    sharpeElement.className = `summary-value ${portfolio.portfolioSharpe > 1 ? 'positive' : ''}`;
}

// Update leaderboard
function updateLeaderboard(rankings) {
    const tbody = document.getElementById('leaderboard-body');

    if (!rankings || rankings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No performance data available</td></tr>';
        return;
    }

    tbody.innerHTML = rankings.map(bot => `
        <tr>
            <td><strong>${getRankEmoji(bot.rank)} ${bot.rank}</strong></td>
            <td>${bot.botName}</td>
            <td><span style="font-size: 0.85rem; color: #718096;">${bot.strategy || '-'}</span></td>
            <td class="${bot.pnl >= 0 ? 'positive' : 'negative'}">
                <strong>$${bot.pnl.toFixed(2)}</strong><br>
                <span style="font-size: 0.85rem;">(${bot.pnlPercent >= 0 ? '+' : ''}${bot.pnlPercent.toFixed(2)}%)</span>
            </td>
            <td>${bot.winRate.toFixed(1)}%</td>
            <td>${bot.totalTrades}</td>
            <td>${bot.sharpeRatio.toFixed(2)}</td>
            <td><span class="bot-status-badge ${bot.status.toLowerCase()}">${bot.status}</span></td>
        </tr>
    `).join('');
}

// Display alerts
function displayAlerts(alerts) {
    const container = document.getElementById('alerts-container');
    const list = document.getElementById('alerts-list');

    if (!alerts || alerts.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    list.innerHTML = alerts.map(alert => {
        const alertClass = alert.severity === 'CRITICAL' ? '' :
                          alert.severity === 'WARNING' ? 'warning' : 'info';
        const icon = alert.severity === 'CRITICAL' ? '🚨' :
                    alert.severity === 'WARNING' ? '⚠️' : 'ℹ️';

        return `
            <div class="alert-item ${alertClass}">
                <span class="alert-icon">${icon}</span>
                <span class="alert-text">${alert.message}</span>
            </div>
        `;
    }).join('');
}

// Display recommendations
function displayRecommendations(recommendations) {
    const container = document.getElementById('recommendations-container');
    const list = document.getElementById('recommendations-list');

    if (!recommendations || recommendations.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    list.innerHTML = recommendations.map(rec => {
        const isWarning = rec.includes('⚠️') || rec.includes('Consider pausing');
        return `<div class="recommendation-item ${isWarning ? 'warning' : ''}">${rec}</div>`;
    }).join('');
}

// Get rank emoji
function getRankEmoji(rank) {
    switch (rank) {
        case 1: return '🥇';
        case 2: return '🥈';
        case 3: return '🥉';
        default: return '';
    }
}

// Initialize on page load
checkServerStatus();
