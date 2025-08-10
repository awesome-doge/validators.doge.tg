/* eslint-disable @typescript-eslint/no-explicit-any */
import { fromNano, Address, Cell, Slice, Dictionary, Builder } from "@ton/core";

type MintersData = {
  jetton_minter: Address;
  supply: bigint;
  deposit_payout: Address | null;
  requested_for_deposit: bigint;
  withdraw_payout: Address | null;
  requested_for_withdraw: bigint;
};
type BorrowersData = {
  borrowers: {
    [controller_address_hash: string]: {
      credit: bigint;
      interest: bigint;
    };
  };
  round_id: number;
  active_borrowers: number;
  borrowed: bigint;
  expected: bigint;
  returned: bigint;
  profit: bigint;
};
type RoundData = {
  current_round_borrowers: BorrowersData;
  prev_round_borrowers: BorrowersData;
};

const borrowerValue = {
  serialize: (src: any, builder: Builder) => {
    builder.storeCoins(src.credit);
    builder.storeCoins(src.interest);
  },
  parse: (src: Slice) => {
    const credit = src.loadCoins();
    const interest = src.loadCoins();
    return {
      credit,
      interest,
    };
  },
};
function parseBorrowersData(s: Slice): BorrowersData {
  const _borrowers = s.loadDict(Dictionary.Keys.Buffer(32), borrowerValue);
  const borrowers: any = {};
  for (const key of _borrowers.keys()) {
    borrowers[new Address(-1, key).toString()] = _borrowers.get(key);
  }
  const round_id = s.loadUint(32);
  const active_borrowers = s.loadUint(32);
  const borrowed = s.loadCoins();
  const expected = s.loadCoins();
  const returned = s.loadCoins();
  const sign = s.loadInt(1) > 0 ? 1n : -1n;
  const coins = s.loadCoins();
  const profit = sign * coins;
  return {
    borrowers,
    round_id,
    active_borrowers,
    borrowed,
    expected,
    returned,
    profit,
  };
}

type RoleData = {
  sudoer: Address | null;
  sudoer_set_at: number;
  governor: Address;
  governor_update_after: number;
  interest_manager: Address;
  halter: Address;
  approver: Address;
  treasury: Address;
};
function parseRoleData(s: Slice): RoleData {
  const sudoer = s.loadMaybeAddress();
  const sudoer_set_at = s.loadUint(48);
  const governor = s.loadAddress();
  const governor_update_after = s.loadUint(48);
  const interest_manager = s.loadAddress();
  s = s.loadRef().beginParse();
  const halter = s.loadAddress();
  const approver = s.loadAddress();
  const treasury = s.remainingBits > 0 ? s.loadAddress() : interest_manager;
  return {
    sudoer,
    sudoer_set_at,
    governor,
    governor_update_after,
    interest_manager,
    halter,
    approver,
    treasury,
  };
}

type PoolStorage = {
  state: number;
  halted: boolean;
  total_balance: bigint;
  minters_data: MintersData;

  interest_rate: number;
  deposit_withdrawal_parameters: {
    optimistic_deposit_withdrawals: boolean;
    deposits_open: boolean;
    instant_withdrawal_fee: number;
  };

  saved_validator_set_hash: Buffer; // 32 bytes

  round_data: RoundData;

  loan_params_per_validator: {
    min_loan: bigint;
    max_loan: bigint;
  };

  governance_fee_share: number;
  accrued_governance_fee: bigint;
  disbalance_tolerance: number; // 8 bits
  credit_start_prior_elections_end: number; // 48 bits

  role_data: RoleData;
  codes: {
    controller_code: Cell;
    pool_jetton_wallet_code: Cell;
    payout_minter_code: Cell;
  };
};

