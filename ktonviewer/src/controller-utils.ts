/* eslint-disable @typescript-eslint/no-explicit-any */
import { fromNano, Address, Cell, Slice } from "@ton/core";

const ControllerState = {
  0: "REST",
  1: "SENT_BORROWING_REQUEST",
  2: "SENT_STAKE_REQUEST",
  3: "FUNDS_STAKEN",
  4: "SENT_RECOVER_REQUEST",
  5: "INSOLVENT",
};

type ControllerStorage = {
  controller_id: number;
  approved: boolean;
  state: number;
  halted: boolean;

  stake_amount_sent: bigint;
  stake_at: number;
  stake_held_for: number;

  borrowed_amount: bigint;
  borrowing_time: number;
  borrowing_interest: number;

  allowed_borrow_start_prior_elections_end: number;
  approver_set_profit_share: number;
  acceptable_profit_share: number;
  additional_profit_allocation: bigint;

  validator: Address;
  pool: Address;
  governor: Address;
  approver: Address;
  halter: Address;
  sudoer: Address | null;
  sudoer_set_at: number;

  saved_validator_set_hash: Buffer; // 16 bytes
  validator_set_changes_count: number;
  validator_set_change_time: number;
};

function parseStorage(s1: Slice): ControllerStorage {
  const s2 = s1.loadRef().beginParse();
  const s3 = s2.loadRef().beginParse();

  const state = s1.loadUint(8);
  const halted = s1.loadBoolean();
  const approved = s1.loadBoolean();
  const stake_amount_sent = s1.loadCoins();
  const stake_at = s1.loadUint(48);
  const saved_validator_set_hash = s1.loadBuffer(16);
  const validator_set_changes_count = s1.loadUint(8);
  const validator_set_change_time = s1.loadUint(48);
  const stake_held_for = s1.loadUint(48);
  const borrowed_amount = s1.loadCoins();
  const borrowing_time = s1.loadUint(48);
  const sudoer = s1.loadMaybeAddress();
  const sudoer_set_at = s1.loadUint(48);
  const interest = s1.loadUint(24);
  const allowed_borrow_start_prior_elections_end = s1.loadUint(48);
  const approver_set_profit_share = s1.loadUint(24);
  const acceptable_profit_share = s1.loadUint(24);
  const allocation = s1.loadCoins();

  const controller_id = s2.loadUint(32);
  const validator = s2.loadAddress();
  const pool = s2.loadAddress();
  const governor = s2.loadAddress();

  const approver = s3.loadAddress();
  const halter = s3.loadAddress();

  return {
    controller_id,
    approved,
    state,
    halted,

    stake_amount_sent,
    stake_at,
    stake_held_for,

    borrowed_amount,
    borrowing_time,
    borrowing_interest: interest,

    allowed_borrow_start_prior_elections_end,
    approver_set_profit_share,
    acceptable_profit_share,
    additional_profit_allocation: allocation,

    validator,
    pool,
    governor,
    approver,
    halter,
    sudoer,
    sudoer_set_at,

    saved_validator_set_hash,
    validator_set_changes_count,
    validator_set_change_time,
  };
}

export async function loadControllerState(
  address: string,
  isTestnet: boolean
): Promise<ControllerStorage> {
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

export const controllerStateStringify = (action: any) =>
  JSON.stringify(
    action,
    (k, v) => {
      if (k === "state") {
        return ControllerState[v as keyof typeof ControllerState];
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
