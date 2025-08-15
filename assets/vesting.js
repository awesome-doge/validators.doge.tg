    // Utility functions
    const fromNano = (nano) => {
            return BigInt(nano) / BigInt(1000000000);
    }

    const toMillions = (n) => {
        const num = Number(n);
        if (num < 1000) {
            // Display number directly when less than 1000, without 'M'
            return num.toFixed(3).replace(/\.?0+$/, '');
        }
        return (num / 1e6).toFixed(3) + 'M';
    }

    const toMillionsShort = (n) => {
        const num = Number(n);
        if (num < 1000) {
            // Display number directly when less than 1000, without 'M'
            return num.toFixed(3).replace(/\.?0+$/, '');
        }
        let s = (num / 1e6).toFixed(3);
        for (let i = 0; i < 3; i++) {
            if (s.endsWith('0')) s = s.substring(0, s.length - 1);
        }
        if (s.endsWith('.')) s = s.substring(0, s.length - 1);
        return s + 'M';
    }

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

    const showLoading = () => {
        // Loading indicator removed, no need to display
    }

    const hideLoading = () => {
        // Loading indicator removed, no need to hide
    }

    const updateProgress = (percentage, text = null) => {
        // Use API status panel to display progress
        if (text) {
            const progressText = `${Math.round(percentage)}% - ${text}`;
            updateApiStatus('TON Center API v2', null, progressText, true);
            console.log(`Loading progress: ${Math.round(percentage)}% - ${text}`);
        }
    }

    const timestampToDate = (timestamp) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    // Global variables
    let vestingData = [];
    let filteredData = [];
    let sortColumn = 'unvested'; // Default sort by unvested amount
    let sortDirection = 'desc'; // Default descending
    let labels = {}; // address -> label
    let blacklist = new Set(); // Blacklist address collection
    
    // TON Center API configuration
    const TONCENTER_API_KEY = '4ee76f835930b91d73f0906da03a3f6fdad65e7074ca2cb10271d73105d7530c';
    const TONCENTER_V2_URL = 'https://toncenter.com/api/v2/jsonRPC';
    
    // API Rate limits based on load type
    const API_RATE_LIMITS = {
        FIRST_LOAD: 1,      // First load: 1 request per second
        FULL_RELOAD: 10,    // Full reload: 10 requests per second
        BACKGROUND: 5       // Background update: 5 requests per second
    };
    
    let currentRateLimit = API_RATE_LIMITS.FIRST_LOAD;
    let requestDelay = 1000 / currentRateLimit;
    
    // Cache for vesting details
    let vestingCache = {};
    let noDataCache = new Set(); // Track addresses with no vesting data
    let lastRequestTime = 0;
    let isPageRefresh = false; // Track if this is a page refresh
    
    // Load cache from localStorage on page load
    function loadCacheFromStorage() {
        try {
            const cachedVesting = localStorage.getItem('vestingCache');
            if (cachedVesting) {
                vestingCache = JSON.parse(cachedVesting);
                console.log(`📦 Loaded ${Object.keys(vestingCache).length} vesting contracts from localStorage cache`);
            }
            
            const cachedNoData = localStorage.getItem('noDataCache');
            if (cachedNoData) {
                const noDataArray = JSON.parse(cachedNoData);
                noDataCache = new Set(noDataArray);
                console.log(`📦 Loaded ${noDataCache.size} no-data addresses from localStorage cache`);
            }
        } catch (error) {
            console.warn('Error loading cache from localStorage:', error);
            // Reset cache on error
            vestingCache = {};
            noDataCache = new Set();
        }
    }
    
    // Save cache to localStorage
    function saveCacheToStorage() {
        try {
            localStorage.setItem('vestingCache', JSON.stringify(vestingCache));
            localStorage.setItem('noDataCache', JSON.stringify(Array.from(noDataCache)));
        } catch (error) {
            console.warn('Error saving cache to localStorage:', error);
        }
    }

    // API status updates
    function updateApiStatus(apiName, responseTime = null, progressText = null, keepVisible = false) {
        const apiStatus = document.getElementById('apiStatus');
        const apiNameElement = document.getElementById('apiName');
        const apiPerformance = document.getElementById('apiPerformance');

        apiNameElement.textContent = apiName;
        
        let performanceText = '';
        if (progressText) {
            performanceText = progressText;
        } else if (responseTime !== null) {
            performanceText = `${responseTime.toFixed(0)}ms`;
        }
        
        apiPerformance.textContent = performanceText;
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

    // Set API request rate
    function setApiRateLimit(limitType) {
        currentRateLimit = API_RATE_LIMITS[limitType] || API_RATE_LIMITS.FIRST_LOAD;
        requestDelay = 1000 / currentRateLimit;
        console.log(`🔧 API rate limit set to: ${currentRateLimit} requests/second (${requestDelay}ms delay)`);
    }

    // Rate limiting utility
    async function waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < requestDelay) {
            await new Promise(resolve => setTimeout(resolve, requestDelay - timeSinceLastRequest));
        }
        lastRequestTime = Date.now();
    }

        // Create TonWeb instance for v2 jsonRPC calls with optimized settings
    const tonweb = new TonWeb(new TonWeb.HttpProvider(TONCENTER_V2_URL, {
        apiKey: TONCENTER_API_KEY,
        timeout: 15000, // 15 seconds timeout (shorter for faster retries)
        requestsPerSecond: currentRateLimit, // Use dynamic rate limit
        // Enhanced error handling
        retryOnServerError: true,
        retryCount: 1,
        retryInterval: 500
    }));

    // Fetch vesting contract details using TON Center API v2 jsonRPC
    async function fetchVestingDetails(contractAddress, forceRefresh = false, retryCount = 0) {
        const maxRetries = 2;
        
        // Check cache first - return cached data if exists and not forcing refresh
        if (!forceRefresh && vestingCache[contractAddress]) {
            console.log(`📦 Using cached vesting data for ${contractAddress}`);
            return vestingCache[contractAddress];
        }

        // If forcing refresh, remove from noDataCache to allow retry
        if (forceRefresh) {
            noDataCache.delete(contractAddress);
        }

        // Apply rate limiting
        await waitForRateLimit();

        try {
            // Only log on first attempt or retry
            if (retryCount === 0) {
                console.log(`🔍 Fetching vesting data for ${contractAddress}...`);
            } else {
                console.log(`🔄 Retry ${retryCount} for ${contractAddress}`);
            }
            
            // First, get address info to verify it's a vesting contract
            const addressInfo = await tonweb.provider.getAddressInfo(contractAddress);
            if (!addressInfo || addressInfo.state === 'uninitialized') {
                if (retryCount === 0) {
                    console.warn(`⚠️ Contract ${contractAddress} is uninitialized`);
                }
                noDataCache.add(contractAddress);
                saveCacheToStorage();
                return null;
            }

            // Check if this is a vesting wallet by trying to call vesting methods
            try {
                // Create VestingWallet instance to get vesting data
                const VestingWalletClass = TonWeb.LockupWallets.VestingWalletV1;
                const vestingWallet = new VestingWalletClass(tonweb.provider, {
                    address: new TonWeb.utils.Address(contractAddress)
                });

                // Try to get vesting data with enhanced error handling
                let vestingData;
                try {
                    vestingData = await vestingWallet.getVestingData();
                if (!vestingData) {
                        if (retryCount === 0) {
                    console.warn(`No vesting data found for ${contractAddress}`);
                        }
                    noDataCache.add(contractAddress);
                    saveCacheToStorage();
                    return null;
                    }
                } catch (dataError) {
                    // Special handling for parse errors
                    if (dataError.message && dataError.message.includes('parse response error')) {
                        throw dataError; // Re-throw for outer retry logic to handle
                    } else {
                        // Other errors indicate not a vesting contract
                        if (retryCount === 0) {
                            console.warn(`Failed to get vesting data for ${contractAddress}:`, dataError.message);
                        }
                        noDataCache.add(contractAddress);
                        saveCacheToStorage();
                        return null;
                    }
                }

                // Get whitelist with enhanced error handling
                let whitelist = [];
                try {
                    whitelist = await vestingWallet.getWhitelist();
                } catch (whitelistError) {
                    // Whitelist fetch failure is common, not a fatal error
                    if (whitelistError.message && whitelistError.message.includes('parse response error')) {
                        throw whitelistError; // Parse errors need retry
                    } else {
                        // Use empty whitelist for other errors
                        if (retryCount === 0) {
                            console.log(`📝 Whitelist not available for ${contractAddress}, using empty array`);
                        }
                        whitelist = [];
                    }
                }

                // Process the data into the expected format
                const processedData = {
                    address: contractAddress,
                    start_time: vestingData.vestingStartTime,
                    total_duration: vestingData.vestingTotalDuration,
                    unlock_period: vestingData.unlockPeriod,
                    cliff_duration: vestingData.cliffDuration,
                    sender_address: vestingData.vestingSenderAddress.toString(true, true, false),
                    owner_address: vestingData.ownerAddress.toString(true, true, false),
                    total_amount: vestingData.vestingTotalAmount.toString(),
                    whitelist: whitelist.map(addr => addr.toString(true, true, false)),
                    address_book: {} // Will be populated if needed
                };

                // Cache the successful result and remove from noDataCache
                vestingCache[contractAddress] = processedData;
                noDataCache.delete(contractAddress);
                
                // Save to localStorage
                saveCacheToStorage();
                
                if (retryCount === 0) {
                    console.log(`✅ Successfully fetched vesting data for ${contractAddress}`);
                } else {
                    console.log(`✅ Retry successful for ${contractAddress} on attempt ${retryCount}`);
                }
                return processedData;

            } catch (vestingError) {
                // 更詳細的錯誤分類和重試邏輯
                if (vestingError.message && vestingError.message.includes('parse response error')) {
                    console.warn(`⚠️ API response parse error for ${contractAddress}:`, vestingError.message);
                    
                    // 如果還有重試機會，等待一下再重試
                    if (retryCount < maxRetries) {
                        const currentRetry = retryCount + 1;
                        console.log(`🔄 Retrying ${contractAddress} in 1 second... (${currentRetry}/${maxRetries})`);
                        
                        // 更新狀態顯示重試信息
                        updateApiStatus('Retrying', null, `API parse error, retrying ${contractAddress.slice(0, 10)}... (${currentRetry}/${maxRetries})`, true);
                        
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return await fetchVestingDetails(contractAddress, forceRefresh, retryCount + 1);
                    } else {
                        console.warn(`❌ Max retries reached for ${contractAddress}, marking as temporarily unavailable`);
                        // 對於解析錯誤，不加入 noDataCache，因為可能是暫時的 API 問題
                        // 這些地址會在下次載入時重新嘗試
                        return null;
                    }
                } else {
                    console.warn(`⚠️ Contract ${contractAddress} is not a vesting wallet:`, vestingError.message);
                noDataCache.add(contractAddress);
                saveCacheToStorage();
                return null;
                }
            }
                
        } catch (error) {
            console.error(`❌ Failed to fetch vesting details for ${contractAddress}:`, error);
            
            // 如果是網路錯誤且還有重試機會
            if (retryCount < maxRetries && (
                error.message.includes('timeout') || 
                error.message.includes('network') || 
                error.message.includes('fetch')
            )) {
                const currentRetry = retryCount + 1;
                console.log(`🔄 Network error, retrying ${contractAddress} in 2 seconds... (${currentRetry}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return await fetchVestingDetails(contractAddress, forceRefresh, retryCount + 1);
            }
            
            // Other errors or max retries reached, mark as no data but will retry on refresh
            return null;
        }
    }

    // Fallback method: Direct fetch API call to TON Center (not implemented yet)
    async function fetchVestingDetailsFallback(contractAddress) {
        console.log(`🔧 Fallback method not implemented yet for ${contractAddress}`);
        throw new Error('Fallback method not implemented');
    }

    // Calculate vesting status
    function calculateVestingStatus(vestingDetails, currentBalance) {
        if (!vestingDetails) return null;

        // Validate required fields - allow cliff_duration to be 0, but other key fields cannot be 0
        if (!vestingDetails.total_amount || 
            vestingDetails.start_time === undefined || vestingDetails.start_time === null ||
            !vestingDetails.total_duration || 
            !vestingDetails.unlock_period || 
            vestingDetails.cliff_duration === undefined || vestingDetails.cliff_duration === null) {
            console.warn('Incomplete vesting details:', vestingDetails);
            return null;
        }

        // Check for invalid cached data (all key values being 0 indicates corrupted cache)
        if (vestingDetails.start_time === 0 && 
            vestingDetails.total_duration === 0 && 
            vestingDetails.unlock_period === 0 && 
            (!vestingDetails.total_amount || vestingDetails.total_amount === "0")) {
            console.warn('🗑️ Invalid cached vesting data (all zeros):', vestingDetails.address);
            return null;
        }

        // Ensure all values are valid numbers
        const startTime = Number(vestingDetails.start_time);
        const totalDuration = Number(vestingDetails.total_duration);
        const unlockPeriod = Number(vestingDetails.unlock_period);
        const cliffDuration = Number(vestingDetails.cliff_duration);
        
        // Validate numeric values
        if (isNaN(startTime) || isNaN(totalDuration) || isNaN(unlockPeriod) || isNaN(cliffDuration)) {
            console.warn('Invalid numeric values in vesting details:', {
                startTime, totalDuration, unlockPeriod, cliffDuration
            });
            return null;
        }

        // Validate total_amount is a valid string or number
        let totalAmount;
        try {
            totalAmount = BigInt(vestingDetails.total_amount);
        } catch (error) {
            console.warn('Invalid total_amount:', vestingDetails.total_amount, error);
            return null;
        }

        const now = Math.floor(Date.now() / 1000);
        
        // Calculate vested amount
        let vestedAmount = BigInt(0);
        if (now >= startTime) {
            const elapsedTime = Math.min(now - startTime, totalDuration);
            
            if (elapsedTime >= cliffDuration && unlockPeriod > 0) {
                const vestingPeriods = Math.floor(elapsedTime / unlockPeriod);
                const totalPeriods = Math.floor(totalDuration / unlockPeriod);
                if (totalPeriods > 0) {
                    vestedAmount = totalAmount * BigInt(vestingPeriods) / BigInt(totalPeriods);
                }
            }
        }

        const unvestedAmount = totalAmount - vestedAmount;
        const liquidAmount = currentBalance - unvestedAmount > 0 ? currentBalance - unvestedAmount : BigInt(0);

        return {
            totalAmount,
            vestedAmount,
            unvestedAmount,
            liquidAmount,
            startTime,
            totalDuration,
            unlockPeriod,
            cliffDuration
        };
    }

    // Load labels from labels.csv
    async function fetchLabelsCsv() {
        try {
            updateApiStatus('Loading', null, 'Loading labels...', true);
            const response = await fetch('labels.csv');
            if (!response.ok) throw new Error('Failed to load labels.csv');
            const text = await response.text();
            const lines = text.split('\n');
            const columns = lines.map(line => line.split(','));
            columns.forEach(c => {
                if (c.length !== 2) return;
                const addr = c[0];
                const label = c[1].trim();
                if (label && label !== '#N/A') {
                    labels[addr] = label;
                }
            });
            updateApiStatus('Loading', null, `Loaded ${Object.keys(labels).length} labels`, false);
            if (filteredData && filteredData.length) {
                renderTable();
            }
                } catch (e) {
            console.warn('Failed to load labels.csv', e);
            updateApiStatus('Loading Failed', null, 'Failed to load labels', false);
                }
    }

    // Load blacklist from blacklist.csv
    async function fetchBlacklistCsv() {
        try {
            console.log('📋 Loading blacklist...');
            const response = await fetch('blacklist.csv');
            if (!response.ok) {
                console.log('📋 No blacklist.csv found, continuing without blacklist');
                return;
            }
            
            const text = await response.text();
            const lines = text.split('\n');
            let blacklistCount = 0;
            
            lines.forEach(line => {
                line = line.trim();
                // Skip empty lines, comment lines and header lines
                if (!line || line.startsWith('#') || line.toLowerCase().startsWith('address')) {
                    return;
                }
                
                const columns = line.split(',');
                if (columns.length >= 1) {
                    const addr = columns[0].trim();
                    if (addr) {
                        blacklist.add(addr);
                        blacklistCount++;
                    }
                }
            });
            
            console.log(`🚫 Loaded ${blacklistCount} blacklisted addresses`);
            
        } catch (e) {
            console.warn('Failed to load blacklist.csv:', e);
                }
    }

    // Fetch all Vesting contract addresses
    async function fetchAllVestingAddresses() {
        const CODE_HASH = 'tItTGr7DtxRjgpH3137W3J9qJynvyiBHcTc3TUrotZA=';
        const BATCH_SIZE = 50;
        let allAddresses = [];
        let offset = 0;
        let hasMore = true;
        const maxEstimated = 500; // Estimated maximum count for progress calculation

        updateProgress(10, 'Fetching Vesting contract list...');

        while (hasMore && allAddresses.length < 500) {
            try {
                const url = `https://api.tonscan.com/api/bt/getAddressesForContract?code_hash=${encodeURIComponent(CODE_HASH)}&limit=${BATCH_SIZE}&offset=${offset}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Check API response structure
                if (!data.json || !data.json.data) {
                    console.warn('Unusual API response format:', data);
                    hasMore = false;
                    break;
                }
                
                const addresses = data.json.data;
                
                if (!Array.isArray(addresses) || addresses.length === 0) {
                    console.log(`No more data at offset ${offset}, ending fetch`);
                    hasMore = false;
                } else {
                    allAddresses = allAddresses.concat(addresses);
                    offset += BATCH_SIZE;
                    
                    // Update progress (10% - 70%)
                    const fetchProgress = Math.min(70, 10 + (allAddresses.length / maxEstimated) * 60);
                    updateProgress(fetchProgress, `Fetched ${allAddresses.length} Vesting contract addresses...`);
                    
                    console.log(`Fetched ${allAddresses.length} Vesting contract addresses...`);
                }
                
                // Avoid too frequent requests
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`Failed to fetch address list (offset: ${offset}):`, error);
                hasMore = false;
                break;
            }
        }

        updateProgress(80, 'Processing and sorting data...');
        console.log(`Total fetched ${allAddresses.length} Vesting contract addresses`);

        // Filter invalid data and blacklisted addresses, then sort by balance
        const validAddresses = allAddresses.filter(addr => {
            if (!addr || !addr.address || typeof addr.balance === 'undefined') {
                return false;
            }
            
            // Check if in blacklist
            if (blacklist.has(addr.address)) {
                console.log(`🚫 Filtered out blacklisted address: ${addr.address}`);
                return false;
            }
            
            return true;
        });
        
        updateProgress(90, 'Sorting contracts...');
        
        validAddresses.sort((a, b) => {
            try {
                return BigInt(b.balance) - BigInt(a.balance) > 0 ? 1 : -1;
            } catch (e) {
                console.warn('Invalid balance encountered during sorting:', a.balance, b.balance);
                return 0;
            }
        });
        
        const filteredCount = allAddresses.length - validAddresses.length;
        if (filteredCount > 0) {
            console.log(`🚫 Filtered out ${filteredCount} addresses (invalid data + blacklisted)`);
        }
        
        updateProgress(100, 'Loading complete!');
        
        return validAddresses; // Return filtered addresses
    }

    // Render statistics
    function renderStats() {
        if (!vestingData || vestingData.length === 0) {
            document.getElementById('statsContainer').innerHTML = `
                <div class="stat-card">
                    <h3>Loading...</h3>
                    <p class="value">-</p>
                </div>
            `;
            return;
        }

        const totalContracts = vestingData.length;
        const totalBalance = vestingData.reduce((sum, contract) => {
            try {
                return sum + BigInt(contract.balance || 0);
            } catch (e) {
                console.warn('Invalid balance data:', contract.balance);
                return sum;
            }
        }, BigInt(0));
        
        const totalUnvestedAmount = vestingData.reduce((sum, contract) => {
            try {
                return sum + (contract.unvestedAmount || BigInt(0));
            } catch (e) {
                return sum;
            }
        }, BigInt(0));
        
        const totalVestingAmount = vestingData.reduce((sum, contract) => {
            try {
                return sum + (contract.totalVestingAmount || BigInt(0));
            } catch (e) {
                return sum;
            }
        }, BigInt(0));
        
        const totalLiquidAmount = vestingData.reduce((sum, contract) => {
            try {
                return sum + (contract.liquidAmount || BigInt(0));
            } catch (e) {
                return sum;
            }
        }, BigInt(0));

        const activeContracts = vestingData.filter(c => c.balance && Number(c.balance) > 0).length;
        const contractsWithVestingData = vestingData.filter(c => c.vestingDetails).length;

        document.getElementById('statsContainer').innerHTML = `
            <div class="stat-card">
                <h3>Total Contracts</h3>
                <p class="value">${withCommas(totalContracts)}</p>
            </div>
            <div class="stat-card">
                <h3>Active Contracts</h3>
                <p class="value">${withCommas(activeContracts)}</p>
            </div>
            <div class="stat-card">
                <h3>Total Balance</h3>
                <p class="value">${toMillionsShort(fromNano(totalBalance))} TON</p>
            </div>
            <div class="stat-card" style="background: rgba(255, 59, 48, 0.1); border: 2px solid rgba(255, 59, 48, 0.3);">
                <h3>Total Unvested Amount</h3>
                <p class="value" style="color: #FF3B30; font-weight: bold;">${toMillionsShort(fromNano(totalUnvestedAmount))} TON</p>
            </div>
            <div class="stat-card">
                <h3>Total Liquid Amount</h3>
                <p class="value" style="color: #34C759;">${toMillionsShort(fromNano(totalLiquidAmount))} TON</p>
            </div>
            <div class="stat-card">
                <h3>Total Vesting Amount</h3>
                <p class="value">${toMillionsShort(fromNano(totalVestingAmount))} TON</p>
            </div>
            <div class="stat-card">
                <h3>Contracts with Data</h3>
                <p class="value">${withCommas(contractsWithVestingData)} / ${withCommas(totalContracts)}</p>
                    <div style="margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; width: 100%;">
                        <button onclick="clearAllCacheAndReload()" class="action-button clear-button">
                            <span class="button-icon">🗑️</span>
                            <span class="button-text">Clear Cache (1/sec)</span>
                        </button>
                        <button onclick="loadWithRate('BACKGROUND')" class="action-button medium-button">
                            <span class="button-icon">🔄</span>
                            <span class="button-text">5/sec</span>
                        </button>
                        <button onclick="loadWithRate('FULL_RELOAD')" class="action-button fast-button">
                            <span class="button-icon">⚡</span>
                            <span class="button-text">10/sec</span>
                        </button>
                    </div>
            </div>
        `;
    }

    // Sort function
    function sortData(column) {
        if (sortColumn === column) {
            // If clicking the same column, toggle sort direction
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // If clicking different column, set new column and use default sort direction
            sortColumn = column;
            sortDirection = ['balance', 'unvested', 'totalVesting', 'liquid'].includes(column) ? 'desc' : 'asc';
        }
        
        filterData();
    }

    // Sort data
    function filterData() {
        let filtered = [...vestingData]; // Copy all data

        // Sort logic
        filtered.sort((a, b) => {
            let valueA, valueB;
            
            switch (sortColumn) {
                case 'rank':
                    valueA = vestingData.indexOf(a) + 1;
                    valueB = vestingData.indexOf(b) + 1;
                    break;
                case 'address':
                    valueA = a.address.toLowerCase();
                    valueB = b.address.toLowerCase();
                    break;
                case 'balance':
                    valueA = BigInt(a.balance || 0);
                    valueB = BigInt(b.balance || 0);
                    break;
                case 'unvested':
                    valueA = a.unvestedAmount || BigInt(0);
                    valueB = b.unvestedAmount || BigInt(0);
                    break;
                case 'totalVesting':
                    valueA = a.totalVestingAmount || BigInt(0);
                    valueB = b.totalVestingAmount || BigInt(0);
                    break;
                case 'liquid':
                    valueA = a.liquidAmount || BigInt(0);
                    valueB = b.liquidAmount || BigInt(0);
                    break;
                case 'sender':
                    valueA = (a.senderAddress || '').toLowerCase();
                    valueB = (b.senderAddress || '').toLowerCase();
                    break;
                case 'owner':
                    valueA = (a.ownerAddress || '').toLowerCase();
                    valueB = (b.ownerAddress || '').toLowerCase();
                    break;
                case 'senderOwnerMatch':
                    // Sort by whether sender and owner match
                    const matchA = a.senderAddress && a.ownerAddress && 
                        a.senderAddress.toLowerCase() === a.ownerAddress.toLowerCase() ? 1 : 0;
                    const matchB = b.senderAddress && b.ownerAddress && 
                        b.senderAddress.toLowerCase() === b.ownerAddress.toLowerCase() ? 1 : 0;
                    valueA = matchA;
                    valueB = matchB;
                    break;
                case 'vestingStart':
                    valueA = a.vestingStartTime || 0;
                    valueB = b.vestingStartTime || 0;
                    break;
                case 'duration':
                    valueA = a.vestingDuration || 0;
                    valueB = b.vestingDuration || 0;
                    break;
                case 'created':
                    valueA = a.created_utime || 0;
                    valueB = b.created_utime || 0;
                    break;
                case 'lastTx':
                    valueA = a.latest_transaction_time || 0;
                    valueB = b.latest_transaction_time || 0;
                    break;
                default:
                    return 0;
            }
            
            if (['balance', 'unvested', 'totalVesting', 'liquid'].includes(sortColumn)) {
                // BigInt comparison
                const result = valueA - valueB;
                return sortDirection === 'asc' ? 
                    (result > 0 ? 1 : result < 0 ? -1 : 0) : 
                    (result > 0 ? -1 : result < 0 ? 1 : 0);
            } else {
                // General comparison
                if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
                if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            }
        });

        filteredData = filtered;
        renderTable();
    }

    // Get sort icon
    function getSortIcon(column) {
        if (sortColumn !== column) {
            return '<span class="sort-icon">↕️</span>';
        }
        return sortDirection === 'asc' ? 
            '<span class="sort-icon active">↑</span>' : 
            '<span class="sort-icon active">↓</span>';
    }

    // Render table
    function renderTable() {
        const container = document.getElementById('tableContainer');
        
        // Desktop table
        let desktopHtml = `
            <table>
                <thead>
                    <tr>
                        <th onclick="sortData('rank')">
                            Rank ${getSortIcon('rank')}
                        </th>
                        <th onclick="sortData('address')">
                            Contract Address ${getSortIcon('address')}
                        </th>
                        <th>
                            Label
                        </th>
                        <th onclick="sortData('created')">
                            Created ${getSortIcon('created')}
                        </th>
                        <th onclick="sortData('vestingStart')">
                            Vesting Start ${getSortIcon('vestingStart')}
                        </th>
                        <th onclick="sortData('balance')">
                            Current Balance ${getSortIcon('balance')}
                        </th>
                        <th onclick="sortData('unvested')" style="background: rgba(255, 59, 48, 0.1);">
                            <strong>Unvested Amount</strong> ${getSortIcon('unvested')}
                        </th>
                        <th onclick="sortData('liquid')">
                            Liquid Amount ${getSortIcon('liquid')}
                        </th>
                        <th onclick="sortData('totalVesting')">
                            Total Vesting ${getSortIcon('totalVesting')}
                        </th>
                        <th onclick="sortData('sender')">
                            Sender Address ${getSortIcon('sender')}
                        </th>
                        <th onclick="sortData('owner')">
                            Owner Address ${getSortIcon('owner')}
                        </th>
                        <th onclick="sortData('senderOwnerMatch')">
                            Sender=Owner ${getSortIcon('senderOwnerMatch')}
                        </th>
                        <th onclick="sortData('duration')">
                            Duration (days) ${getSortIcon('duration')}
                        </th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Mobile cards
        let mobileHtml = '<div class="mobile-table">';

        filteredData.forEach((contract, index) => {
            // Ensure balance is valid
            const balance = contract.balance && !isNaN(contract.balance) ? fromNano(contract.balance) : BigInt(0);
            const balanceDisplay = Number(balance) === 0 ? '0' : toMillions(balance);
            const rank = vestingData.indexOf(contract) + 1;
            const label = labels[contract.address] || '';
            
            // Format vesting amounts with validation
            let unvestedDisplay = '0';
            let liquidDisplay = balanceDisplay;
            let totalVestingDisplay = '-';
            
            try {
                if (contract.unvestedAmount && contract.unvestedAmount !== BigInt(0)) {
                    unvestedDisplay = toMillions(fromNano(contract.unvestedAmount));
                }
                if (contract.liquidAmount && contract.liquidAmount !== BigInt(0)) {
                    liquidDisplay = toMillions(fromNano(contract.liquidAmount));
                }
                if (contract.totalVestingAmount && contract.totalVestingAmount !== BigInt(0)) {
                    totalVestingDisplay = toMillions(fromNano(contract.totalVestingAmount));
                }
            } catch (error) {
                console.warn('Error formatting vesting amounts:', error, contract);
                // Fallback to safe values
                unvestedDisplay = '0';
                liquidDisplay = balanceDisplay;
                totalVestingDisplay = '-';
            }
            
            // Format addresses
            const telegramSenderAddress = 'UQCZ3CmthhVRIciwzpt1VC0XFPBrP6QvVHLZe_Ydx46QSHGU';
            const senderAddressShort = contract.senderAddress ? 
                contract.senderAddress.substring(0, 8) + '...' + contract.senderAddress.substring(contract.senderAddress.length - 6) : '-';
            const senderAddressLink = contract.senderAddress ? 
                (contract.senderAddress === telegramSenderAddress ? 
                    '<span class="badge badge-telegram">telegram</span>' : 
                    makeAddressUrl(contract.senderAddress)) : '-';
            const ownerAddressShort = contract.ownerAddress ? 
                contract.ownerAddress.substring(0, 8) + '...' + contract.ownerAddress.substring(contract.ownerAddress.length - 6) : '-';
            const ownerAddressLink = contract.ownerAddress ? makeAddressUrl(contract.ownerAddress) : '-';
            
            // Check if sender and owner are the same
            const senderOwnerMatch = contract.senderAddress && contract.ownerAddress && 
                contract.senderAddress.toLowerCase() === contract.ownerAddress.toLowerCase();
            
            // Format dates with validation
            const vestingStartDate = contract.vestingStartTime && !isNaN(contract.vestingStartTime) ? 
                new Date(contract.vestingStartTime * 1000).toLocaleDateString() : '-';
            const durationDays = contract.vestingDuration && !isNaN(contract.vestingDuration) ? 
                Math.floor(contract.vestingDuration / (24 * 60 * 60)) : '-';
            
            // Desktop table row
            desktopHtml += `
                <tr>
                    <td><span class="badge badge-info">#${rank}</span></td>
                    <td class="mono">${makeAddressUrl(contract.address)}</td>
                    <td>${label ? `<span class="badge badge-label">${label}</span>` : '-'}</td>
                    <td>${contract.created_utime ? new Date(contract.created_utime * 1000).toLocaleDateString() : '-'}</td>
                    <td>${vestingStartDate}</td>
                    <td><strong>${balanceDisplay} TON</strong></td>
                    <td style="background: rgba(255, 59, 48, 0.05);"><strong style="color: #FF3B30;">${unvestedDisplay} TON</strong></td>
                    <td><span style="color: #34C759;">${liquidDisplay} TON</span></td>
                    <td>${totalVestingDisplay} TON</td>
                    <td class="mono" style="font-size: 11px;">${senderAddressLink}</td>
                    <td class="mono" style="font-size: 11px;">${ownerAddressLink}</td>
                    <td style="text-align: center;">
                        ${senderOwnerMatch ? 
                            '<span class="badge" style="background: #34C759; color: white;">✓ Same</span>' : 
                            contract.senderAddress && contract.ownerAddress ? 
                                '<span class="badge" style="background: #FF3B30; color: white;">✗ Different</span>' : 
                                '<span style="color: #8E8E93;">-</span>'
                        }
                    </td>
                    <td>${durationDays}</td>
                </tr>
            `;

            // Mobile card
            mobileHtml += `
                <div class="mobile-card">
                    <div class="mobile-card-header">
                        <div class="mobile-card-title">
                            Vesting Contract #${rank}
                        </div>
                        <div class="mobile-card-index">#${rank}</div>
                    </div>
                    <div class="mobile-card-content">
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Label:</span>
                            <span class="mobile-card-value">${label || '-'}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Created:</span>
                            <span class="mobile-card-value">${contract.created_utime ? new Date(contract.created_utime * 1000).toLocaleDateString() : '-'}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Vesting Start:</span>
                            <span class="mobile-card-value">${vestingStartDate}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Current Balance:</span>
                            <span class="mobile-card-value"><strong>${balanceDisplay} TON</strong></span>
                        </div>
                        <div class="mobile-card-row" style="background: rgba(255, 59, 48, 0.05);">
                            <span class="mobile-card-label"><strong>Unvested Amount:</strong></span>
                            <span class="mobile-card-value"><strong style="color: #FF3B30;">${unvestedDisplay} TON</strong></span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Liquid Amount:</span>
                            <span class="mobile-card-value"><span style="color: #34C759;">${liquidDisplay} TON</span></span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Total Vesting:</span>
                            <span class="mobile-card-value">${totalVestingDisplay} TON</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Contract Address:</span>
                            <span class="mobile-card-value mono">${makeAddressUrl(contract.address)}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Sender Address:</span>
                            <span class="mobile-card-value mono">${senderAddressLink}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Owner Address:</span>
                            <span class="mobile-card-value mono">${ownerAddressLink}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Sender=Owner:</span>
                            <span class="mobile-card-value">
                                ${senderOwnerMatch ? 
                                    '<span class="badge" style="background: #34C759; color: white;">✓ Same</span>' : 
                                    contract.senderAddress && contract.ownerAddress ? 
                                        '<span class="badge" style="background: #FF3B30; color: white;">✗ Different</span>' : 
                                        '<span style="color: #8E8E93;">-</span>'
                                }
                            </span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Duration:</span>
                            <span class="mobile-card-value">${durationDays} days</span>
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

    // Load vesting details for contracts - fast mode (cache only)
    function enrichVestingDataFromCache(contractsData) {
        const enrichedData = [];
        let invalidCacheCount = 0;
        
        for (let i = 0; i < contractsData.length; i++) {
            const contract = contractsData[i];
            
            try {
                // Use cached data if available
                let vestingDetails = vestingCache[contract.address] || null;
                
                // 檢查快取數據的有效性
                if (vestingDetails) {
                    // 檢查是否為無效快取（所有關鍵值都是 0）
                    if (vestingDetails.start_time === 0 && 
                        vestingDetails.total_duration === 0 && 
                        vestingDetails.unlock_period === 0 && 
                        (!vestingDetails.total_amount || vestingDetails.total_amount === "0")) {
                        
                        console.warn(`🗑️ Removing invalid cached data for ${contract.address}`);
                        delete vestingCache[contract.address];
                        vestingDetails = null;
                        invalidCacheCount++;
                    }
                }
                
                // Calculate vesting status
                const vestingStatus = calculateVestingStatus(vestingDetails, BigInt(contract.balance || 0));
                
                // Combine all data
                const enrichedContract = {
                    ...contract,
                    vestingDetails,
                    vestingStatus,
                    // Key metrics for easy access
                    totalVestingAmount: vestingStatus ? vestingStatus.totalAmount : BigInt(0),
                    unvestedAmount: vestingStatus ? vestingStatus.unvestedAmount : BigInt(0),
                    liquidAmount: vestingStatus ? vestingStatus.liquidAmount : BigInt(contract.balance || 0),
                    ownerAddress: vestingDetails ? vestingDetails.owner_address : null,
                    senderAddress: vestingDetails ? vestingDetails.sender_address : null,
                    vestingStartTime: vestingDetails ? vestingDetails.start_time : null,
                    vestingDuration: vestingDetails ? vestingDetails.total_duration : null,
                    unlockPeriod: vestingDetails ? vestingDetails.unlock_period : null
                };
                
                enrichedData.push(enrichedContract);
            } catch (error) {
                console.warn(`Error processing contract ${contract.address} from cache:`, error);
                
                // Add contract with fallback data
                const fallbackContract = {
                    ...contract,
                    vestingDetails: null,
                    vestingStatus: null,
                    totalVestingAmount: BigInt(0),
                    unvestedAmount: BigInt(0),
                    liquidAmount: BigInt(contract.balance || 0),
                    ownerAddress: null,
                    senderAddress: null,
                    vestingStartTime: null,
                    vestingDuration: null,
                    unlockPeriod: null
                };
                
                enrichedData.push(fallbackContract);
            }
        }
        
        // 如果清理了無效快取，保存到 localStorage
        if (invalidCacheCount > 0) {
            console.log(`🧹 Cleaned ${invalidCacheCount} invalid cache entries`);
            saveCacheToStorage();
        }
        
        return enrichedData;
    }
    
    // 簡化版本：背景更新缺失的歸屬數據（支援實時更新）
    async function updateMissingVestingData(contractsData, onProgress = null, onComplete = null, enableRealTimeUpdate = false) {
        // 找出需要更新的地址
        const addressesToUpdate = contractsData.filter(contract => {
            const hasCache = vestingCache[contract.address];
            const wasNoData = noDataCache.has(contract.address);
            return !hasCache || wasNoData;
        });
        
        if (addressesToUpdate.length === 0) {
            console.log('✅ No addresses need updating');
            if (onComplete) onComplete(0);
            return;
        }
        
        console.log(`🔄 Background updating ${addressesToUpdate.length} addresses...`);
        
        let updatedCount = 0;
        let newDataCount = 0;
        
        // 批量處理地址
        for (const contract of addressesToUpdate) {
            try {
                const wasNoData = noDataCache.has(contract.address);
                const vestingDetails = await fetchVestingDetails(contract.address, wasNoData);
                
                if (vestingDetails && !vestingCache[contract.address]) {
                    newDataCount++;
                    console.log(`🎉 Found new vesting data for ${contract.address}`);
                    
                    // 實時更新：每找到新數據就立即更新顯示
                    if (enableRealTimeUpdate) {
                        const updatedData = enrichVestingDataFromCache(contractsData);
                        vestingData = updatedData;
                        renderStats();
                        filterData();
                    }
                }
                
            } catch (error) {
                console.warn(`❌ Background update failed for ${contract.address}:`, error);
            }
            
                updatedCount++;
                
            // 回調進度更新
                if (onProgress) {
                    onProgress(updatedCount, addressesToUpdate.length, newDataCount);
            }
        }
        
        // 完成回調
        if (onComplete) {
            onComplete(newDataCount);
        }
        
        console.log(`✅ Background update complete: ${updatedCount}/${addressesToUpdate.length} processed, ${newDataCount} new data found`);
    }

    // 簡化版本：enrichVestingData - 處理合約數據並計算歸屬狀態（支援實時更新）
    async function enrichVestingData(contractsData, isRefresh = false, enableRealTimeUpdate = false) {
        const enrichedData = [];
        const totalContracts = contractsData.length;
        
        updateProgress(70, 'Processing vesting contract details...');
        
        // 計算需要查詢的地址
        const addressesToQuery = contractsData.filter(contract => {
            const hasCache = vestingCache[contract.address];
            const wasNoData = noDataCache.has(contract.address);
            return !hasCache || (isRefresh && wasNoData);
        }).length;
        
        console.log(`📊 Processing ${totalContracts} contracts. Query needed: ${addressesToQuery}, Using cache: ${totalContracts - addressesToQuery}`);
        
        let queriedCount = 0;
        
        for (let i = 0; i < contractsData.length; i++) {
            const contract = contractsData[i];
            
            try {
                const enrichedContract = await processContract(contract, isRefresh);
                enrichedData.push(enrichedContract);
                
                // 如果需要查詢 API，更新進度
                const needsQuery = !vestingCache[contract.address] || (isRefresh && noDataCache.has(contract.address));
            if (needsQuery) {
                    queriedCount++;
                    updateProgress(
                        70 + (queriedCount / Math.max(addressesToQuery, 1)) * 25, 
                        `Queried ${queriedCount}/${addressesToQuery} addresses...`
                    );
                }

                // 實時更新：每獲得一個新數據就更新顯示
                if (enableRealTimeUpdate && (needsQuery || i % 10 === 0)) {
                    const currentData = [...enrichedData];
                    // 加上尚未處理的合約（使用快取或後備數據）
                    for (let j = i + 1; j < contractsData.length; j++) {
                        const remainingContract = contractsData[j];
                        try {
                            const cachedContract = enrichVestingDataFromCache([remainingContract])[0];
                            currentData.push(cachedContract);
                        } catch (error) {
                            currentData.push(createFallbackContract(remainingContract));
                        }
                    }
                    
                    // 實時更新顯示
                    vestingData = currentData;
                    renderStats();
                    filterData();
                }
                
            } catch (error) {
                console.warn(`❌ Error processing contract ${contract.address}:`, error);
                enrichedData.push(createFallbackContract(contract));
            }
        }
        
        return enrichedData;
    }

    // 處理單個合約
    async function processContract(contract, isRefresh = false) {
                const hasCache = vestingCache[contract.address];
                const wasNoData = noDataCache.has(contract.address);
                const needsQuery = !hasCache || (isRefresh && wasNoData);
                
                let vestingDetails = null;
                
                if (needsQuery) {
                    vestingDetails = await fetchVestingDetails(contract.address, wasNoData);
                } else if (hasCache) {
                    vestingDetails = vestingCache[contract.address];
                }
                
        // 計算歸屬狀態
                const vestingStatus = calculateVestingStatus(vestingDetails, BigInt(contract.balance || 0));
                
        return {
                    ...contract,
                    vestingDetails,
                    vestingStatus,
                    totalVestingAmount: vestingStatus ? vestingStatus.totalAmount : BigInt(0),
                    unvestedAmount: vestingStatus ? vestingStatus.unvestedAmount : BigInt(0),
                    liquidAmount: vestingStatus ? vestingStatus.liquidAmount : BigInt(contract.balance || 0),
                    ownerAddress: vestingDetails ? vestingDetails.owner_address : null,
                    senderAddress: vestingDetails ? vestingDetails.sender_address : null,
                    vestingStartTime: vestingDetails ? vestingDetails.start_time : null,
                    vestingDuration: vestingDetails ? vestingDetails.total_duration : null,
                    unlockPeriod: vestingDetails ? vestingDetails.unlock_period : null
                };
    }

    // 創建後備合約數據（當處理失敗時）
    function createFallbackContract(contract) {
        return {
                    ...contract,
                    vestingDetails: null,
                    vestingStatus: null,
                    totalVestingAmount: BigInt(0),
                    unvestedAmount: BigInt(0),
                    liquidAmount: BigInt(contract.balance || 0),
                    ownerAddress: null,
                    senderAddress: null,
                    vestingStartTime: null,
                    vestingDuration: null,
                    unlockPeriod: null
        };
    }

    // 顯示快取數據
    function displayCachedData(cachedCount) {
        try {
                    const existingAddresses = Object.keys(vestingCache);
                    const cachedData = existingAddresses.map(address => {
                        const contract = { 
                            address,
                    balance: '0', // 預設餘額，地址載入後會更新
                            created_utime: 0,
                            latest_transaction_time: 0
                        };
                        return enrichVestingDataFromCache([contract])[0];
                    });
                    
                    if (cachedData.length > 0) {
                        vestingData = cachedData;
                        renderStats();
                        filterData();
                        updateApiStatus('Cache', null, `Showing cached data (${cachedCount} contracts)`, true);
                    }
                } catch (error) {
            console.warn('⚠️ Error showing cached data immediately:', error);
            // 繼續正常載入流程
        }
    }

    // 處理有快取數據的載入流程
    async function handleCachedDataLoad(addressData, startTime, cachedCount) {
                console.log('🚀 Fast loading from cache...');
                updateProgress(70, 'Loading from cache...');
                
        // 快速從快取載入
                const cachedData = enrichVestingDataFromCache(addressData);
                vestingData = cachedData;
                
                updateProgress(95, 'Cache loaded, starting background update...');
                
                const fastEndTime = performance.now();
        console.log(`⚡ Fast cache load completed in ${(fastEndTime - startTime).toFixed(0)}ms`);
                
        // 立即顯示快取數據
                renderStats();
                filterData();
                updateApiStatus('Cache', fastEndTime - startTime, `Cache loaded (${cachedCount} contracts with data)`, true);
                
        // 背景更新缺失數據
                const addressesToUpdate = addressData.filter(contract => 
                    !vestingCache[contract.address] || noDataCache.has(contract.address)
                );
                
                if (addressesToUpdate.length > 0) {
                    console.log(`🔄 Starting background update for ${addressesToUpdate.length} addresses...`);
                    
                    updateMissingVestingData(addressData, 
                // 進度回調
                        (current, total, newDataFound) => {
                            const progressText = `Background update: ${current}/${total} (found ${newDataFound} new data)`;
                            updateApiStatus('Background Update', null, progressText, true);
                        },
                // 完成回調
                        (newDataFound) => {
                    handleBackgroundUpdateComplete(addressData, newDataFound);
                }
            );
        } else {
            setTimeout(() => hideApiStatus(), 3000);
        }
    }

    // 處理完整數據載入流程
    async function handleFullDataLoad(addressData, isRefresh, startTime, enableRealTimeUpdate = false) {
        console.log('📦 Standard loading (no cache available)...');
        
        const enrichedData = await enrichVestingData(addressData, isRefresh, enableRealTimeUpdate);
        const endTime = performance.now();
        
        vestingData = enrichedData;
        console.log(`✅ Successfully fetched and processed ${vestingData.length} Vesting contracts`);
        
        updateProgress(100, 'Complete!');
        
        // 顯示完成結果
        const newCachedCount = Object.keys(vestingCache).length;
        const newNoDataCount = noDataCache.size;
        const completionText = `Complete! Loaded ${vestingData.length} contracts (Cached: ${newCachedCount}, No data: ${newNoDataCount}) - ${(endTime - startTime).toFixed(0)}ms`;
        updateApiStatus('TON Center API v2', endTime - startTime, completionText, false);
        
                                renderStats();
                                filterData();
                                
        setTimeout(() => hideApiStatus(), 3000);
    }

    // 處理背景更新完成
    function handleBackgroundUpdateComplete(addressData, newDataFound) {
        console.log('🎉 Background update completed');
        
        // 刷新顯示
                                const updatedData = enrichVestingDataFromCache(addressData);
                                vestingData = updatedData;
                                renderStats();
                                filterData();
                                
        if (newDataFound > 0) {
            updateApiStatus('Background Complete', null, `Background update complete! Found ${newDataFound} new data`, false);
            setTimeout(() => hideApiStatus(), 5000);
        } else {
                                updateApiStatus('Background Complete', null, 'Background update complete, no new data found', false);
            setTimeout(() => hideApiStatus(), 3000);
        }
    }

    // 徹底清除所有快取並以 1次/秒 重新載入
    function clearAllCacheAndReload() {
        console.log('🗑️ Clearing all cache and reloading with 1 req/sec...');
        
        // 清除記憶體快取
        vestingCache = {};
        noDataCache = new Set();
        vestingData = [];
        
        // 清除 localStorage 快取
        try {
            localStorage.removeItem('vestingCache');
            localStorage.removeItem('noDataCache');
            console.log('✅ All cache cleared successfully');
        } catch (error) {
            console.warn('⚠️ Error clearing localStorage:', error);
        }
        
        // 設定為最慢速率（1次/秒）
        setApiRateLimit('FIRST_LOAD');
        
        // 清空顯示並顯示載入狀態
        updateStatsForLoading();
        document.getElementById('tableContainer').innerHTML = '';
        
        // 顯示狀態
        updateApiStatus('Cache Cleared', null, '快取已清除，以 1次/秒 重新載入中...', true);
        
        // 強制完整重新載入（啟用實時更新）
        loadVestingDataWithRealTime(false, true);
    }

    // 使用指定速率載入數據
    function loadWithRate(rateType) {
        console.log(`🚀 Loading with rate: ${rateType}`);
        
        // 設定對應的速率
        setApiRateLimit(rateType);
        
        // 顯示載入訊息
        const rateInfo = {
            'FIRST_LOAD': { text: '1次/秒', emoji: '🐌' },
            'BACKGROUND': { text: '5次/秒', emoji: '🔄' },
            'FULL_RELOAD': { text: '10次/秒', emoji: '⚡' }
        };
        
        const info = rateInfo[rateType] || rateInfo['FIRST_LOAD'];
        updateApiStatus('Loading', null, `${info.emoji} 使用 ${info.text} 速率載入中...`, true);
        
        // 更新統計卡片為載入狀態
        updateStatsForLoading();
        
        // 開始載入數據（強制完整載入，啟用實時更新）
        loadVestingDataWithRealTime(false, true);
    }

    // 更新統計卡片為載入狀態
    function updateStatsForLoading() {
        document.getElementById('statsContainer').innerHTML = `
            <div class="stat-card">
                <h3>Loading...</h3>
                <p class="value">Loading...</p>
            </div>
            <div class="stat-card">
                <h3>Loading...</h3>
                <p class="value">Loading...</p>
            </div>
            <div class="stat-card">
                <h3>Loading...</h3>
                <p class="value">Loading...</p>
            </div>
            <div class="stat-card">
                <h3>Loading...</h3>
                <p class="value">Loading...</p>
            </div>
            <div class="stat-card">
                <h3>Loading...</h3>
                <p class="value">Loading...</p>
            </div>
            <div class="stat-card">
                <h3>Loading...</h3>
                <p class="value">Loading...</p>
            </div>
            <div class="stat-card">
                <h3>Contracts with Data</h3>
                <p class="value">Loading...</p>
                <div style="margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; width: 100%;">
                    <button onclick="clearAllCacheAndReload()" class="action-button clear-button">
                        <span class="button-icon">🗑️</span>
                        <span class="button-text">清除快取 (1/秒)</span>
                    </button>
                    <button onclick="loadWithRate('BACKGROUND')" class="action-button medium-button">
                        <span class="button-icon">🔄</span>
                        <span class="button-text">5次/秒</span>
                    </button>
                    <button onclick="loadWithRate('FULL_RELOAD')" class="action-button fast-button">
                        <span class="button-icon">⚡</span>
                        <span class="button-text">10次/秒</span>
                    </button>
                </div>
            </div>
        `;
    }

    // Load data with fast cache display + background update
    async function loadVestingData(isRefresh = false, forceFullLoad = false) {
        try {
            console.log('🚀 Starting to fetch Vesting contract data...');
            
            // 設定 API 請求速率
            if (forceFullLoad) {
                setApiRateLimit('FULL_RELOAD');
            } else if (isRefresh) {
                setApiRateLimit('BACKGROUND');
            } else {
                setApiRateLimit('FIRST_LOAD');
            }
            
            // Check if we have cached data first
            const cachedCount = Object.keys(vestingCache).length;
            const noDataCount = noDataCache.size;
            
            // 立即顯示快取數據（如果有的話）
            if (cachedCount > 0) {
                console.log('📦 Showing cached data immediately...');
                displayCachedData(cachedCount);
            }
            
            showLoading();
            updateProgress(0, 'Starting to load Vesting contract data...');
            
            const startTime = performance.now();
            
            // Get all vesting contract addresses
            const addressData = await fetchAllVestingAddresses();
            if (!addressData || addressData.length === 0) {
                throw new Error('Unable to fetch any Vesting contract data');
            }
            
            console.log(`📊 Cache status: ${cachedCount} with data, ${noDataCount} without data${isRefresh ? ' (refresh mode)' : ''}`);
            
            // 根據快取狀態選擇載入策略
            if (cachedCount > 0 && !forceFullLoad) {
                await handleCachedDataLoad(addressData, startTime, cachedCount);
            } else {
                await handleFullDataLoad(addressData, isRefresh, startTime);
            }
            
        } catch (error) {
            console.error('Loading Vesting data failed:', error);
            
            // Show error status
            updateApiStatus('Loading Failed', null, error.message || 'Unable to load data', false);
            
            // Show friendly error message
            document.getElementById('statsContainer').innerHTML = `
                <div class="stat-card" style="grid-column: 1 / -1;">
                    <h3>Loading Failed</h3>
                    <p class="value" style="color: #FF3B30; font-size: 16px;">
                        ${error.message || 'Unable to load Vesting contract data'}
                    </p>
                    <button onclick="loadVestingData(true, true)" class="action-button retry-button">
                        <span class="button-icon">🔄</span>
                        <span class="button-text">Retry</span>
                    </button>
                </div>
            `;
            
            document.getElementById('tableContainer').innerHTML = '';
            
            setTimeout(() => {
                hideApiStatus();
            }, 5000);
        }
    }

    // 支援實時更新的載入函數
    async function loadVestingDataWithRealTime(isRefresh = false, forceFullLoad = false) {
        try {
            console.log('🚀 Starting to fetch Vesting contract data with real-time updates...');
            
            showLoading();
            updateProgress(0, 'Starting to load Vesting contract data...');
            
            const startTime = performance.now();
            
            // Get all vesting contract addresses
            const addressData = await fetchAllVestingAddresses();
            if (!addressData || addressData.length === 0) {
                throw new Error('Unable to fetch any Vesting contract data');
            }
            
            console.log(`📊 Starting real-time data loading with current rate: ${currentRateLimit} req/sec`);
            
            // 直接進行完整載入（啟用實時更新）
            await handleFullDataLoad(addressData, isRefresh, startTime, true);
            
        } catch (error) {
            console.error('Loading Vesting data failed:', error);
            
            // Show error status
            updateApiStatus('Loading Failed', null, error.message || 'Unable to load data', false);
            
            // Show friendly error message
            document.getElementById('statsContainer').innerHTML = `
                <div class="stat-card" style="grid-column: 1 / -1;">
                    <h3>Loading Failed</h3>
                    <p class="value" style="color: #FF3B30; font-size: 16px;">
                        ${error.message || 'Unable to load Vesting contract data'}
                    </p>
                    <div style="margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; width: 100%;">
                        <button onclick="clearAllCacheAndReload()" class="action-button clear-button">
                            <span class="button-icon">🗑️</span>
                            <span class="button-text">Clear Cache (1/sec)</span>
                        </button>
                        <button onclick="loadWithRate('BACKGROUND')" class="action-button medium-button">
                            <span class="button-icon">🔄</span>
                            <span class="button-text">5/sec</span>
                        </button>
                        <button onclick="loadWithRate('FULL_RELOAD')" class="action-button fast-button">
                            <span class="button-icon">⚡</span>
                            <span class="button-text">10/sec</span>
                        </button>
                    </div>
                </div>
            `;
            
            document.getElementById('tableContainer').innerHTML = '';
            
            setTimeout(() => {
                hideApiStatus();
            }, 5000);
        }
    }

    // Event listeners

    // Detect if this is a page refresh
    function detectPageRefresh() {
        // Check if there's any existing data that would indicate this is a refresh
        const hasExistingCache = Object.keys(vestingCache).length > 0;
        const hasExistingNoDataCache = noDataCache.size > 0;
        
        // Check performance navigation API if available
        let navigationTypeRefresh = false;
        if (performance.navigation) {
            navigationTypeRefresh = performance.navigation.type === performance.navigation.TYPE_RELOAD;
        } else if (performance.getEntriesByType) {
            const perfEntries = performance.getEntriesByType('navigation');
            if (perfEntries.length > 0) {
                navigationTypeRefresh = perfEntries[0].type === 'reload';
            }
        }
        
        isPageRefresh = navigationTypeRefresh || hasExistingCache || hasExistingNoDataCache;
        console.log(`Page load detected: ${isPageRefresh ? 'Refresh' : 'First load'}`);
        
        return isPageRefresh;
    }

    // 簡化的初始化邏輯
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🌟 Initializing Vesting Dashboard...');
        
        // 載入本地快取
        loadCacheFromStorage();
        
        // 檢測頁面刷新狀態
        const isPageRefresh = detectPageRefresh();
        
        // 載入標籤數據和黑名單
        fetchLabelsCsv();
        fetchBlacklistCsv();
        
        // 顯示快取數據（如果有的話）
        const cachedCount = Object.keys(vestingCache).length;
        if (cachedCount > 0) {
            console.log('🚀 Found existing cache, showing immediately...');
            displayCachedData(cachedCount);
        }
        
        // 開始主要數據載入
        loadVestingData(isPageRefresh);
    });

