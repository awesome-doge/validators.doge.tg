/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { RefreshCw, Copy, CheckCircle, AlertCircle, Info, DollarSign, Users, Clock, Shield } from "lucide-react";

import { Address } from "@ton/core";
import ReactJson from "react-json-view";
import {
  controllerStateStringify,
  loadControllerState,
} from "./controller-utils";
import { loadPoolState, poolStateStringify } from "./pool-utils";

// Format helper: add thousands separators while preserving decimals
function formatWithCommas(value: any): string {
  const str = String(value);
  // Avoid formatting obvious non-numeric strings
  if (/[^0-9+\-.,]/.test(str)) {
    const maybeNum = parseFloat(str.replace(/,/g, ""));
    if (!isFinite(maybeNum)) return str;
    return maybeNum.toLocaleString("en-US");
  }
  const num = typeof value === "number" ? value : parseFloat(str.replace(/,/g, ""));
  if (!isFinite(num)) return str;
  return num.toLocaleString("en-US");
}

function addressDisplay(addr: string, isTestnet: boolean = false) {
  try {
    return Address.parse(addr).toString({
      testOnly: isTestnet,
      bounceable: true,
    });
  } catch (e) {
    return addr;
  }
}



// Metric card for macOS/iOS style numeric presentation
const MetricCard = ({
  title,
  value,
  footer,
  color = "blue",
}: {
  title: string;
  value: string | number;
  footer?: string;
  color?: "blue" | "green" | "purple" | "yellow" | "indigo" | "rose" | "emerald";
}) => {
  const textColorMap: Record<string, string> = {
    blue: "text-blue-600",
    green: "text-green-600",
    purple: "text-purple-600",
    yellow: "text-amber-600",
    indigo: "text-indigo-600",
    rose: "text-rose-600",
    emerald: "text-emerald-600",
  };
  const textColor = textColorMap[color] || textColorMap.blue;

  const valueText = typeof value === "number" ? formatWithCommas(value) : value;

  return (
    <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-4 hover:translate-y-[-2px] transition-all duration-200">
      <div className="text-[13px] font-medium text-gray-700 mb-2">{title}</div>
      <div className={`text-3xl md:text-4xl font-extrabold leading-tight ${textColor}`}>{valueText}</div>
      {footer && <div className="text-xs text-gray-500 mt-2">{footer}</div>}
    </div>
  );
};

