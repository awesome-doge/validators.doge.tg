/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { RefreshCw, Copy, CheckCircle, AlertCircle, Info, DollarSign, Users, Clock, Shield } from "lucide-react";
import {
  loadElectorState,
  electorStateStringify,
} from "./elector-utils-official";
import { Address } from "@ton/core";
import ReactJson from "react-json-view";
import {
  controllerStateStringify,
  loadControllerState,
} from "./controller-utils";
import { loadPoolState, poolStateStringify } from "./pool-utils";

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

// 通用信息行組件
const InfoLine = ({ label, value, type = "text", copyable = false }: {
  label: string;
  value: any;
  type?: "text" | "amount" | "address" | "time" | "percent";
  copyable?: boolean;
}) => {
  const formatValue = () => {
    switch (type) {
      case "amount":
        return `${value} TON`;
      case "address":
        if (!value) return "N/A";
        return `${value.substring(0, 8)}...${value.slice(-6)}`;
      case "time":
        if (!value || value === 0) return "N/A";
        return new Date(value * 1000).toLocaleDateString('zh-TW');
      case "percent":
        return `${(value / 1000000).toFixed(2)}%`;
      default:
        return value || "N/A";
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

// Controller 狀態展示組件
const ControllerDisplay = ({ data }: { data: any }) => {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-2">
          <Shield size={24} className="mx-auto" />
        </div>
        <p className="text-gray-500 text-sm">載入中...</p>
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
      {/* 狀態總覽 */}
      <div className="bg-blue-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">控制器狀態</span>
          <StatusBadge status={parsedData.state} type="info" />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">已批准</span>
            <span className={parsedData.approved ? "text-green-600" : "text-red-600"}>
              {parsedData.approved ? "✓" : "✗"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">已暫停</span>
            <span className={parsedData.halted ? "text-red-600" : "text-green-600"}>
              {parsedData.halted ? "✓" : "✗"}
            </span>
          </div>
        </div>
      </div>

      {/* 質押信息 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">質押信息</h4>
        <div className="space-y-1">
          <InfoLine label="控制器 ID" value={parsedData.controller_id} />
          <InfoLine label="質押金額" value={parsedData.stake_amount_sent} type="amount" />
          <InfoLine label="質押時間" value={parsedData.stake_at} type="time" />
          <InfoLine label="質押持有期" value={`${parsedData.stake_held_for}秒`} />
        </div>
      </div>

      {/* 借貸信息 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">借貸信息</h4>
        <div className="bg-yellow-50 rounded-lg p-3 space-y-1">
          <InfoLine label="借貸金額" value={parsedData.borrowed_amount} type="amount" />
          <InfoLine label="借貸時間" value={parsedData.borrowing_time} type="time" />
          <InfoLine label="借貸利率" value={parsedData.borrowing_interest} type="percent" />
          <InfoLine label="允許借貸開始時間" value={`選舉結束前 ${parsedData.allowed_borrow_start_prior_elections_end} 秒`} />
          
          {/* 計算預期收益 */}
          {parsedData.borrowed_amount && parsedData.borrowing_interest && (
            <div className="flex justify-between items-center text-xs py-1 border-t border-yellow-200 pt-2 mt-2">
              <span className="text-gray-600">預期利息</span>
              <span className="font-mono text-green-600 font-medium">
                {(parseFloat(parsedData.borrowed_amount) * parsedData.borrowing_interest / 1000000).toFixed(4)} TON
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 利潤分配 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">利潤分配</h4>
        <div className="space-y-1">
          <InfoLine label="批准者設定分成" value={parsedData.approver_set_profit_share} type="percent" />
          <InfoLine label="可接受分成" value={parsedData.acceptable_profit_share} type="percent" />
          <InfoLine label="額外利潤分配" value={parsedData.additional_profit_allocation} type="amount" />
        </div>
      </div>

      {/* 治理地址 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">治理地址</h4>
        <div className="space-y-1">
          <InfoLine label="驗證器" value={parsedData.validator} type="address" copyable />
          <InfoLine label="資金池" value={parsedData.pool} type="address" copyable />
          <InfoLine label="治理者" value={parsedData.governor} type="address" copyable />
          <InfoLine label="批准者" value={parsedData.approver} type="address" copyable />
          <InfoLine label="暫停者" value={parsedData.halter} type="address" copyable />
          {parsedData.sudoer && (
            <InfoLine label="超級用戶" value={parsedData.sudoer} type="address" copyable />
          )}
        </div>
      </div>

      {/* 驗證器集信息 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">驗證器集</h4>
        <div className="space-y-1">
          <InfoLine label="更改次數" value={parsedData.validator_set_changes_count} />
          <InfoLine label="更改時間" value={parsedData.validator_set_change_time} type="time" />
        </div>
      </div>
    </div>
  );
};

// Pool 狀態展示組件  
const PoolDisplay = ({ data }: { data: any }) => {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-2">
          <Users size={24} className="mx-auto" />
        </div>
        <p className="text-gray-500 text-sm">載入中...</p>
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
      {/* 狀態總覽 */}
      <div className="bg-green-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">資金池狀態</span>
          <StatusBadge 
            status={parsedData.state} 
            type={parsedData.state === "NORMAL" ? "success" : "warning"}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">已暫停</span>
            <span className={parsedData.halted ? "text-red-600" : "text-green-600"}>
              {parsedData.halted ? "✓" : "✗"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">存款開放</span>
            <span className={parsedData.deposit_withdrawal_parameters.deposits_open ? "text-green-600" : "text-red-600"}>
              {parsedData.deposit_withdrawal_parameters.deposits_open ? "✓" : "✗"}
            </span>
          </div>
        </div>
      </div>

      {/* 資金信息 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">資金信息</h4>
        <div className="space-y-1">
          <InfoLine label="總餘額" value={parsedData.total_balance} type="amount" />
          <InfoLine label="利率" value={parsedData.interest_rate} type="percent" />
          <InfoLine label="治理費用份額" value={parsedData.governance_fee_share} type="percent" />
          <InfoLine label="累計治理費用" value={parsedData.accrued_governance_fee} type="amount" />
        </div>
      </div>

      {/* 代幣信息 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">代幣信息</h4>
        <div className="space-y-1">
          <InfoLine label="Jetton 鑄造器" value={parsedData.minters_data.jetton_minter} type="address" copyable />
          <InfoLine label="供應量" value={`${parsedData.minters_data.supply} Token`} />
          <InfoLine label="存款請求" value={parsedData.minters_data.requested_for_deposit} type="amount" />
          <InfoLine label="提款請求" value={parsedData.minters_data.requested_for_withdraw} type="amount" />
        </div>
      </div>

      {/* 當前輪次 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">當前輪次 #{parsedData.round_data.current_round_borrowers.round_id}</h4>
        <div className="bg-blue-50 rounded-lg p-3 mb-3">
        <div className="space-y-1">
          <InfoLine label="活躍借款人" value={parsedData.round_data.current_round_borrowers.active_borrowers} />
          <InfoLine label="已借出" value={parsedData.round_data.current_round_borrowers.borrowed} type="amount" />
          <InfoLine label="預期收益" value={parsedData.round_data.current_round_borrowers.expected} type="amount" />
          <InfoLine label="已返還" value={parsedData.round_data.current_round_borrowers.returned} type="amount" />
          <div className="flex justify-between items-center text-xs py-1">
            <span className="text-gray-600">當前利潤</span>
              <span className={`font-mono font-medium ${parseFloat(parsedData.round_data.current_round_borrowers.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {parsedData.round_data.current_round_borrowers.profit} TON
              </span>
            </div>
          </div>
        </div>

        {/* 借款人列表 */}
        {Object.keys(parsedData.round_data.current_round_borrowers.borrowers || {}).length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-700 mb-2">當前借款人</div>
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
                    <div className="text-gray-700">{borrowData.credit} TON</div>
                    <div className="text-green-600 text-xs">+{borrowData.interest} TON</div>
                  </div>
                </div>
              ))}
              {Object.keys(parsedData.round_data.current_round_borrowers.borrowers).length > 3 && (
                <div className="text-center text-xs text-gray-500 pt-1">
                  還有 {Object.keys(parsedData.round_data.current_round_borrowers.borrowers).length - 3} 個借款人
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 上一輪次 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">上一輪次 #{parsedData.round_data.prev_round_borrowers.round_id}</h4>
        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
          <InfoLine label="借款人數" value={parsedData.round_data.prev_round_borrowers.active_borrowers} />
          <InfoLine label="借出金額" value={parsedData.round_data.prev_round_borrowers.borrowed} type="amount" />
          <InfoLine label="預期收益" value={parsedData.round_data.prev_round_borrowers.expected} type="amount" />
          <InfoLine label="已返還" value={parsedData.round_data.prev_round_borrowers.returned} type="amount" />
          <div className="flex justify-between items-center text-xs py-1">
            <span className="text-gray-600">實際利潤</span>
            <span className={`font-mono font-medium ${parseFloat(parsedData.round_data.prev_round_borrowers.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {parsedData.round_data.prev_round_borrowers.profit} TON
            </span>
          </div>
        </div>
      </div>

      {/* 質押參數 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">質押參數</h4>
        <div className="space-y-1">
          <InfoLine label="最小貸款" value={parsedData.loan_params_per_validator.min_loan} type="amount" />
          <InfoLine label="最大貸款" value={parsedData.loan_params_per_validator.max_loan} type="amount" />
          <InfoLine label="不平衡容忍度" value={`${parsedData.disbalance_tolerance}%`} />
          <InfoLine label="貸款開始時間" value={`提前 ${parsedData.credit_start_prior_elections_end} 秒`} />
        </div>
      </div>

      {/* 治理地址 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">治理地址</h4>
        <div className="space-y-1">
          <InfoLine label="治理者" value={parsedData.role_data.governor} type="address" copyable />
          <InfoLine label="批准者" value={parsedData.role_data.approver} type="address" copyable />
          <InfoLine label="暫停者" value={parsedData.role_data.halter} type="address" copyable />
          <InfoLine label="財務" value={parsedData.role_data.treasury} type="address" copyable />
          <InfoLine label="利率管理者" value={parsedData.role_data.interest_manager} type="address" copyable />
          {parsedData.role_data.sudoer && (
            <InfoLine label="超級用戶" value={parsedData.role_data.sudoer} type="address" copyable />
          )}
        </div>
      </div>
    </div>
  );
};

// Elector 狀態展示組件
const ElectorDisplay = ({ data }: { data: any }) => {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-2">
          <Clock size={24} className="mx-auto" />
        </div>
        <p className="text-gray-500 text-sm">載入中...</p>
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

  const parsedData = JSON.parse(electorStateStringify(data));

  return (
    <div className="space-y-3">
      {/* 選舉器基本信息 */}
      <div className="bg-purple-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">選舉器狀態</span>
        </div>
        <div className="space-y-1">
          <InfoLine label="活躍 ID" value={parsedData.active_id} />
          <InfoLine label="餘額" value={parsedData.grams} type="amount" />
          <InfoLine label="活躍哈希" value={parsedData.active_hash} type="address" copyable />
        </div>
      </div>

      {/* 當前選舉 */}
      {parsedData.elect ? (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">當前選舉</h4>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-2 text-xs mb-2">
              <div className="flex justify-between">
                <span className="text-gray-600">已失敗</span>
                <span className={parsedData.elect.failed ? "text-red-600" : "text-green-600"}>
                  {parsedData.elect.failed ? "✓" : "✗"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">已完成</span>
                <span className={parsedData.elect.finished ? "text-green-600" : "text-blue-600"}>
                  {parsedData.elect.finished ? "✓" : "✗"}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <InfoLine label="選舉時間" value={parsedData.elect.elect_at} type="time" />
              <InfoLine label="結束時間" value={parsedData.elect.elect_close} type="time" />
              <InfoLine label="最小質押" value={parsedData.elect.min_stake} type="amount" />
              <InfoLine label="總質押" value={parsedData.elect.total_stake} type="amount" />
              <InfoLine label="參與者數量" value={Object.keys(parsedData.elect.members || {}).length} />
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <div className="text-gray-400 mb-2">
            <Clock size={20} className="mx-auto" />
          </div>
          <p className="text-gray-500 text-xs">當前沒有進行中的選舉</p>
        </div>
      )}

      {/* 統計信息 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">統計信息</h4>
        <div className="space-y-1">
          <InfoLine label="信用記錄數" value={Object.keys(parsedData.credits || {}).length} />
          <InfoLine label="歷史選舉數" value={Object.keys(parsedData.past_elections || {}).length} />
        </div>
      </div>

      {/* 選舉參與者 */}
      {parsedData.elect && Object.keys(parsedData.elect.members || {}).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">參與者 (前3名)</h4>
          <div className="space-y-1">
            {Object.entries(parsedData.elect.members).slice(0, 3).map(([pubkey, participant]: [string, any]) => (
              <div key={pubkey} className="flex justify-between items-center text-xs">
                <button
                  onClick={() => navigator.clipboard.writeText(pubkey)}
                  className="font-mono text-blue-600 hover:text-blue-800 transition-colors truncate max-w-24"
                  title={pubkey}
                >
                  {pubkey.substring(0, 6)}...{pubkey.slice(-4)}
                </button>
                <span className="font-mono text-gray-700">{participant.stake} TON</span>
              </div>
            ))}
            {Object.keys(parsedData.elect.members).length > 3 && (
              <div className="text-center text-xs text-gray-500 pt-1">
                還有 {Object.keys(parsedData.elect.members).length - 3} 個參與者
              </div>
            )}
          </div>
        </div>
      )}

      {/* 信用記錄 */}
      {Object.keys(parsedData.credits || {}).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">信用記錄 (前3筆)</h4>
          <div className="space-y-1">
            {Object.entries(parsedData.credits).slice(0, 3).map(([address, amount]: [string, any]) => (
              <div key={address} className="flex justify-between items-center text-xs">
                <button
                  onClick={() => navigator.clipboard.writeText(address)}
                  className="font-mono text-blue-600 hover:text-blue-800 transition-colors truncate max-w-24"
                  title={address}
                >
                  {address.substring(0, 6)}...{address.slice(-4)}
                </button>
                <span className="font-mono text-gray-700">{amount} TON</span>
              </div>
            ))}
            {Object.keys(parsedData.credits).length > 3 && (
              <div className="text-center text-xs text-gray-500 pt-1">
                還有 {Object.keys(parsedData.credits).length - 3} 筆記錄
              </div>
            )}
          </div>
        </div>
      )}

      {/* 歷史選舉 */}
      {Object.keys(parsedData.past_elections || {}).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">最近選舉 (前2次)</h4>
          <div className="space-y-1">
            {Object.entries(parsedData.past_elections).slice(-2).reverse().map(([electionId, election]: [string, any]) => (
              <div key={electionId} className="bg-gray-50 rounded p-2">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-medium">選舉 ID: {electionId}</span>
                  <span className="font-mono">{election.total_stake} TON</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                  <div>解凍: {new Date(election.unfreeze_at * 1000).toLocaleDateString('zh-TW')}</div>
                  <div>獎金: {election.bonuses} TON</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const isTestnet = urlParams.get("testnet") !== null;

  // 預設地址
  const [controllerAddress, setControllerAddress] = useState("Ef9GOR1wqJFPVpbHOxObSATkdbfTizRTmDi6DdjJFYaRKhoK"); // KTON Validator Controller
  const [electorAddress] = useState(
    addressDisplay(
      "Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF", // Elector
      isTestnet
    )
  );
  const [poolAddress, setPoolAddress] = useState("EQA9HwEZD_tONfVz6lJS0PVKR5viEiEGyj9AuQewGQVnXPg0"); // KTON Pool

  const [controllerData, setControllerData] = useState<any>({});
  const [electorData, setElectorData] = useState<any>({});
  const [poolData, setPoolData] = useState<any>({});
  const [poolControllers, setPoolControllers] = useState<any[]>([]); // Pool相關的Controllers
  const [isControllerLoading, setIsControllerLoading] = useState(false);
  const [isElectorLoading, setIsElectorLoading] = useState(false);
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [isPoolControllersLoading, setIsPoolControllersLoading] = useState(false);

  // 延遲函數
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 帶重試機制的API調用函數
  const apiCallWithRetry = async (apiCall: () => Promise<any>, maxRetries: number = 3, baseDelay: number = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiCall();
        return result;
      } catch (error: any) {
        console.log(`API 調用錯誤 (嘗試 ${attempt}/${maxRetries}):`, error);
        
        // 檢查是否是速率限制錯誤
        const isRateLimited = 
          (error.message && error.message.includes('429')) ||
          (error.toString && error.toString().includes('429')) ||
          (error.response && error.response.status === 429) ||
          // 檢查fetch response狀態
          (error.status === 429) ||
          // 檢查錯誤消息中的關鍵詞
          (error.message && (
            error.message.includes('Too Many Requests') ||
            error.message.includes('rate limit') ||
            error.message.includes('429')
          ));
        
        if (isRateLimited && attempt < maxRetries) {
          const delayTime = baseDelay * Math.pow(2, attempt - 1); // 指數退避
          console.log(`API 速率限制，第 ${attempt} 次重試，等待 ${delayTime}ms...`);
          await delay(delayTime);
          continue;
        }
        
        if (attempt === maxRetries) {
          console.error(`API 調用失敗，已達最大重試次數 ${maxRetries}`, error);
          throw error;
        }
      }
    }
  };

  // 批量API調用函數（串行執行，避免速率限制）
  const batchApiCalls = async (
    calls: Array<() => Promise<any>>, 
    delayBetweenCalls: number = 1500,
    onProgress?: (completed: number, total: number, currentResult?: any) => void
  ) => {
    const results: any[] = [];
    
    for (let i = 0; i < calls.length; i++) {
      try {
        console.log(`執行 API 調用 ${i + 1}/${calls.length}`);
        const result = await apiCallWithRetry(calls[i]);
        results.push(result);
        
        // 進度回調，包含當前結果
        if (onProgress) {
          onProgress(i + 1, calls.length, result);
        }
        
        // 延遲下一次調用（除了最後一次）
        if (i < calls.length - 1) {
          await delay(delayBetweenCalls);
        }
      } catch (error) {
        console.error(`API 調用 ${i + 1} 失敗:`, error);
        // 返回錯誤結果而不是拋出異常
        const errorResult = { error: "Failed to fetch data" };
        results.push(errorResult);
        
        // 即使失敗也要調用進度回調
        if (onProgress) {
          onProgress(i + 1, calls.length, errorResult);
        }
        
        // 延遲下一次調用（除了最後一次）
        if (i < calls.length - 1) {
          await delay(delayBetweenCalls);
        }
      }
    }
    
    return results;
  };

  // 獲取Pool相關Controllers的函數
  const loadPoolControllers = async (poolData: any) => {
    if (!poolData || !poolData.round_data) return;
    
    setIsPoolControllersLoading(true);
    
    try {
      // 從當前輪次獲取borrowers地址
      const currentBorrowers = poolData.round_data.current_round_borrowers?.borrowers || {};
      const prevBorrowers = poolData.round_data.prev_round_borrowers?.borrowers || {};
      
      // 合併所有借款人地址（去重）
      const allBorrowerAddresses = Array.from(new Set([
        ...Object.keys(currentBorrowers),
        ...Object.keys(prevBorrowers)
      ]));
      
      console.log(`開始載入 ${allBorrowerAddresses.length} 個 Controllers（串行模式，預計需要 ${Math.ceil(allBorrowerAddresses.length * 1.5)} 秒）`);
      
      // 創建API調用函數數組
      const apiCalls = allBorrowerAddresses.map(address => 
        () => loadControllerState(address, isTestnet)
      );
      
      // 用於跟蹤即時結果
      const currentControllers: any[] = [];
      
      // 使用批量API調用（串行執行）
      const results = await batchApiCalls(
        apiCalls,
        1500, // 每次調用間隔1.5秒
        (completed, total, currentResult) => {
          console.log(`載入進度: ${completed}/${total} Controllers`);
          
          // 添加新結果到當前控制器列表
          if (currentResult && completed <= allBorrowerAddresses.length) {
            const address = allBorrowerAddresses[completed - 1];
            currentControllers.push({
              address,
              data: currentResult,
              currentBorrow: currentBorrowers[address],
              prevBorrow: prevBorrowers[address]
            });
          }
          
          // 即時更新UI顯示已載入的結果
          setPoolControllers([...currentControllers]);
        }
      );
      
      // 組合最終結果
      const controllers = allBorrowerAddresses.map((address, index) => ({
        address,
        data: results[index] || { error: "Failed to fetch controller data" },
        currentBorrow: currentBorrowers[address],
        prevBorrow: prevBorrowers[address]
      }));
      
      setPoolControllers(controllers);
      console.log('所有 Controllers 載入完成');
      
    } catch (error) {
      console.error('Error loading pool controllers:', error);
      setPoolControllers([]);
    } finally {
      setIsPoolControllersLoading(false);
    }
  };

  // 函數定義
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

  const handleElectorRefresh = async () => {
    setIsElectorLoading(true);
    try {
      const data = await apiCallWithRetry(() => loadElectorState(isTestnet));
      setElectorData(data);
    } catch (error) {
      console.log(error);
      setElectorData({ error: "Failed to refresh data" });
    } finally {
      setIsElectorLoading(false);
    }
  };

  const handlePoolSubmit = async () => {
    setIsPoolLoading(true);
    try {
      console.log('載入 Pool 數據...');
      const data = await apiCallWithRetry(() => loadPoolState(poolAddress, isTestnet));
      setPoolData(data);
      
      console.log('Pool 數據載入完成，開始載入相關 Controllers...');
      // 自動載入Pool相關的Controllers（帶延遲，避免過快連續調用）
      await delay(800);
      await loadPoolControllers(data);
    } catch (error) {
      setPoolData({ error: "Failed to fetch data" });
      setPoolControllers([]);
    } finally {
      setIsPoolLoading(false);
    }
  };

  // 自動加載初始數據
  React.useEffect(() => {
    if (controllerAddress) {
      handleControllerSubmit();
    }
    if (poolAddress) {
      handlePoolSubmit();
    }
    handleElectorRefresh();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 統一的查詢面板 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Controller 查詢 */}
          <div className="bg-white rounded-xl p-4 shadow-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="text-blue-600" size={20} />
              <h3 className="text-lg font-semibold text-gray-800">Controller 合約</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={controllerAddress}
                onChange={(e) => setControllerAddress(e.target.value)}
                placeholder="Controller 地址"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleControllerSubmit}
                disabled={isControllerLoading}
                className={`px-4 py-2 text-sm bg-blue-600 text-white rounded-lg transition-all ${
                  isControllerLoading ? "opacity-50" : "hover:bg-blue-700"
                }`}
              >
                {isControllerLoading ? "查詢中" : "查詢"}
              </button>
            </div>
          </div>

          {/* Pool 查詢 */}
          <div className="bg-white rounded-xl p-4 shadow-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Users className="text-green-600" size={20} />
              <h3 className="text-lg font-semibold text-gray-800">Pool 合約</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={poolAddress}
                onChange={(e) => setPoolAddress(e.target.value)}
                placeholder="Pool 地址"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handlePoolSubmit}
                disabled={isPoolLoading}
                className={`px-4 py-2 text-sm bg-green-600 text-white rounded-lg transition-all ${
                  isPoolLoading ? "opacity-50" : "hover:bg-green-700"
                }`}
              >
                {isPoolLoading ? "查詢中" : "查詢"}
              </button>
            </div>
          </div>

          {/* Elector 查詢 */}
          <div className="bg-white rounded-xl p-4 shadow-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="text-purple-600" size={20} />
              <h3 className="text-lg font-semibold text-gray-800">Elector 選舉器</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={electorAddress}
                disabled
                placeholder="Elector 地址（固定）"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-gray-50 cursor-not-allowed text-gray-600"
              />
              <button
                onClick={handleElectorRefresh}
                disabled={isElectorLoading}
                className={`px-4 py-2 text-sm bg-purple-600 text-white rounded-lg transition-all ${
                  isElectorLoading ? "opacity-50" : "hover:bg-purple-700"
                }`}
              >
                {isElectorLoading ? "刷新中" : "刷新"}
              </button>
            </div>
          </div>
        </div>

        {/* 主要數據展示面板 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Controller 數據 */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="text-blue-600" size={20} />
                  <h3 className="text-lg font-semibold text-gray-800">Controller 數據</h3>
                </div>
                <ControllerDisplay data={controllerData} />
              </div>

              {/* Pool 數據 */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="text-green-600" size={20} />
                  <h3 className="text-lg font-semibold text-gray-800">Pool 數據</h3>
                </div>
                <PoolDisplay data={poolData} />
              </div>

              {/* Elector 數據 */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="text-purple-600" size={20} />
                  <h3 className="text-lg font-semibold text-gray-800">Elector 數據</h3>
                </div>
                <ElectorDisplay data={electorData} />
              </div>
            </div>
          </div>
        </div>

        {/* Pool 相關 Controllers 展示面板 */}
        {poolControllers.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-100">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <Users className="text-green-600" size={24} />
                <h2 className="text-xl font-semibold text-gray-800">Pool 相關的 Controllers</h2>
                {isPoolControllersLoading && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {poolControllers.map((controller, index) => (
                  <div key={controller.address} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="text-blue-600" size={16} />
                      <h4 className="text-sm font-semibold text-gray-800">Controller #{index + 1}</h4>
                    </div>
                    
                    {/* Controller 地址 */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-600 mb-1">地址</div>
                      <button
                        onClick={() => navigator.clipboard.writeText(controller.address)}
                        className="font-mono text-xs text-blue-600 hover:text-blue-800 transition-colors break-all"
                        title={controller.address}
                      >
                        {controller.address.substring(0, 12)}...{controller.address.slice(-8)}
                      </button>
                    </div>

                    {/* 借貸信息 */}
                    {(controller.currentBorrow || controller.prevBorrow) && (
                      <div className="mb-3 p-2 bg-yellow-50 rounded">
                        <div className="text-xs font-medium text-gray-700 mb-2">借貸狀況</div>
                        {controller.currentBorrow && (
                          <div className="space-y-1">
                            <div className="text-xs text-green-700">
                              <span className="font-medium">當前：</span>
                              <div>貸款: {controller.currentBorrow.credit} TON</div>
                              <div>利息: {controller.currentBorrow.interest} TON</div>
                            </div>
                          </div>
                        )}
                        {controller.prevBorrow && (
                          <div className="space-y-1 mt-2">
                            <div className="text-xs text-gray-600">
                              <span className="font-medium">上輪：</span>
                              <div>貸款: {controller.prevBorrow.credit} TON</div>
                              <div>利息: {controller.prevBorrow.interest} TON</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Controller 詳細數據 */}
                    <div className="text-xs">
                      <ControllerDisplay data={controller.data} />
                    </div>
                  </div>
                ))}
              </div>
              
              {isPoolControllersLoading && poolControllers.length === 0 && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
                  <p className="text-gray-500">正在載入 Pool 相關的 Controllers...</p>
                  <p className="text-xs text-gray-400 mt-2">
                    串行載入中，每次間隔1.5秒以避免API限制
                  </p>
                </div>
              )}
              
              {isPoolControllersLoading && poolControllers.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm font-medium text-blue-800">繼續載入中...</span>
                  </div>
                  <p className="text-xs text-blue-600">
                    已載入部分結果，剩餘數據將陸續更新
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 數據概覽面板 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <DollarSign className="text-orange-600" size={24} />
              <h2 className="text-xl font-semibold text-gray-800">LST 生態系統概覽</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Pool 總量 */}
              {poolData && Object.keys(poolData).length > 0 && !poolData.error && (
                <>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="text-green-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">Pool 總餘額</span>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                      {JSON.parse(poolStateStringify(poolData)).total_balance} TON
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      利率: {(JSON.parse(poolStateStringify(poolData)).interest_rate / 1000000 * 100).toFixed(2)}%
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="text-blue-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">當前借款</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.borrowed} TON
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      活躍借款人: {JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.active_borrowers}
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="text-purple-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">預期收益</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-600">
                      {JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.expected} TON
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      輪次: #{JSON.parse(poolStateStringify(poolData)).round_data.current_round_borrowers.round_id}
                    </div>
                  </div>

                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="text-yellow-600" size={16} />
                      <span className="text-sm font-medium text-gray-700">LST 供應量</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {JSON.parse(poolStateStringify(poolData)).minters_data.supply} LST
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Jetton Minter
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 系統狀態指示器 */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">系統狀態</h3>
              <div className="flex flex-wrap gap-3">
                {poolData && Object.keys(poolData).length > 0 && !poolData.error && (
                  <>
                    <StatusBadge 
                      status={JSON.parse(poolStateStringify(poolData)).state} 
                      type={JSON.parse(poolStateStringify(poolData)).state === "NORMAL" ? "success" : "warning"}
                    />
                    <StatusBadge 
                      status={JSON.parse(poolStateStringify(poolData)).deposit_withdrawal_parameters.deposits_open ? "存款開放" : "存款關閉"} 
                      type={JSON.parse(poolStateStringify(poolData)).deposit_withdrawal_parameters.deposits_open ? "success" : "error"}
                    />
                  </>
                )}
                {controllerData && Object.keys(controllerData).length > 0 && !controllerData.error && (
                  <StatusBadge 
                    status={JSON.parse(controllerStateStringify(controllerData)).state} 
                    type="info"
                  />
                )}
                {electorData && Object.keys(electorData).length > 0 && !electorData.error && (
                  <StatusBadge 
                    status={JSON.parse(electorStateStringify(electorData)).elect ? "選舉進行中" : "無進行中選舉"} 
                    type={JSON.parse(electorStateStringify(electorData)).elect ? "warning" : "info"}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