function parseStorage(s1: Slice): PoolStorage {
  const state = s1.loadUint(8);
  const halted = s1.loadBoolean();
  const total_balance = s1.loadCoins();

  const s2 = s1.loadRef().beginParse();
  const jetton_minter = s2.loadAddress();
  const supply = s2.loadCoins();
  let deposit_payout = null;
  let requested_for_deposit = 0n;
  if (s2.loadBoolean()) {
    if (s2.loadBoolean()) {
      const _s2 = s2.loadRef().beginParse();
      deposit_payout = _s2.loadAddress();
      requested_for_deposit = _s2.loadCoins();
    } else {
      deposit_payout = s2.loadAddress();
      requested_for_deposit = s2.loadCoins();
    }
  }
  let withdraw_payout = null;
  let requested_for_withdraw = 0n;
  if (s2.loadBoolean()) {
    if (s2.loadBoolean()) {
      const _s2 = s2.loadRef().beginParse();
      withdraw_payout = _s2.loadAddress();
      requested_for_withdraw = _s2.loadCoins();
    } else {
      withdraw_payout = s2.loadAddress();
      requested_for_withdraw = s2.loadCoins();
    }
  }

  const interest_rate = s1.loadUint(24);
  const optimistic_deposit_withdrawals = s1.loadBoolean();
  const deposits_open = s1.loadBoolean();
  const instant_withdrawal_fee = s1.loadUint(24);
  const deposit_withdrawal_parameters = {
    deposits_open,
    optimistic_deposit_withdrawals,
    instant_withdrawal_fee,
  };
  const saved_validator_set_hash = s1.loadBuffer(32);

  const s3 = s1.loadRef().beginParse();
  const s31 = s3.loadRef().beginParse();
  const s32 = s3.loadRef().beginParse();
  const current_round_borrowers = parseBorrowersData(s31);
  const prev_round_borrowers = parseBorrowersData(s32);
  const round_data: RoundData = {
    current_round_borrowers,
    prev_round_borrowers,
  };

  const min_loan = s1.loadCoins();
  const max_loan = s1.loadCoins();
  const loan_params_per_validator = {
    min_loan,
    max_loan,
  };
  const governance_fee_share = s1.loadUint(24);
  const accrued_governance_fee = s1.loadCoins();
  const disbalance_tolerance = s1.loadUint(8);
  const credit_start_prior_elections_end = s1.loadUint(48);

  const s4 = s1.loadRef().beginParse();
  const role_data = parseRoleData(s4);

  const s5 = s1.loadRef().beginParse();
  const codes = {
    controller_code: s5.loadRef(),
    pool_jetton_wallet_code: s5.loadRef(),
    payout_minter_code: s5.loadRef(),
  };

  return {
    state,
    halted,
    total_balance,
    minters_data: {
      jetton_minter,
      supply,
      deposit_payout,
      requested_for_deposit,
      withdraw_payout,
      requested_for_withdraw,
    },
    interest_rate,
    deposit_withdrawal_parameters,
    saved_validator_set_hash,
    round_data,
    loan_params_per_validator,
    governance_fee_share,
    accrued_governance_fee,
    disbalance_tolerance,
    credit_start_prior_elections_end,
    role_data,
    codes,
  };
}

export async function loadPoolState(
  address: string,
  isTestnet: boolean
): Promise<PoolStorage> {
  const jsondata = await (
    await fetch(
      `https://${
        isTestnet ? "testnet." : ""
      }toncenter.com/api/v2/getExtendedAddressInformation?address=${address}`
    )
  ).json();
  const data = jsondata.result.account_state.data;
  const slice = Cell.fromBase64(data).beginParse();
  const res = parseStorage(slice);
  return res;
}

export const poolStateStringify = (action: any) =>
  JSON.stringify(
    action,
    (k, v) => {
      if (k === "state") {
        if (v === 0) return "NORMAL";
        if (v === 1) return "REPAYMENT_ONLY";
      }
      if (typeof v === "bigint") {
        return fromNano(v);
      }
      if (
        v &&
        typeof v == "object" &&
        Object.hasOwn(v, "type") &&
        v.type == "Buffer"
      ) {
        return Buffer.from(v.data).toString("hex").toUpperCase();
      }
      if (v instanceof Buffer) {
        return Buffer.from(v).toString("hex").toUpperCase();
      }
      if (v instanceof Address) return v.toString();
      if (v instanceof Cell) return v.toBoc().toString("base64");
      return v;
    },
    2
  );