const StatusBadge = ({ status, type = "info" }: { 
  status: string; 
  type?: "success" | "warning" | "error" | "info";
}) => {
  const colors = {
    success: "bg-green-100 text-green-800 border-green-200",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-200", 
    error: "bg-red-100 text-red-800 border-red-200",
    info: "bg-blue-100 text-blue-800 border-blue-200"
  };
  
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${colors[type]}`}>
      {status}
    </span>
  );
};

// General information line component
const InfoLine = ({ label, value, type = "text", copyable = false }: {
  label: string;
  value: any;
  type?: "text" | "amount" | "address" | "time" | "percent";
  copyable?: boolean;
}) => {
  const formatValue = () => {
    switch (type) {
      case "amount":
        return `${formatWithCommas(value)} TON`;
      case "address":
        if (!value) return "N/A";
        return `${value.substring(0, 8)}...${value.slice(-6)}`;
      case "time":
        if (!value || value === 0) return "N/A";
        return new Date(value * 1000).toLocaleDateString('en-US');
      case "percent":
        return `${(value / 1000000).toFixed(2)}%`;
      default:
        if (value === undefined || value === null || value === "") return "N/A";
        const maybeNum = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
        if (isFinite(maybeNum) && Math.abs(maybeNum) >= 1000) {
          return formatWithCommas(maybeNum);
        }
        return value;
    }
  };

  const handleCopy = () => {
    if (copyable && value) {
      navigator.clipboard.writeText(value);
    }
  };

  return (
    <div className="flex justify-between items-center text-xs py-1">
      <span className="text-gray-600">{label}</span>
      {copyable ? (
        <button
          onClick={handleCopy}
          className="font-mono text-blue-600 hover:text-blue-800 transition-colors"
          title={value}
        >
          {formatValue()}
        </button>
      ) : (
        <span className="font-mono text-gray-900">{formatValue()}</span>
      )}
    </div>
  );
};

// Controller status display component
const ControllerDisplay = ({ data }: { data: any }) => {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-2">
          <Shield size={24} className="mx-auto" />
        </div>
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-400 mb-2">
          <AlertCircle size={24} className="mx-auto" />
        </div>
        <p className="text-red-600 text-sm">{data.error}</p>
      </div>
    );
  }

  const parsedData = JSON.parse(controllerStateStringify(data));

  return (
    <div className="space-y-3">
      {/* Status Overview */}
      <div className="bg-blue-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Controller Status</span>
          <StatusBadge status={parsedData.state} type="info" />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">Approved</span>
            <span className={parsedData.approved ? "text-green-600" : "text-red-600"}>
              {parsedData.approved ? "✓" : "✗"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Halted</span>
            <span className={parsedData.halted ? "text-red-600" : "text-green-600"}>
              {parsedData.halted ? "✓" : "✗"}
            </span>
          </div>
        </div>
      </div>

      {/* Staking Information */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Staking Information</h4>
        <div className="space-y-1">
          <InfoLine label="Controller ID" value={parsedData.controller_id} />
          <InfoLine label="Stake Amount" value={parsedData.stake_amount_sent} type="amount" />
          <InfoLine label="Stake Time" value={parsedData.stake_at} type="time" />
          <InfoLine label="Stake Hold Period" value={`${formatWithCommas(parsedData.stake_held_for)} seconds`} />
        </div>
      </div>

      {/* Borrowing Information */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Borrowing Information</h4>
        <div className="bg-yellow-50 rounded-lg p-3 space-y-1">
                      <InfoLine label="Borrowed Amount" value={parsedData.borrowed_amount} type="amount" />
            <InfoLine label="Borrowing Time" value={parsedData.borrowing_time} type="time" />
            <InfoLine label="Borrowing Interest" value={parsedData.borrowing_interest} type="percent" />
            <InfoLine label="Allowed Borrow Start Time" value={`${formatWithCommas(parsedData.allowed_borrow_start_prior_elections_end)} seconds before elections end`} />
          
          {/* Calculate Expected Interest */}
          {parsedData.borrowed_amount && parsedData.borrowing_interest > 0 && (
            <div className="flex justify-between items-center text-xs py-1 border-t border-yellow-200 pt-2 mt-2">
              <span className="text-gray-600">Expected Interest</span>
              <span className="font-mono text-green-600 font-medium">
                {formatWithCommas((parseFloat(parsedData.borrowed_amount) * (parsedData.borrowing_interest / 1000000)).toFixed(4))} TON
              </span>
            </div>
          )}
        </div>
      </div>

              {/* Profit Distribution */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Profit Distribution</h4>
        <div className="space-y-1">
                      <InfoLine label="Approver Set Profit Share" value={parsedData.approver_set_profit_share} type="percent" />
          <InfoLine label="Acceptable Profit Share" value={parsedData.acceptable_profit_share} type="percent" />
          <InfoLine label="Additional Profit Allocation" value={parsedData.additional_profit_allocation} type="amount" />
        </div>
      </div>

              {/* Governance Address */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Governance Addresses</h4>
        <div className="space-y-1">
          <InfoLine label="Validator" value={parsedData.validator} type="address" copyable />
          <InfoLine label="Pool" value={parsedData.pool} type="address" copyable />
          <InfoLine label="Governor" value={parsedData.governor} type="address" copyable />
          <InfoLine label="Approver" value={parsedData.approver} type="address" copyable />
          <InfoLine label="Halter" value={parsedData.halter} type="address" copyable />
          {parsedData.sudoer && (
            <InfoLine label="Super User" value={parsedData.sudoer} type="address" copyable />
          )}
        </div>
      </div>

      {/* Validator Set Information */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Validator Set</h4>
        <div className="space-y-1">
          <InfoLine label="Change Count" value={parsedData.validator_set_changes_count} />
          <InfoLine label="Change Time" value={parsedData.validator_set_change_time} type="time" />
        </div>
      </div>
    </div>
  );
};

// Pool status display component  
const PoolDisplay = ({ data }: { data: any }) => {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-2">
          <Users size={24} className="mx-auto" />
        </div>
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-400 mb-2">
          <AlertCircle size={24} className="mx-auto" />
        </div>
        <p className="text-red-600 text-sm">{data.error}</p>
      </div>
    );
  }

  const parsedData = JSON.parse(poolStateStringify(data));

  return (
    <div className="space-y-3">
      {/* Status Overview */}
      <div className="bg-green-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Pool Status</span>
          <StatusBadge 
            status={parsedData.state} 
            type={parsedData.state === "NORMAL" ? "success" : "warning"}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">Halted</span>
            <span className={parsedData.halted ? "text-red-600" : "text-green-600"}>
              {parsedData.halted ? "✓" : "✗"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Deposits Open</span>
            <span className={parsedData.deposit_withdrawal_parameters.deposits_open ? "text-green-600" : "text-red-600"}>
              {parsedData.deposit_withdrawal_parameters.deposits_open ? "✓" : "✗"}
            </span>
          </div>
        </div>
      </div>

      {/* Fund Information */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Fund Information</h4>
        <div className="space-y-1">
          <InfoLine label="Total Balance" value={parsedData.total_balance} type="amount" />
          <InfoLine label="Interest Rate" value={parsedData.interest_rate} type="percent" />
          <InfoLine label="Governance Fee Share" value={parsedData.governance_fee_share} type="percent" />
          <InfoLine label="Accrued Governance Fee" value={parsedData.accrued_governance_fee} type="amount" />
        </div>
      </div>

      {/* Token Information */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Token Information</h4>
        <div className="space-y-1">
                      <InfoLine label="Jetton Minter" value={parsedData.minters_data.jetton_minter} type="address" copyable />
          <InfoLine label="Supply" value={`${parsedData.minters_data.supply} Token`} />
          <InfoLine label="Deposit Requests" value={parsedData.minters_data.requested_for_deposit} type="amount" />
          <InfoLine label="Withdrawal Requests" value={parsedData.minters_data.requested_for_withdraw} type="amount" />
        </div>
      </div>

      {/* Current Round */}
      <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Current Round #{formatWithCommas(parsedData.round_data.current_round_borrowers.round_id)}</h4>
        <div className="bg-blue-50 rounded-lg p-3 mb-3">
        <div className="space-y-1">
          <InfoLine label="Active Borrowers" value={parsedData.round_data.current_round_borrowers.active_borrowers} />
          <InfoLine label="Borrowed" value={parsedData.round_data.current_round_borrowers.borrowed} type="amount" />
          <InfoLine label="Expected Return" value={parsedData.round_data.current_round_borrowers.expected} type="amount" />
          <InfoLine label="Returned" value={parsedData.round_data.current_round_borrowers.returned} type="amount" />
                      <div className="flex justify-between items-center text-xs py-1">
              <span className="text-gray-600">Current Profit</span>
              <span className={`font-mono font-medium ${parseFloat(parsedData.round_data.current_round_borrowers.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatWithCommas(parsedData.round_data.current_round_borrowers.profit)} TON
              </span>
            </div>
          </div>
        </div>

        {/* Borrower List */}
        {Object.keys(parsedData.round_data.current_round_borrowers.borrowers || {}).length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-700 mb-2">Current Borrowers</div>
            <div className="space-y-1">
              {Object.entries(parsedData.round_data.current_round_borrowers.borrowers).slice(0, 3).map(([address, borrowData]: [string, any]) => (
                <div key={address} className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded">
                  <button
                    onClick={() => navigator.clipboard.writeText(address)}
                    className="font-mono text-blue-600 hover:text-blue-800 transition-colors truncate max-w-20"
                    title={address}
                  >
                    {address.substring(0, 8)}...{address.slice(-6)}
                  </button>
                  <div className="text-right">
                    <div className="text-gray-700">{formatWithCommas(borrowData.credit)} TON</div>
                    <div className="text-green-600 text-xs">+{formatWithCommas(borrowData.interest)} TON</div>
                  </div>
                </div>
              ))}
              {Object.keys(parsedData.round_data.current_round_borrowers.borrowers).length > 3 && (
                <div className="text-center text-xs text-gray-500 pt-1">
                  And {formatWithCommas(Object.keys(parsedData.round_data.current_round_borrowers.borrowers).length - 3)} more borrowers
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Previous Round */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Previous Round #{formatWithCommas(parsedData.round_data.prev_round_borrowers.round_id)}</h4>
        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
          <InfoLine label="Borrower Count" value={parsedData.round_data.prev_round_borrowers.active_borrowers} />
          <InfoLine label="Borrowed Amount" value={parsedData.round_data.prev_round_borrowers.borrowed} type="amount" />
          <InfoLine label="Expected Return" value={parsedData.round_data.prev_round_borrowers.expected} type="amount" />
          <InfoLine label="Returned Amount" value={parsedData.round_data.prev_round_borrowers.returned} type="amount" />
                      <div className="flex justify-between items-center text-xs py-1">
              <span className="text-gray-600">Actual Profit</span>
            <span className={`font-mono font-medium ${parseFloat(parsedData.round_data.prev_round_borrowers.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatWithCommas(parsedData.round_data.prev_round_borrowers.profit)} TON
            </span>
          </div>
        </div>
      </div>

      {/* Staking Parameters */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Staking Parameters</h4>
        <div className="space-y-1">
          <InfoLine label="Minimum Loan" value={parsedData.loan_params_per_validator.min_loan} type="amount" />
          <InfoLine label="Maximum Loan" value={parsedData.loan_params_per_validator.max_loan} type="amount" />
          <InfoLine label="Imbalance Tolerance" value={`${parsedData.disbalance_tolerance}%`} />
          <InfoLine label="Loan Start Time" value={`${parsedData.credit_start_prior_elections_end} seconds before elections end`} />
        </div>
      </div>

      {/* Governance Addresses */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Governance Addresses</h4>
        <div className="space-y-1">
          <InfoLine label="Governor" value={parsedData.role_data.governor} type="address" copyable />
          <InfoLine label="Approver" value={parsedData.role_data.approver} type="address" copyable />
          <InfoLine label="Halter" value={parsedData.role_data.halter} type="address" copyable />
          <InfoLine label="Treasury" value={parsedData.role_data.treasury} type="address" copyable />
          <InfoLine label="Interest Manager" value={parsedData.role_data.interest_manager} type="address" copyable />
          {parsedData.role_data.sudoer && (
            <InfoLine label="Super User" value={parsedData.role_data.sudoer} type="address" copyable />
          )}
        </div>
      </div>
    </div>
  );
};



function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const isTestnet = urlParams.get("testnet") !== null;

  // Default addresses
  const [controllerAddress, setControllerAddress] = useState("Ef9GOR1wqJFPVpbHOxObSATkdbfTizRTmDi6DdjJFYaRKhoK"); // KTON Validator Controller

  const [poolAddress, setPoolAddress] = useState("EQDsW2P6nuP1zopKoNiCYj2xhqDan0cBuULQ8MH4o7dBt_7a"); // pKTON Pool

  const [controllerData, setControllerData] = useState<any>({});

  const [poolData, setPoolData] = useState<any>({});
  const [poolControllers, setPoolControllers] = useState<any[]>([]); // Pool-related Controllers
  const [isControllerLoading, setIsControllerLoading] = useState(false);

  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [isPoolControllersLoading, setIsPoolControllersLoading] = useState(false);

  // Delay function
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // API call function with retry mechanism
  const apiCallWithRetry = async (apiCall: () => Promise<any>, maxRetries: number = 3, baseDelay: number = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiCall();
        return result;
      } catch (error: any) {
        console.log(`API call error (attempt ${attempt}/${maxRetries}):`, error);
        
        // Check if it's a rate limit error
        const isRateLimited = 
          (error.message && error.message.includes('429')) ||
          (error.toString && error.toString().includes('429')) ||
          (error.response && error.response.status === 429) ||
          // Check fetch response status
          (error.status === 429) ||
          // Check error message keywords
          (error.message && (
            error.message.includes('Too Many Requests') ||
            error.message.includes('rate limit') ||
            error.message.includes('429')
          ));
        
        if (isRateLimited && attempt < maxRetries) {
          const delayTime = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`API rate limited, ${attempt}th retry, waiting ${delayTime}ms...`);
          await delay(delayTime);
          continue;
        }
        
        if (attempt === maxRetries) {
          console.error(`API call failed, reached maximum retry count ${maxRetries}`, error);
          throw error;
        }
      }
    }
  };

  // Batch API call function (serial execution to avoid rate limiting)
  const batchApiCalls = async (
    calls: Array<() => Promise<any>>, 
    delayBetweenCalls: number = 1500,
    onProgress?: (completed: number, total: number, currentResult?: any) => void
  ) => {
    const results: any[] = [];
    
    for (let i = 0; i < calls.length; i++) {
              try {
          console.log(`Executing API call ${i + 1}/${calls.length}`);
        const result = await apiCallWithRetry(calls[i]);
        results.push(result);
        
                  // Progress callback with current result
        if (onProgress) {
          onProgress(i + 1, calls.length, result);
        }
        
        // Delay next call (except for the last one)
        if (i < calls.length - 1) {
          await delay(delayBetweenCalls);
        }
      } catch (error) {
        console.error(`API call ${i + 1} failed:`, error);
        // Return error result instead of throwing exception
        const errorResult = { error: "Failed to fetch data" };
        results.push(errorResult);
        
        // Call progress callback even if failed
        if (onProgress) {
          onProgress(i + 1, calls.length, errorResult);
        }
        
        // Delay next call (except for the last one)
        if (i < calls.length - 1) {
          await delay(delayBetweenCalls);
        }
      }
    }
    
    return results;
  };

  // Function to get Pool-related Controllers
  const loadPoolControllers = async (poolData: any) => {
    if (!poolData || !poolData.round_data) return;
    
    setIsPoolControllersLoading(true);
    
    try {
      // Get borrower addresses from current round
      const currentBorrowers = poolData.round_data.current_round_borrowers?.borrowers || {};
      const prevBorrowers = poolData.round_data.prev_round_borrowers?.borrowers || {};
      
      // Merge all borrower addresses (deduplicate)
      const allBorrowerAddresses = Array.from(new Set([
        ...Object.keys(currentBorrowers),
        ...Object.keys(prevBorrowers)
      ]));
      
      console.log(`Starting to load ${allBorrowerAddresses.length} Controllers (serial mode, estimated ${Math.ceil(allBorrowerAddresses.length * 1.5)} seconds)`);
      
      // Create API call function array
      const apiCalls = allBorrowerAddresses.map(address => 
        () => loadControllerState(address, isTestnet)
      );
      
      // For tracking real-time results
      const currentControllers: any[] = [];
      
      // Use batch API calls (serial execution)
      const results = await batchApiCalls(
        apiCalls,
        1500, // 1.5 second interval between calls
        (completed, total, currentResult) => {
          console.log(`Loading progress: ${completed}/${total} Controllers`);
          
          // Add new result to current controller list
          if (currentResult && completed <= allBorrowerAddresses.length) {
            const address = allBorrowerAddresses[completed - 1];
            currentControllers.push({
              address,
              data: currentResult,
              currentBorrow: currentBorrowers[address],
              prevBorrow: prevBorrowers[address]
            });
          }
          
          // Update UI in real-time with loaded results
          setPoolControllers([...currentControllers]);
        }
      );
      
      // Combine final results
      const controllers = allBorrowerAddresses.map((address, index) => ({
        address,
        data: results[index] || { error: "Failed to fetch controller data" },
        currentBorrow: currentBorrowers[address],
        prevBorrow: prevBorrowers[address]
      }));
      
      setPoolControllers(controllers);
      console.log('All Controllers loaded');
      
    } catch (error) {
      console.error('Error loading pool controllers:', error);
      setPoolControllers([]);
    } finally {
      setIsPoolControllersLoading(false);
    }
  };

  // Function definitions
  const handleControllerSubmit = async () => {
    setIsControllerLoading(true);
    try {
      const data = await apiCallWithRetry(() => loadControllerState(controllerAddress, isTestnet));
      setControllerData(data);
    } catch (error) {
      setControllerData({ error: "Failed to fetch data" });
    } finally {
      setIsControllerLoading(false);
    }
  };



  const handlePoolSubmit = async () => {
    setIsPoolLoading(true);
    try {
      console.log('Loading Pool data...');
      const data = await apiCallWithRetry(() => loadPoolState(poolAddress, isTestnet));
      setPoolData(data);
      
      console.log('Pool data loaded, starting to load related Controllers...');
      // Automatically load Pool-related Controllers (with delay to avoid too fast consecutive calls)
      await delay(800);
      await loadPoolControllers(data);
    } catch (error) {
      setPoolData({ error: "Failed to fetch data" });
      setPoolControllers([]);
    } finally {
      setIsPoolLoading(false);
    }
  };

  // Auto-load initial data
  React.useEffect(() => {
    if (controllerAddress) {
      handleControllerSubmit();
    }
    if (poolAddress) {
      handlePoolSubmit();
    }

  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="mx-auto space-y-6">
        {/* Unified Query Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Controller Query */}
            <div className="bg-white rounded-xl p-4 shadow-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="text-blue-600" size={20} />
                <h3 className="text-lg font-semibold text-gray-800">Controller Contract</h3>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={controllerAddress}
                  onChange={(e) => setControllerAddress(e.target.value)}
                  placeholder="Controller Address"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleControllerSubmit}
                  disabled={isControllerLoading}
                  className={`px-4 py-2 text-sm bg-blue-600 text-white rounded-lg transition-all ${
                    isControllerLoading ? "opacity-50" : "hover:bg-blue-700"
                  }`}
                >
                  {isControllerLoading ? "Querying..." : "Query"}
                </button>
            </div>
          </div>

          {/* Pool Query */}
          <div className="bg-white rounded-xl p-4 shadow-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Users className="text-green-600" size={20} />
              <h3 className="text-lg font-semibold text-gray-800">Pool Contract</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={poolAddress}
                onChange={(e) => setPoolAddress(e.target.value)}
                placeholder="Pool Address"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handlePoolSubmit}
                disabled={isPoolLoading}
                className={`px-4 py-2 text-sm bg-green-600 text-white rounded-lg transition-all ${
                  isPoolLoading ? "opacity-50" : "hover:bg-green-700"
                }`}
              >
                {isPoolLoading ? "Querying..." : "Query"}
              </button>
            </div>
          </div>


        </div>

        {/* Main Data Display Panel with macOS/iOS style metrics */}
        <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-[0_12px_48px_rgba(0,0,0,0.08)]">
          <div className="p-6">
            {/* Top metrics row */}
            {poolData && Object.keys(poolData).length > 0 && !poolData.error ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <MetricCard
                  title="Pool Total Balance"
                  value={`${formatWithCommas(JSON.parse(poolStateStringify(poolData)).total_balance)} TON`}
                  color="green"
                />
                <MetricCard
                  title="Current Borrowed"
                  value={`${formatWithCommas(JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.borrowed)} TON`}
                  color="indigo"
                />
                <MetricCard
                  title="Expected Return"
                  value={`${formatWithCommas(JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.expected)} TON`}
                  color="purple"
                />
                <MetricCard
                  title="Active Borrowers"
                  value={formatWithCommas(JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.active_borrowers)}
                  color="emerald"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <MetricCard title="Pool Total Balance" value="–" color="green" />
                <MetricCard title="Current Borrowed" value="–" color="indigo" />
                <MetricCard title="Expected Return" value="–" color="purple" />
                <MetricCard title="Active Borrowers" value="–" color="emerald" />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Controller Data */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="text-blue-600" size={18} />
                  <h3 className="text-base font-semibold text-gray-800">Controller Data</h3>
                </div>
                <ControllerDisplay data={controllerData} />
              </div>

              {/* Pool Data */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="text-green-600" size={18} />
                  <h3 className="text-base font-semibold text-gray-800">Pool Data</h3>
                </div>
                <PoolDisplay data={poolData} />
              </div>
            </div>
          </div>
        </div>

        {/* Pool Related Controllers Display Panel */}
        {poolControllers.length > 0 && (
          <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-[0_12px_48px_rgba(0,0,0,0.08)]">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <Users className="text-green-600" size={24} />
                <h2 className="text-xl font-semibold text-gray-800">Pool Related Controllers</h2>
                {isPoolControllersLoading && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {poolControllers.map((controller, index) => (
                  <div key={controller.address} className="rounded-xl border border-white/60 bg-white/80 backdrop-blur-xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="text-blue-600" size={16} />
                      <h4 className="text-sm font-semibold text-gray-800">Controller #{index + 1}</h4>
                    </div>
                    
                    {/* Controller Address */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-600 mb-1">Address</div>
                      <button
                        onClick={() => navigator.clipboard.writeText(controller.address)}
                        className="font-mono text-xs text-blue-600 hover:text-blue-800 transition-colors break-all"
                        title={controller.address}
                      >
                        {controller.address.substring(0, 12)}...{controller.address.slice(-8)}
                      </button>
                    </div>

                    {/* Borrowing Information */}
                    {(controller.currentBorrow || controller.prevBorrow) && (
                      <div className="mb-3 p-3 rounded-lg bg-gradient-to-br from-yellow-50 to-amber-50 border border-amber-100">
                        <div className="text-xs font-semibold text-gray-800 mb-2">Borrowing Status</div>
                        {controller.currentBorrow && (
                          <div className="space-y-1">
                                              <div className="text-xs text-green-700">
                    <span className="font-medium">Current:</span>
                              <div>Loan: {formatWithCommas(controller.currentBorrow.credit)} TON</div>
                              <div>Interest: {formatWithCommas(controller.currentBorrow.interest)} TON</div>
                  </div>
                          </div>
                        )}
                        {controller.prevBorrow && (
                          <div className="space-y-1 mt-2">
                                              <div className="text-xs text-gray-600">
                    <span className="font-medium">Previous:</span>
                              <div>Loan: {formatWithCommas(controller.prevBorrow.credit)} TON</div>
                              <div>Interest: {formatWithCommas(controller.prevBorrow.interest)} TON</div>
                  </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Controller Detailed Data */}
                    <div className="text-xs">
                      <ControllerDisplay data={controller.data} />
                    </div>
                  </div>
                ))}
              </div>
              
              {isPoolControllersLoading && poolControllers.length === 0 && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading Pool Related Controllers...</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Serial loading, 1.5 second intervals to avoid API limits
                  </p>
                </div>
              )}
              
              {isPoolControllersLoading && poolControllers.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm font-medium text-blue-800">Continuing to load...</span>
                  </div>
                  <p className="text-xs text-blue-600">
                    Some results loaded, remaining data will be updated sequentially
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Data Overview Panel */}
        <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-[0_12px_48px_rgba(0,0,0,0.08)]">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <DollarSign className="text-orange-600" size={24} />
              <h2 className="text-xl font-semibold text-gray-800">LST Ecosystem Overview</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* Pool Total */}
              {poolData && Object.keys(poolData).length > 0 && !poolData.error && (
                <>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="text-green-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">Pool Total Balance</span>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                      {formatWithCommas(JSON.parse(poolStateStringify(poolData)).total_balance)} TON
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Interest Rate: {(JSON.parse(poolStateStringify(poolData)).interest_rate / 1000000 * 100).toFixed(2)}%
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="text-blue-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">Current Borrowed</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatWithCommas(JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.borrowed)} TON
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Active Borrowers: {formatWithCommas(JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.active_borrowers)}
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="text-purple-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">Expected Return</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-600">
                      {formatWithCommas(JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.expected)} TON
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Round: #{formatWithCommas(JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.round_id)}
                    </div>
                  </div>

                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="text-yellow-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">LST Supply</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {formatWithCommas(JSON.parse(poolStateStringify(poolData)).minters_data.supply)} LST
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Jetton Minter
                    </div>
                  </div>

                  {/* New: Pool Utilization Card */}
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="text-indigo-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">Fund Utilization</span>
                    </div>
                    <div className="text-2xl font-bold text-indigo-600">
                      {(parseFloat(JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.borrowed) / parseFloat(JSON.parse(poolStateStringify(poolData)).total_balance) * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Borrowed/Total Balance
                    </div>
                  </div>

                  {/* New: Actual vs Expected Return */}
                  <div className="bg-rose-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="text-rose-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">Previous Round Yield</span>
                    </div>
                    <div className="text-2xl font-bold text-rose-600">
                      {parseFloat(JSON.parse(poolStateStringify(poolData)).round_data.prev_round_borrowers.borrowed) > 0 ? 
                        (parseFloat(JSON.parse(poolStateStringify(poolData)).round_data.prev_round_borrowers.profit) / parseFloat(JSON.parse(poolStateStringify(poolData)).round_data.prev_round_borrowers.borrowed) * 100).toFixed(2) : '0.00'}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Actual Profit/Borrowed Amount
                    </div>
                  </div>

                  {/* New: Governance Fees Accumulation */}
                  <div className="bg-emerald-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="text-emerald-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">Governance Fees</span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-600">
                      {formatWithCommas(JSON.parse(poolStateStringify(poolData)).accrued_governance_fee)} TON
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Accumulated Fees ({(JSON.parse(poolStateStringify(poolData)).governance_fee_share / 1000000 * 100).toFixed(2)}%)
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* System Status Indicators - Optimized */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pool Status */}
              {poolData && Object.keys(poolData).length > 0 && !poolData.error && (
                <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-100">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Users className="text-green-600" size={16} />
                    Pool System Status
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Pool Status</span>
                      <StatusBadge 
                        status={JSON.parse(poolStateStringify(poolData)).state} 
                        type={JSON.parse(poolStateStringify(poolData)).state === "NORMAL" ? "success" : "warning"}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Deposit Status</span>
                      <StatusBadge 
                        status={JSON.parse(poolStateStringify(poolData)).deposit_withdrawal_parameters.deposits_open ? "Open" : "Closed"} 
                        type={JSON.parse(poolStateStringify(poolData)).deposit_withdrawal_parameters.deposits_open ? "success" : "error"}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Is Pool Halted</span>
                      <StatusBadge 
                        status={JSON.parse(poolStateStringify(poolData)).halted ? "Halted" : "Normal"} 
                        type={JSON.parse(poolStateStringify(poolData)).halted ? "error" : "success"}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {/* Controller Status */}
              {controllerData && Object.keys(controllerData).length > 0 && !controllerData.error && (
                <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Shield className="text-blue-600" size={16} />
                    Controller Status
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Controller Status</span>
                      <StatusBadge 
                        status={JSON.parse(controllerStateStringify(controllerData)).state} 
                        type="info"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Is Approved</span>
                      <StatusBadge 
                        status={JSON.parse(controllerStateStringify(controllerData)).approved ? "Approved" : "Not Approved"} 
                        type={JSON.parse(controllerStateStringify(controllerData)).approved ? "success" : "warning"}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Is Halted</span>
                      <StatusBadge 
                        status={JSON.parse(controllerStateStringify(controllerData)).halted ? "Halted" : "Normal"} 
                        type={JSON.parse(controllerStateStringify(controllerData)).halted ? "error" : "success"}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
