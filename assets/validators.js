// Local timezone
const timestampToDate = (timestamp) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
};

const makeAddressUrl = (address) => {
  return `<a href="https://tonscan.org/address/${address}" target="_blank">${address}</a>`;
};

const fromNano = (nano) => {
  return BigInt(nano) / BigInt(1e9);
};

const toMillions = (n) => {
  return (Number(n) / 1e6).toFixed(3) + 'M';
};

const toMillionsShort = (n) => {
  let s = (Number(n) / 1e6).toFixed(3);
  for (let i = 0; i < 3; i++) {
    if (s.endsWith('0')) s = s.substring(0, s.length - 1);
  }
  if (s.endsWith('.')) s = s.substring(0, s.length - 1);
  return s + 'M';
};

const withCommas = (n) => {
  try {
    const num = typeof n === 'bigint' ? Number(n) : Number(n);
    if (Number.isNaN(num)) return n;
    return num.toLocaleString('en-US');
  } catch {
    return n;
  }
};

const timeRange = (timestamp) => {
  const now = Math.floor(Date.now() / 1000);
  let delta = timestamp - now;
  const isNegative = delta < 0;
  delta = Math.abs(delta);

  const h = Math.floor(delta / 3600);
  const m = Math.floor((delta % 3600) / 60);

  let result = '';
  if (h !== 0) result += h + ' hours ';
  result += m + ' minutes';

  if (isNegative) {
    return `${result} ago`;
  } else {
    return `in ${result}`;
  }
};

const formatCommit = (s) => {
  if (!s) return 'N/A';
  return s.substring(0, 7);
};

const formatType = (s) => {
  if (!s) return 'N/A';
  switch (s) {
    case 'single_nominator_v1':
      return 'Single Nominator 1.0';
    case 'single_nominator_v1.1':
      return 'Single Nominator 1.1';
    case 'nominator_pool_v1':
      return 'Nominator Pool 1.0';
    case 'liquid_staking_controller':
      return 'Liquid Staking';
    case 'whales_proxy':
      return 'TON Whales';
    case 'vesting_lockup':
      return 'Lockup';
    case 'wallet_v1_r3':
      return 'Wallet 1.3';
    case 'hipo_controller':
      return 'HIPO';
    case 'bemo_nominator':
      return 'BEMO';
    case 'other':
      return 'Other';
  }
  return s;
};

const toPercent = (n) => {
  return (Number(n) * 100).toFixed(2) + '%';
};

const getCountryFlag = (countryCode) => {
  if (!countryCode || countryCode === 'N/A') return '🌐';
  try {
    return String.fromCodePoint(
      ...countryCode
        .toUpperCase()
        .split('')
        .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
    );
  } catch {
    return '🌐';
  }
};

const wait = (millis) => {
  return new Promise((resolve) => {
    setTimeout(resolve, millis);
  });
};

const showLoading = () => {};

const hideLoading = () => {};

const urlParams = new URLSearchParams(document.location.search);
const cycleIdFromUrl = urlParams.get('cycle_id');

const apiStatusEl = document.getElementById('apiStatus');
const apiNameEl = document.getElementById('apiName');
const apiPerformanceEl = document.getElementById('apiPerformance');
const statsContainer = document.getElementById('statsContainer');

let cycleData;
let qosData;
let qosDataByCycleId;
let availableCycles = [];
let currentCycleId = null;
let searchText = '';
let currentSort = { column: null, direction: 'asc' };
let currentFilters = {
  efficiency: '',
  type: '',
  geo: '',
  saved: ''
};

// API configuration and performance monitoring
const API_ENDPOINTS = {
  toncenter: {
    cycles: 'https://elections.toncenter.com/getValidationCycles',
    qos: 'https://toncenter.com/api/qos/cycleScoreboard/',
    priority: 1,
    lastResponseTime: null,
    errorCount: 0
  },
  getaruai: {
    cycles: 'https://getaruai.com/api/v1/validation-cycle',
    qos: 'https://toncenter.com/api/qos/cycleScoreboard/', // 回退到 toncenter
    priority: 2,
    lastResponseTime: null,
    errorCount: 0
  }
};

let currentApiEndpoint = 'toncenter'; // 默認使用 toncenter
let apiPerformanceData = {};

// 全域狀態（避免雙重初始化）
const GLOBAL_CTX = (typeof window !== 'undefined' ? window : globalThis);
GLOBAL_CTX.__validatorsState = GLOBAL_CTX.__validatorsState || { initialized: false };

// 簡單快取（避免重覆請求，降低載入時間）
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 分鐘
const cache = {
  cyclesList: { ts: 0, data: null },
  cycleById: new Map(), // cycle_id -> { ts, data }
  qosByCycleId: new Map(), // cycle_id -> { ts, data }
  qosByRange: new Map(), // `${from}-${to}` -> { ts, data }
};

