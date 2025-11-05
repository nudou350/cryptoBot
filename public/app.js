// API Base URL
const API_URL = '/api';

// State
let selectedBot = '';
let updateInterval = null;

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
const statusSpan = document.getElementById('status');
const botSelect = document.getElementById('bot-select');
const currentBotName = document.getElementById('current-bot-name');
const currentPrice = document.getElementById('current-price');

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

// Bot selection changed
botSelect.addEventListener('change', () => {
    selectedBot = botSelect.value;

    if (selectedBot) {
        statsSection.style.display = 'block';
        currentBotName.textContent = selectedBot;
        updateStats();
    } else {
        statsSection.style.display = 'none';
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
    updateStats();
    updateCurrentPrice();

    // Then update every 5 seconds
    updateInterval = setInterval(() => {
        updateStats();
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
            }
        }
    } catch (error) {
        console.error('Error checking server status:', error);
    }
}

// Initialize on page load
checkServerStatus();
