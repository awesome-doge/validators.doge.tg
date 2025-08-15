    // Helper functions
    const fromNano = (nano) => {
        return BigInt(nano) / BigInt(1e9);
    }

    const toMillions = (n) => {
        return (Number(n) / 1e6).toFixed(3) + 'M';
    }

    const toMillionsShort = (n) => {
        let s = (Number(n) / 1e6).toFixed(3);
        for (let i = 0; i < 3; i++) {
            if (s.endsWith('0')) s = s.substring(0, s.length - 1);
        }
        if (s.endsWith('.')) s = s.substring(0, s.length - 1);
        return s + 'M';
    }

    // Add thousands separators for readability
    const withCommas = (n) => {
        try {
            const num = typeof n === 'bigint' ? Number(n) : Number(n);
            if (Number.isNaN(num)) return n;
            return num.toLocaleString('en-US');
        } catch {
            return n;
        }
    }

    const makeAddressUrl = (address) => {
        return `<a href="https://tonscan.org/address/${address}" target="_blank">${address}</a>`;
    }

    const showLoading = () => {}

    const hideLoading = () => {}

    // Global variables
    let nominatorsData = [];
    let filteredData = [];

    // API status update
    function updateApiStatus(apiName, responseTime = null, progressText = null, keepVisible = false) {
        const apiStatus = document.getElementById('apiStatus');
        const apiNameElement = document.getElementById('apiName');
        const apiPerformance = document.getElementById('apiPerformance');

        // Display API name
        const displayNames = {
            'getaruai': 'GetAruAI'
        };
        
        apiNameElement.textContent = displayNames[apiName] || apiName;
        
        // Display performance information or progress text
        let performanceText = '';
        if (progressText) {
            performanceText = progressText;
        } else if (responseTime !== null) {
            performanceText = `${responseTime.toFixed(0)}ms`;
        }
        
        apiPerformance.textContent = performanceText;
        
        // Display status indicator
        apiStatus.classList.add('show');
        
        // Clear previous timer
        if (window.apiStatusTimeout) {
            clearTimeout(window.apiStatusTimeout);
        }
        
        // Hide after 3 seconds if not keeping visible
        if (!keepVisible && !progressText) {
            window.apiStatusTimeout = setTimeout(() => {
                apiStatus.classList.remove('show');
            }, 3000);
        }
    }

    // Hide API status
    function hideApiStatus() {
        const apiStatus = document.getElementById('apiStatus');
        if (window.apiStatusTimeout) {
            clearTimeout(window.apiStatusTimeout);
        }
        apiStatus.classList.remove('show');
    }

    // Update progress using API status panel
    const updateProgress = (percentage, text = null) => {
        if (text) {
            const progressText = `${Math.round(percentage)}% - ${text}`;
            updateApiStatus('Loading', null, progressText, true);
            console.log(`Loading progress: ${Math.round(percentage)}% - ${text}`);
        }
    }

    // API requests
    async function fetchNominators() {
        const startTime = performance.now();
        try {
            const response = await fetch('https://getaruai.com/api/v1/nominators');
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            if (!response.ok) {
                throw new Error(`API 錯誤: ${response.status}`);
            }
            
            // Update API status
            updateApiStatus('getaruai', responseTime);
            
            const data = await response.json();
            return data.nominators || [];
        } catch (error) {
            console.error('Failed to load nominators data:', error);
            throw error;
        }
    }

    async function fetchNominatorDetail(address) {
        try {
            const response = await fetch(`https://getaruai.com/api/v1/nominators/${address}`);
            if (!response.ok) {
                throw new Error(`API 錯誤: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Failed to load nominator details:', error);
            throw error;
        }
    }

    // Render statistics
    function renderStats() {
        const totalNominators = nominatorsData.length;
        const totalStake = nominatorsData.reduce((sum, nominator) => sum + BigInt(nominator.total_stake), BigInt(0));
        const activeNominators = nominatorsData.filter(n => n.total_stake > 0).length;
        const averageStake = totalNominators > 0 ? totalStake / BigInt(totalNominators) : BigInt(0);

        const largestStake = nominatorsData.reduce((max, nominator) => 
            BigInt(nominator.total_stake) > max ? BigInt(nominator.total_stake) : max, BigInt(0));

        document.getElementById('statsContainer').innerHTML = `
            <div class="stat-card">
                <h3>Total Providers</h3>
                <p class="value">${withCommas(totalNominators)}</p>
            </div>
            <div class="stat-card">
                <h3>Active Providers</h3>
                <p class="value">${withCommas(activeNominators)}</p>
            </div>
            <div class="stat-card">
                <h3>Total Staked Amount</h3>
                <p class="value">${toMillionsShort(fromNano(totalStake))} TON</p>
            </div>
            <div class="stat-card">
                <h3>Average Stake</h3>
                <p class="value">${toMillionsShort(fromNano(averageStake))} TON</p>
            </div>
            <div class="stat-card">
                <h3>Largest Single Stake</h3>
                <p class="value">${toMillionsShort(fromNano(largestStake))} TON</p>
            </div>
        `;
    }

    // Prepare data for rendering  
    function prepareData() {
        // 預設按總質押量降序排序
        filteredData = [...nominatorsData].sort((a, b) => 
            BigInt(b.total_stake) > BigInt(a.total_stake) ? 1 : -1
        );
        renderTable();
    }

    // Render table
    function renderTable() {
        const container = document.getElementById('tableContainer');
        
        // Desktop table
        let desktopHtml = `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Address</th>
                        <th>Stake (TON)</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Mobile cards
        let mobileHtml = '<div class="mobile-table">';

        filteredData.forEach(nominator => {
            const stakeAmount = fromNano(nominator.total_stake);
            const stakeDisplay = Number(stakeAmount) === 0 ? '0' : toMillions(stakeAmount);
            
            // Desktop table row
            desktopHtml += `
                <tr>
                    <td>${withCommas(nominator.nominator_id)}</td>
                    <td class="address-cell">${makeAddressUrl(nominator.nominator_address)}</td>
                    <td>${stakeDisplay} TON</td>
                    <td>
                        <a href="#" class="detail-link" onclick="showNominatorDetail('${nominator.nominator_address}'); return false;">
                            View Details
                        </a>
                    </td>
                </tr>
            `;

            // Mobile card
            mobileHtml += `
                <div class="mobile-card">
                    <div class="mobile-card-header">
                        <div class="mobile-card-title">
                            Nominator #${nominator.nominator_id}
                        </div>
                        <div class="mobile-card-index">#${withCommas(nominator.nominator_id)}</div>
                    </div>
                    <div class="mobile-card-content">
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Stake:</span>
                            <span class="mobile-card-value">${stakeDisplay} TON</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Address:</span>
                            <span class="mobile-card-value mono">${makeAddressUrl(nominator.nominator_address)}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Actions:</span>
                            <span class="mobile-card-value">
                                <button class="detail-btn" onclick="showNominatorDetail('${nominator.nominator_address}')">
                                    View Details
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
            `;
        });

        desktopHtml += `
                </tbody>
            </table>
        `;

        mobileHtml += '</div>';

        container.innerHTML = desktopHtml + mobileHtml;
    }

    // Show nominator details
    async function showNominatorDetail(address) {
        showLoading();
        try {
            const detail = await fetchNominatorDetail(address);
            renderNominatorDetail(detail);
        } catch (error) {
            alert(`Failed to load details: ${error.message}`);
        } finally {
            hideLoading();
        }
    }

    // Render nominator details
    function renderNominatorDetail(detail) {
        const modal = document.getElementById('detailModal');
        const content = document.getElementById('modalContent');

        // Calculate total stake and validator count
        const totalStake = detail.rewards ? detail.rewards.reduce((sum, reward) => sum + BigInt(reward.nom_stake), BigInt(0)) : BigInt(0);
        const validatorCount = detail.rewards ? detail.rewards.length : 0;

        let html = `
            <h2>Provider Details</h2>
            <div class="stake-item">
                <h3>Basic Information</h3>
                <p><strong>Address:</strong> ${makeAddressUrl(detail.nominator_address)}</p>
                <p><strong>Total Stake:</strong> ${toMillions(fromNano(totalStake))} TON</p>
                <p><strong>Allocated to Validators:</strong> ${withCommas(validatorCount)}</p>
            </div>
        `;

        if (detail.rewards && detail.rewards.length > 0) {
            html += `
                <div class="stake-breakdown">
                    <h3>Stake Allocation Details</h3>
            `;

            detail.rewards.forEach((reward, index) => {
                const stakeAmount = fromNano(reward.nom_stake);
                const cycleBonus = reward.cycle_bonuses;
                
                html += `
                    <div class="stake-item">
                        <h4>Validator #${index + 1}</h4>
                        <p><strong>Validator Address:</strong> ${makeAddressUrl(reward.val_account_address)}</p>
                        <p><strong>Stake Amount:</strong> ${toMillions(stakeAmount)} TON</p>
                        <p><strong>Cycle ID:</strong> ${withCommas(reward.cycle_id)}</p>
                        ${cycleBonus ? `
                            <p><strong>Unfreeze Time:</strong> ${new Date(cycleBonus.unfreezes_at * 1000).toLocaleString()}</p>
                            <p><strong>Total Pool Stake:</strong> ${toMillions(fromNano(cycleBonus.total_stake))} TON</p>
                            <p><strong>Pool Rewards:</strong> ${toMillions(fromNano(cycleBonus.bonuses))} TON</p>
                             <p><strong>Complaint Count:</strong> ${withCommas(cycleBonus.number_of_complaints)}</p>
                        ` : ''}
                        ${reward.pending_deposit_amount > 0 ? `<p><strong>Pending Deposit:</strong> ${toMillions(fromNano(reward.pending_deposit_amount))} TON</p>` : ''}
                        ${reward.withdraw_requested > 0 ? `<p><strong>Withdrawal Request:</strong> ${toMillions(fromNano(reward.withdraw_requested))} TON</p>` : ''}
                    </div>
                `;
            });

            html += `</div>`;
        } else {
            html += `<p>No stake allocation information available.</p>`;
        }

        content.innerHTML = html;
        modal.style.display = 'flex';
    }

    // Close details modal
    function closeDetailModal() {
        document.getElementById('detailModal').style.display = 'none';
    }

    // Event listeners

    // Close modal when clicking outside
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeDetailModal();
        }
    });

    // Initialize
    async function init() {
        showLoading();
        try {
            updateProgress(0, 'Starting to load nominators data...');
            
            updateProgress(30, 'Fetching nominators from API...');
            nominatorsData = await fetchNominators();
            
            updateProgress(70, 'Processing statistics...');
            renderStats();
            
            updateProgress(90, 'Preparing data for display...');
            prepareData();
            
            updateProgress(100, `Loaded ${nominatorsData.length} nominators successfully!`);
            
            // Hide progress after 3 seconds
            setTimeout(() => {
                hideApiStatus();
            }, 3000);
            
        } catch (error) {
            updateApiStatus('Loading Failed', null, error.message || 'Unable to load nominators', false);
            alert(`Failed to load data: ${error.message}`);
            
            // Hide error after 5 seconds
            setTimeout(() => {
                hideApiStatus();
            }, 5000);
        } finally {
            hideLoading();
        }
    }

    // Start application
    init();