const storage = localStorage.getItem('savedAdnl');
let savedAdnl = storage ? storage.split(',') : [];

const saveAdnl = (adnl) => {
  const index = savedAdnl.indexOf(adnl);
  if (index > -1) {
    savedAdnl.splice(index, 1);
  } else {
    savedAdnl.push(adnl);
  }
  localStorage.setItem('savedAdnl', savedAdnl.join(','));
  renderTable();
};

let labels = {};

async function fetchCsv() {
  try {
    const response = await fetch('labels.csv');
    if (response.ok) {
      const text = await response.text();
      const lines = text.split('\n');
      const columns = lines.map((line) => line.split(','));
      columns.forEach((c) => {
        if (c.length !== 2) {
          console.log('Invalid CSV', c);
          throw new Error();
        }
        const adnl_addr = c[0];
        const label = c[1].trim();
        if (label !== '#N/A') {
          labels[adnl_addr] = label;
        }
      });
      console.log(labels);
      renderTable();
    }
  } catch (e) {}
}

// API request function with performance monitoring
async function apiWithPerformanceTracking(url, endpointName) {
  const startTime = performance.now();
  try {
    const response = await fetch(url);
    const endTime = performance.now();
    const responseTime = endTime - startTime;

    // 更新性能數據
    API_ENDPOINTS[endpointName].lastResponseTime = responseTime;
    API_ENDPOINTS[endpointName].errorCount = 0; // 重置錯誤計數

    if (!response.ok) {
      API_ENDPOINTS[endpointName].errorCount++;
      console.error(`API 錯誤 (${endpointName}):`, response);
      throw new Error(`Unable to load data - ${response.status}`);
    }

    console.log(`API 響應時間 (${endpointName}): ${responseTime.toFixed(2)}ms`);

    // 更新 API 狀態顯示
    updateApiStatus(endpointName, responseTime);

    return await response.json();
  } catch (error) {
    const endTime = performance.now();
    API_ENDPOINTS[endpointName].lastResponseTime = endTime - startTime;
    API_ENDPOINTS[endpointName].errorCount++;
    console.error(`API request failed (${endpointName}):`, error);
    throw error;
  }
}

// 原有的 api 函數，用於向後兼容
async function api(url) {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(response);
    throw new Error('cant load');
  }

  return await response.json();
}

// 選擇最佳 API 端點
function selectBestApiEndpoint() {
  const endpoints = Object.keys(API_ENDPOINTS);
  let bestEndpoint = endpoints[0];
  let bestScore = -1;

  for (const endpoint of endpoints) {
    const data = API_ENDPOINTS[endpoint];
    let score = 0;

    // 基於優先級的基礎分數 (優先級越高分數越高)
    score += (10 - data.priority) * 10;

    // 響應時間分數 (響應時間越短分數越高)
    if (data.lastResponseTime !== null) {
      score += Math.max(0, 100 - data.lastResponseTime / 10);
    }

    // 錯誤率懲罰
    score -= data.errorCount * 20;

    if (score > bestScore) {
      bestScore = score;
      bestEndpoint = endpoint;
    }
  }

  console.log(`選擇的 API 端點: ${bestEndpoint} (分數: ${bestScore.toFixed(2)})`);
  return bestEndpoint;
}

// 更新 API 狀態顯示
function updateApiStatus(endpointName, responseTime = null, progressText = null, keepVisible = false) {

  // Display API name
  const displayNames = {
    toncenter: 'TON Center',
    getaruai: 'GetAruAI',
    'Loading': 'Loading',
    'Loading Failed': 'Loading Failed'
  };

  apiNameEl.textContent = displayNames[endpointName] || endpointName;

  // Display performance information or progress text
  let performanceText = '';
  if (progressText) {
    performanceText = progressText;
  } else if (responseTime !== null) {
    performanceText = `${responseTime.toFixed(0)}ms`;
  }

  apiPerformanceEl.textContent = performanceText;

  // Show status indicator
  apiStatusEl.classList.add('show');

  // Clear previous timer
  if (window.apiStatusTimeout) {
    clearTimeout(window.apiStatusTimeout);
  }

  // Hide after 3 seconds if not keeping visible
  if (!keepVisible && !progressText) {
    window.apiStatusTimeout = setTimeout(() => {
      apiStatusEl.classList.remove('show');
    }, 3000);
  }
}

// Hide API status
function hideApiStatus() {
  if (window.apiStatusTimeout) {
    clearTimeout(window.apiStatusTimeout);
  }
  apiStatusEl.classList.remove('show');
}

// Update progress using API status panel
const updateProgress = (percentage, text = null) => {
  if (text) {
    const progressText = `${Math.round(percentage)}% - ${text}`;
    updateApiStatus('Loading', null, progressText, true);
    console.log(`Loading progress: ${Math.round(percentage)}% - ${text}`);
  }
};

async function loadAvailableCycles() {
  try {
    // 使用快取（新鮮度 2 分鐘）
    if (cache.cyclesList.data && Date.now() - cache.cyclesList.ts < CACHE_TTL_MS) {
      availableCycles = cache.cyclesList.data;
      renderCycleSelector();
      return;
    }

    // 並行嘗試兩個來源，誰先成功用誰
    const toncenterPromise = apiWithPerformanceTracking(
      API_ENDPOINTS.toncenter.cycles + '?limit=50',
      'toncenter'
    ).then((res) => ({ src: 'toncenter', data: res }));

    const getaruPromise = apiWithPerformanceTracking(
      API_ENDPOINTS.getaruai.cycles,
      'getaruai'
    ).then((res) => ({ src: 'getaruai', data: Array.isArray(res) ? res : [res] }));

    const results = await Promise.allSettled([toncenterPromise, getaruPromise]);

    // 優先取成功且為 toncenter，其次 getaruai
    let chosen = results.find((r) => r.status === 'fulfilled' && r.value.src === 'toncenter')
      || results.find((r) => r.status === 'fulfilled');

    if (!chosen) throw new Error('All API endpoints failed for cycles list');

    const { src, data } = chosen.value;
    availableCycles = data;
    cache.cyclesList = { ts: Date.now(), data };
    currentApiEndpoint = src;

    renderCycleSelector();
    console.log(`Successfully loaded ${availableCycles.length} validation cycles, using API: ${src}`);
  } catch (error) {
    console.error('Failed to load validation cycle list:', error);
    const cycleSelector = document.getElementById('cycleSelector');
    cycleSelector.innerHTML = '<option value="">Loading failed - please retry</option>';
  }
}

function renderCycleSelector() {
  const cycleSelector = document.getElementById('cycleSelector');
  cycleSelector.innerHTML = '';

  // Add current cycle option
  const currentOption = document.createElement('option');
  currentOption.value = '';
  currentOption.textContent = 'Current Cycle (Auto)';
  cycleSelector.appendChild(currentOption);

  // Add all available cycles
  availableCycles.forEach((cycle) => {
    const option = document.createElement('option');
    option.value = cycle.cycle_id;
    const cycleInfo = cycle.cycle_info;
    const startDate = new Date(cycleInfo.utime_since * 1000).toLocaleDateString();
    const endDate = new Date(cycleInfo.utime_until * 1000).toLocaleDateString();
    const status =
      cycleInfo.utime_until < Date.now() / 1000
        ? 'Completed'
        : cycleInfo.utime_since > Date.now() / 1000
        ? 'Not Started'
        : 'In Progress';

    option.textContent = `Cycle #${cycle.cycle_id} (${startDate} - ${endDate}) [${status}]`;
    cycleSelector.appendChild(option);
  });

  // Set current selected cycle
  if (currentCycleId) {
    cycleSelector.value = currentCycleId;
  } else {
    cycleSelector.value = '';
  }
}

async function getCycleData(selectedCycleId = null) {
  showLoading();
  try {
    let response = null;
    let usedEndpoint = null;

    // Try to use the selected best endpoint
    currentApiEndpoint = selectBestApiEndpoint();

    // If cycle ID is specified, use the specified cycle
    if (selectedCycleId) {
      try {
        if (currentApiEndpoint === 'getaruai') {
          // GetAruAI may not support specific cycle ID queries, fallback to toncenter
          response = await apiWithPerformanceTracking(
            `${API_ENDPOINTS.toncenter.cycles}?cycle_id=${selectedCycleId}`,
            'toncenter'
          );
          usedEndpoint = 'toncenter';
        } else {
          response = await apiWithPerformanceTracking(
            `${API_ENDPOINTS.toncenter.cycles}?cycle_id=${selectedCycleId}`,
            'toncenter'
          );
          usedEndpoint = 'toncenter';
        }

        if (response && response.length > 0) {
          cycleData = response[0];
          currentCycleId = selectedCycleId;
        } else {
          throw new Error('Specified validation cycle not found');
        }
      } catch (error) {
        throw new Error(`Failed to load specified cycle: ${error.message}`);
      }
    }
    // If URL has cycle_id parameter, use the cycle from URL
    else if (cycleIdFromUrl) {
      try {
        response = await apiWithPerformanceTracking(
          `${API_ENDPOINTS.toncenter.cycles}?cycle_id=${cycleIdFromUrl}`,
          'toncenter'
        );
        usedEndpoint = 'toncenter';

        if (response && response.length > 0) {
          cycleData = response[0];
          currentCycleId = cycleIdFromUrl;
        } else {
          throw new Error('Validation cycle specified in URL not found');
        }
      } catch (error) {
        throw new Error(`Failed to load cycle specified in URL: ${error.message}`);
      }
    }
    // Otherwise use current cycle - can use new API here
    else {
      // 兩步驟：
      // 1) 先取最近兩個 cycle（不含 node_details）判斷目前 cycle_id
      // 2) 再針對選定 cycle_id 拉含 node_details 的完整資料
      try {
        // Step 1: 輕量列表
        const list = await apiWithPerformanceTracking(
          `${API_ENDPOINTS.toncenter.cycles}?limit=2`,
          'toncenter'
        );
        const now = Date.now() / 1000;
        const chosen = list[0].cycle_info.utime_since < now ? list[0] : list[1];
        const chosenId = chosen.cycle_id;

        // 有快取則用快取
        const cached = cache.cycleById.get(chosenId);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
          cycleData = cached.data;
          usedEndpoint = 'toncenter(cache)';
        } else {
          const detailed = await apiWithPerformanceTracking(
            `${API_ENDPOINTS.toncenter.cycles}?cycle_id=${chosenId}&node_details=true`,
            'toncenter'
          );
          cycleData = detailed && detailed.length ? detailed[0] : chosen;
          cache.cycleById.set(chosenId, { ts: Date.now(), data: cycleData });
          usedEndpoint = 'toncenter';
        }
        currentCycleId = null;
      } catch (error) {
        console.warn('Fast path for current cycle failed, fallback to original flow:', error);
        // 回退：沿用原本的策略
        try {
          response = await apiWithPerformanceTracking(
            `${API_ENDPOINTS.toncenter.cycles}?node_details=true&limit=2`,
            'toncenter'
          );
          const now = Date.now() / 1000;
          cycleData = response[0].cycle_info.utime_since < now ? response[0] : response[1];
          usedEndpoint = 'toncenter';
          currentCycleId = null;
        } catch (fallbackErr) {
          throw new Error(`All strategies failed: ${fallbackErr.message}`);
        }
      }
    }

    console.log(`Loaded cycle data (using ${usedEndpoint} API):`, cycleData);

    // 更新URL
    updateUrlParams();

    // 並行載入 QoS（移除 1 秒等待）
    const fromTs = cycleData.cycle_info.utime_since;
    const toTs = cycleData.cycle_info.utime_until;

    const qosRangeKey = `${fromTs}-${toTs}`;
    const qosIdKey = cycleData.cycle_id;

    const qosPromises = [];

    // Range QoS
    const cachedRange = cache.qosByRange.get(qosRangeKey);
    if (cachedRange && Date.now() - cachedRange.ts < CACHE_TTL_MS) {
      qosData = cachedRange.data.scoreboard;
    } else {
      qosPromises.push(
        getQosCycleData(fromTs, toTs, true).then((resp) => {
          cache.qosByRange.set(qosRangeKey, { ts: Date.now(), data: resp });
          qosData = resp.scoreboard;
        }).catch(() => {})
      );
    }

    // QoS by cycle id
    const cachedById = cache.qosByCycleId.get(qosIdKey);
    if (cachedById && Date.now() - cachedById.ts < CACHE_TTL_MS) {
      qosDataByCycleId = cachedById.data.scoreboard;
    } else {
      qosPromises.push(
        getQosCycleDataByCycleId(qosIdKey, true).then((resp) => {
          cache.qosByCycleId.set(qosIdKey, { ts: Date.now(), data: resp });
          qosDataByCycleId = resp.scoreboard;
        }).catch(() => {})
      );
    }

    if (qosPromises.length) {
      await Promise.allSettled(qosPromises);
    }

    // 一次性渲染
    renderStats();
    renderTable();
    updateCycleInfo();
  } catch (error) {
    console.error('Failed to load validation cycle data:', error);
    alert(`Failed to load validation cycle data: ${error.message}`);
  } finally {
    hideLoading();
  }
}

function updateUrlParams() {
  const url = new URL(window.location);
  if (currentCycleId) {
    url.searchParams.set('cycle_id', currentCycleId);
  } else {
    url.searchParams.delete('cycle_id');
  }
  window.history.replaceState({}, '', url);
}

function updateCycleInfo() {
  const cycleInfoDiv = document.getElementById('cycleInfo');
  if (!cycleData) {
    cycleInfoDiv.innerHTML = '';
    return;
  }

  const cycleInfo = cycleData.cycle_info;
  const now = Date.now() / 1000;
  let status;

  if (cycleInfo.utime_until < now) {
    status = '<span style="color: #6c757d;">Completed</span>';
  } else if (cycleInfo.utime_since > now) {
    status = '<span style="color: #ffc107;">Not Started</span>';
  } else {
    status = '<span style="color: #28a745;">In Progress</span>';
  }

  const startDate =
    new Date(cycleInfo.utime_since * 1000).toLocaleDateString() +
    ' ' +
    new Date(cycleInfo.utime_since * 1000).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  const endDate =
    new Date(cycleInfo.utime_until * 1000).toLocaleDateString() +
    ' ' +
    new Date(cycleInfo.utime_until * 1000).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

  cycleInfoDiv.innerHTML = `
            <div style="margin-bottom: 4px;">
                <span style="color: #34C759; font-weight: 600;">${status}</span> | 
                <span style="font-weight: 500;">${cycleInfo.validators.length} Validators</span>
            </div>
            <div style="font-size: 11px; color: #6e6e73;">
                ${startDate} - ${endDate}
            </div>
        `;
}

async function getQosCycleData(fromTimestamp, toTimestamp, returnRaw = false) {
  const response = await api(
    `https://toncenter.com/api/qos/cycleScoreboard/?node_details=true&from_ts=${fromTimestamp}&to_ts=${toTimestamp}`
  );
  if (returnRaw) return response;
  qosData = response.scoreboard;
  return response;
}

async function getQosCycleDataByCycleId(cycleId, returnRaw = false) {
  const response = await api(
    `https://toncenter.com/api/qos/cycleScoreboard/?node_details=true&cycle_id=${cycleId}`
  );
  if (returnRaw) return response;
  qosDataByCycleId = response.scoreboard;
  return response;
}

const sortValidators = (validators, column, direction) => {
  return validators.sort((a, b) => {
    let valueA, valueB;

    // Handle saved validators first
    const isSavedA = savedAdnl.indexOf(a.adnl_addr) > -1;
    const isSavedB = savedAdnl.indexOf(b.adnl_addr) > -1;

    if (isSavedA && !isSavedB) return -1;
    if (!isSavedA && isSavedB) return 1;

    switch (column) {
      case 'index':
        valueA = a.index;
        valueB = b.index;
        break;
      case 'efficiency':
        valueA = getEfficiencyForValidator(a);
        valueB = getEfficiencyForValidator(b);
        if (valueA === 'N/A') valueA = -1;
        if (valueB === 'N/A') valueB = -1;
        break;
      case 'stake':
        valueA = Number(a.stake);
        valueB = Number(b.stake);
        break;
      case 'weight':
        valueA = Number(a.weight);
        valueB = Number(b.weight);
        break;
      default:
        return 0;
    }

    if (direction === 'asc') {
      return valueA > valueB ? 1 : -1;
    } else {
      return valueA < valueB ? 1 : -1;
    }
  });
};

const getEfficiencyForValidator = (validator) => {
  if (!qosData) return 'N/A';
  for (let q of qosData) {
    if (q.validator_adnl === validator.adnl_addr) {
      return Number(q.efficiency);
    }
  }
  return 'N/A';
};

const renderStats = () => {
  if (!cycleData) return;

  const cycleInfo = cycleData.cycle_info;
  const totalStake = cycleInfo.total_stake;
  const stakesUnfreezeAt = cycleInfo.utime_until + cycleData.config15.stake_held_for;

  let efficiencyStats = { high: 0, good: 0, poor: 0, na: 0 };
  let complaintsCount = 0;

  for (const v of cycleInfo.validators) {
    // Count complaints
    if (v.complaints && v.complaints.length > 0) {
      complaintsCount += v.complaints.length;
    }

    // Efficiency stats
    const efficiency = getEfficiencyForValidator(v);
    if (efficiency === 'N/A') {
      efficiencyStats.na++;
    } else if (efficiency >= 95) {
      efficiencyStats.high++;
    } else if (efficiency >= 90) {
      efficiencyStats.good++;
    } else {
      efficiencyStats.poor++;
    }
  }

  statsContainer.innerHTML = `
            <div class="stat-card">
                <h3>Validation Cycle</h3>
                <p class="value long-number">#${cycleData.cycle_id}</p>
            </div>
            <div class="stat-card">
                <h3>Validator Count</h3>
                <p class="value">${cycleInfo.validators.length} / ${cycleData.config16.max_validators}</p>
            </div>
            <div class="stat-card">
                <h3>Total Staked Amount</h3>
                <p class="value">${toMillionsShort(fromNano(totalStake))} TON</p>
            </div>
            <div class="stat-card">
                <h3>Cycle Start</h3>
                <p class="value">${timeRange(cycleInfo.utime_since)}</p>
            </div>
            <div class="stat-card">
                <h3>Cycle End</h3>
                <p class="value">${timeRange(cycleInfo.utime_until)}</p>
            </div>
            <div class="stat-card">
                <h3>Stake Unfreeze</h3>
                <p class="value">${timeRange(stakesUnfreezeAt)}</p>
            </div>
            <div class="stat-card">
                <h3>High Efficiency Nodes</h3>
                <p class="value">${efficiencyStats.high}</p>
            </div>
            <div class="stat-card">
                <h3>Total Complaints</h3>
                <p class="value">${complaintsCount}</p>
            </div>
        `;
};

const renderTable = () => {
  if (!cycleData) return;

  const data = cycleData;
  const cycleInfo = data.cycle_info;
  const totalStake = cycleInfo.total_stake;
  const totalWeight = cycleInfo.total_weight;

  const secondsSinceCycleStart = Math.floor(Date.now() / 1000) - cycleInfo.utime_since;
  const isTop100EfficiencyReady = secondsSinceCycleStart > 30 * 60; // 30 min
  const isEfficiencyReady = secondsSinceCycleStart > 60 * 60; // 60 min

  // validators table - desktop version
  let s =
    '<table>' +
    '<thead>' +
    '<tr>' +
    '<th></th>' +
    "<th class=\"sortable\" onclick=\"sortTable('index')\">Index</th>" +
    '<th>Label</th>' +
    "<th class=\"sortable\" onclick=\"sortTable('efficiency')\">Efficiency</th>" +
    "<th class=\"sortable\" onclick=\"sortTable('weight')\">Weight</th>" +
    "<th class=\"sortable\" onclick=\"sortTable('stake')\">Stake</th>" +
    '<th>Geography</th>' +
    '<th>Node Version</th>' +
    '<th>MyTonCtrl Version</th>' +
    '<th>Type</th>' +
    '<th>Complaints</th>' +
    '<th>ADNL Address</th>' +
    '<th>Wallet Address</th>' +
    '<th>Details</th>' +
    '</tr>' +
    '</thead>';

  // mobile version
  let mobileHtml = '<div class="mobile-table">';

  let validators = cycleInfo.validators.concat();

  // Apply sorting
  if (currentSort.column) {
    validators = sortValidators(validators, currentSort.column, currentSort.direction);
  } else {
    // Default sorting by saved and index
    validators.sort((a, b) => {
      const isSavedA = savedAdnl.indexOf(a.adnl_addr) > -1;
      const isSavedB = savedAdnl.indexOf(b.adnl_addr) > -1;
      if (isSavedA && isSavedB) {
        return a.index > b.index ? 1 : -1;
      } else if (isSavedA && !isSavedB) {
        return -1;
      } else {
        return 1;
      }
    });
  }

  // Collect unique values for filters
  const types = new Set();
  const geos = new Set();

  for (const v of validators) {
    const label = labels[v.adnl_addr] || labels[v.wallet_address] || '';
    let walletVersion = 'N/A';
    let geolocation = 'N/A';

    if (qosData) {
      for (let q of qosData) {
        if (q.validator_adnl === v.adnl_addr) {
          geolocation = q.geoip_country_iso;
          walletVersion = q.wallet_version;
          break;
        }
      }
    }

    if (qosDataByCycleId) {
      for (let q of qosDataByCycleId) {
        if (q.adnl_addr === v.adnl_addr) {
          walletVersion = q.wallet_version;
          break;
        }
      }
    }

    types.add(formatType(walletVersion));
    geos.add(geolocation);
  }

  // Update filter options
  updateFilterOptions(types, geos);

  for (const v of validators) {
    const label = labels[v.adnl_addr] || labels[v.wallet_address] || '';

    // Apply filters
    if (
      searchText &&
      !(
        v.index == searchText ||
        v.adnl_addr.toLowerCase().indexOf(searchText.toLowerCase()) > -1 ||
        v.wallet_address.toLowerCase().indexOf(searchText.toLowerCase()) > -1 ||
        v.pubkey.toLowerCase().indexOf(searchText.toLowerCase()) > -1 ||
        label.toLowerCase().indexOf(searchText.toLowerCase()) > -1
      )
    )
      continue;

    let efficiency = 'N/A';
    let efficiencyValue = 0;
    let efficiencyClass = '';
    let validatorVersion = 'N/A';
    let mytonctrlVersion = 'N/A';
    let walletVersion = 'N/A';
    let geolocation = 'N/A';

    if (qosData) {
      for (let q of qosData) {
        if (q.validator_adnl === v.adnl_addr) {
          if ((v.index < 100 && isTop100EfficiencyReady) || isEfficiencyReady) {
            const n = Number(q.efficiency);
            efficiencyValue = n;
            efficiency = n.toFixed(2) + '%';
            if (n >= 95) efficiencyClass = 'green';
            else if (n >= 90) efficiencyClass = 'yellow';
            else efficiencyClass = 'red';
          }
          validatorVersion = formatCommit(q.version_ton_commit);
          mytonctrlVersion = formatCommit(q.version_mytonctrl_commit);
          geolocation = q.geoip_country_iso;
          walletVersion = q.wallet_version;
          break;
        }
      }
    }

    if (qosDataByCycleId) {
      for (let q of qosDataByCycleId) {
        if (q.adnl_addr === v.adnl_addr) {
          walletVersion = q.wallet_version;
          break;
        }
      }
    }

    // Apply efficiency filter
    if (currentFilters.efficiency) {
      if (currentFilters.efficiency === 'high' && efficiencyValue < 95) continue;
      if (currentFilters.efficiency === 'good' && (efficiencyValue < 90 || efficiencyValue >= 95)) continue;
      if (currentFilters.efficiency === 'poor' && efficiencyValue >= 90) continue;
    }

    // Apply type filter
    if (currentFilters.type && formatType(walletVersion) !== currentFilters.type) continue;

    // Apply geo filter
    if (currentFilters.geo && geolocation !== currentFilters.geo) continue;

    // Apply saved filter
    if (currentFilters.saved === 'saved' && savedAdnl.indexOf(v.adnl_addr) === -1) continue;

    let starClass = savedAdnl.indexOf(v.adnl_addr) > -1 ? 'yellow' : 'grey';
    let rowClass = '';
    if (efficiencyClass === 'red') rowClass = 'tr-red';
    else if (efficiencyClass === 'green') rowClass = 'tr-green';

    const complaintsCount = v.complaints ? v.complaints.length : 0;
    const complaintsDisplay = complaintsCount > 0 ? `<span class="complaints-indicator">${complaintsCount}</span>` : '';

    const countryFlag = getCountryFlag(geolocation);

    // Desktop table row
    s += `<tr class="${rowClass}">`;
    s += `<td class="start ${starClass}" onclick="saveAdnl('${v.adnl_addr}')">★</td>`;
    s += `<td>${v.index}</td>`;
    s += `<td><span class="badge badge-label">${label || '-'}</span></td>`;
    s += `<td class="${efficiencyClass}">${efficiency}</td>`;
            s += `<td class="mono">${toPercent(v.stake / totalStake)}</td>`;
            s += `<td class="mono">${toMillions(fromNano(v.stake))}&nbsp;TON</td>`;
    s += `<td><span class="country-flag">${countryFlag}</span>${geolocation}</td>`;
    s += `<td class="mono">${validatorVersion}</td>`;
    s += `<td class="mono">${mytonctrlVersion}</td>`;
    s += `<td><span class="badge badge-info">${formatType(walletVersion)}</span></td>`;
    s += `<td>${complaintsDisplay}</td>`;
    s += `<td class="mono">${v.adnl_addr}</td>`;
    s += `<td class="mono">${makeAddressUrl(v.wallet_address)}</td>`;
    s += `<td><button class="detail-btn" onclick="showValidatorDetail('${v.adnl_addr}')">View Details</button></td>`;
    s += '</tr>';

    // Mobile card
            mobileHtml += `
                <div class="mobile-card ${rowClass}">
                    <div class="mobile-card-header">
                        <div class="mobile-card-title">
                            <span class="start ${starClass}" onclick="saveAdnl('${v.adnl_addr}')" style="margin-right: 8px;">★</span>
                            ${label || `Validator #${v.index}`}
                        </div>
                        <div class="mobile-card-index">#${v.index}</div>
                    </div>
                    <div class="mobile-card-content">
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Efficiency:</span>
                            <span class="mobile-card-value ${efficiencyClass}">${efficiency}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Weight:</span>
                            <span class="mobile-card-value mono">${toPercent(v.stake / totalStake)}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Stake:</span>
                            <span class="mobile-card-value mono">${toMillions(fromNano(v.stake))} TON</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Geography:</span>
                            <span class="mobile-card-value">${countryFlag} ${geolocation}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Type:</span>
                            <span class="mobile-card-value">${formatType(walletVersion)}</span>
                        </div>
                        ${
                          complaintsCount > 0
                            ? `
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Complaints:</span>
                            <span class="mobile-card-value">${complaintsDisplay}</span>
                        </div>
                        `
                            : ''
                        }
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Wallet Address:</span>
                            <span class="mobile-card-value mono">${makeAddressUrl(v.wallet_address)}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">ADNL:</span>
                            <span class="mobile-card-value mono">${v.adnl_addr}</span>
                        </div>
                    </div>
                </div>
            `;

    if (v.complaints && v.complaints.length > 0) {
      console.log('COMPLAINTS', v.complaints);
    }
  }

  s += '</table>';

  mobileHtml += '</div>';

  document.getElementById('tableContainer').innerHTML = s + mobileHtml;

  // Update sort indicators
  updateSortIndicators();
};

const updateFilterOptions = (types, geos) => {
  const typeFilter = document.getElementById('typeFilter');
  const geoFilter = document.getElementById('geoFilter');

  // Update type filter
  const currentTypeValue = typeFilter.value;
  typeFilter.innerHTML = '<option value="">All Types</option>';
  [...types].sort().forEach((type) => {
    if (type && type !== 'N/A') {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeFilter.appendChild(option);
    }
  });
  typeFilter.value = currentTypeValue;

  // Update geo filter
  const currentGeoValue = geoFilter.value;
  geoFilter.innerHTML = '<option value="">All Regions</option>';
  [...geos].sort().forEach((geo) => {
    if (geo && geo !== 'N/A') {
      const option = document.createElement('option');
      option.value = geo;
      option.textContent = `${getCountryFlag(geo)} ${geo}`;
      geoFilter.appendChild(option);
    }
  });
  geoFilter.value = currentGeoValue;
};

const sortTable = (column) => {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.direction = 'asc';
  }
  renderTable();
};

const updateSortIndicators = () => {
  // Remove all sort classes
  document.querySelectorAll('th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
  });

  // Add sort class to current column
  if (currentSort.column) {
    const headers = document.querySelectorAll('th');
    const columnMap = {
      index: 1,
      efficiency: 3,
      weight: 4,
      stake: 5
    };

    const columnIndex = columnMap[currentSort.column];
    if (columnIndex && headers[columnIndex]) {
      headers[columnIndex].classList.add(`sort-${currentSort.direction}`);
    }
  }
};

// Display validator details
function showValidatorDetail(adnlAddr) {
  const validator = cycleData.cycle_info.validators.find((v) => v.adnl_addr === adnlAddr);
  if (!validator) return;

  const label = labels[validator.adnl_addr] || labels[validator.wallet_address] || '';
  const modal = document.getElementById('validatorDetailModal');
  const content = document.getElementById('validatorModalContent');

  let html = `
            <h2>Validator Details</h2>
            <div class="validator-detail-item">
                <h4>Basic Information</h4>
                <p><strong>Index:</strong> ${validator.index}</p>
                <p><strong>Label:</strong> ${label || 'No Label'}</p>
                <p><strong>Weight:</strong> ${toPercent(validator.stake / cycleData.cycle_info.total_stake)}</p>
                <p><strong>Stake Amount:</strong> ${toMillions(fromNano(validator.stake))} TON</p>
                <p><strong>Max Factor:</strong> ${validator.max_factor || 'N/A'}</p>
            </div>
            <div class="validator-detail-item">
                <h4>Address Information</h4>
                <p><strong>Wallet Address:</strong> ${makeAddressUrl(validator.wallet_address)}</p>
                <p><strong>ADNL Address:</strong> <span class="mono">${validator.adnl_addr}</span></p>
                <p><strong>Public Key:</strong> <span class="mono">${validator.pubkey}</span></p>
            </div>
        `;

  // Add complaint information
  if (validator.complaints && validator.complaints.length > 0) {
    html += `
                <div class="validator-detail-item">
                    <h4>Complaint Information</h4>
                    <p><strong>Complaint Count:</strong> ${validator.complaints.length}</p>
                    ${validator.complaints
                      .map((complaint, index) => `
                        <p><strong>Complaint #${index + 1}:</strong> ${complaint}</p>
                    `)
                      .join('')}
                </div>
            `;
  }

  content.innerHTML = html;
  modal.style.display = 'flex';
}

// Close validator details modal
function closeValidatorDetailModal() {
  document.getElementById('validatorDetailModal').style.display = 'none';
}

// 初始化應用
async function initializeApp() {
  if (GLOBAL_CTX.__validatorsState.initialized) {
    return;
  }
  GLOBAL_CTX.__validatorsState.initialized = true;
  // 並行初始化，縮短首屏時間
  await Promise.all([
    loadAvailableCycles(),
    fetchCsv(),
    getCycleData(),
  ]);
}

initializeApp();

/**
 * @param input {HTMLElement}
 * @param handler   {() => void}
 */
function onInput(input, handler) {
  input.addEventListener('change', handler);
  input.addEventListener('input', handler);
  input.addEventListener('cut', handler);
  input.addEventListener('paste', handler);
}

const searchInput = document.getElementById('searchInput');
const cycleSelector = document.getElementById('cycleSelector');
const efficiencyFilter = document.getElementById('efficiencyFilter');
const typeFilter = document.getElementById('typeFilter');
const geoFilter = document.getElementById('geoFilter');
const savedFilter = document.getElementById('savedFilter');

onInput(searchInput, () => {
  searchText = searchInput.value;
  renderTable();
});

cycleSelector.addEventListener('change', async () => {
  const selectedCycleId = cycleSelector.value || null;
  await getCycleData(selectedCycleId);
});

efficiencyFilter.addEventListener('change', () => {
  currentFilters.efficiency = efficiencyFilter.value;
  renderTable();
});

typeFilter.addEventListener('change', () => {
  currentFilters.type = typeFilter.value;
  renderTable();
});

geoFilter.addEventListener('change', () => {
  currentFilters.geo = geoFilter.value;
  renderTable();
});

savedFilter.addEventListener('change', () => {
  currentFilters.saved = savedFilter.value;
  renderTable();
});

// 點擊模態框外部關閉
document.getElementById('validatorDetailModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    closeValidatorDetailModal();
  }
});


