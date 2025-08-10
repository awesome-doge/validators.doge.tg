/* eslint-disable @typescript-eslint/no-explicit-any */
import { Cell, Dictionary, Slice, Builder, Address } from "@ton/core";

const BuilderCoinDictValue = {
  serialize: (src: bigint, builder: Builder) => {
    builder.storeCoins(src);
  },
  parse: (src: Slice) => {
    return src.loadCoins();
  },
};
const BuilderFrozenDictValue = {
  serialize: (
    src: {
      wallet_addr: string;
      weight: bigint;
      stake: bigint;
      banned: boolean;
    },
    builder: Builder
  ) => {
    builder.storeBuffer(Buffer.from(src.wallet_addr, "hex"), 32); // wallet_addr
    builder.storeUint(src.weight, 64); // weight
    builder.storeCoins(src.stake); // stake
    builder.storeBit(src.banned); // banned
  },
  parse: (src: Slice) => {
    return {
      wallet_addr: src.loadBuffer(32).toString("hex"), // wallet_addr
      weight: src.loadUintBig(64), // weight
      stake: src.loadCoins(), // stake
      banned: src.loadBoolean(), // banned
    };
  },
};
const BuilderPastElectDictValue = {
  serialize: (src: Slice, builder: Builder) => {
    builder.storeUint(src.loadUint(32), 32);
    builder.storeUint(src.loadUintBig(64), 64);
    builder.storeUint(src.loadUintBig(256), 256);
    builder.storeDict(
      src.loadDict(Dictionary.Keys.Buffer(32), BuilderFrozenDictValue)
    ); // validator_pubkey -> builder
    builder.storeCoins(src.loadCoins());
    builder.storeCoins(src.loadCoins());
    builder.storeDict(
      src.loadDict(Dictionary.Keys.Buffer(32), BuilderCoinDictValue)
    );
  },
  parse: (src: Slice) => {
    return src;
  },
};

function unpack_elect(elect: Cell | null) {
  if (elect === null) {
    return null;
  }
  const electSlice = elect.beginParse();
  const [
    elect_at,
    elect_close,
    min_stake,
    total_stake,
    members,
    failed,
    finished,
  ] = [
    electSlice.loadUint(32),
    electSlice.loadUint(32),
    electSlice.loadCoins(),
    electSlice.loadCoins(),
    electSlice.loadDict(Dictionary.Keys.Buffer(32), BuilderCoinDictValue), // validator_pubkey -> builder (Coins)
    electSlice.loadBoolean(),
    electSlice.loadBoolean(),
  ];

  return {
    elect_at,
    elect_close,
    min_stake,
    total_stake,
    members,
    failed,
    finished,
  };
}

function unpack_past_elections(past_elections: Slice | null) {
  if (past_elections === null) {
    return null;
  }
  const [
    unfreeze_at,
    stake_held,
    vset_hash,
    frozen_dict,
    total_stakes,
    bonuses,
    complaints,
  ] = [
    past_elections.loadUint(32),
    past_elections.loadUint(32),
    past_elections.loadUintBig(256),
    past_elections.loadDict(Dictionary.Keys.Buffer(32), BuilderFrozenDictValue), // validator_pubkey -> builder
    past_elections.loadCoins(),
    past_elections.loadCoins(),
    past_elections.loadDict(Dictionary.Keys.Buffer(32), BuilderCoinDictValue), // validator_pubkey -> Builder (Coins)
  ];

  return {
    unfreeze_at,
    stake_held,
    vset_hash,
    frozen_dict,
    total_stakes,
    bonuses,
    complaints,
  };
}

/*
function unpack_frozen_dict(frozen_dict: Slice | null) {
  if (frozen_dict === null) {
    return null;
  }
  const [addr, weight, stake, banned] = [
    frozen_dict.loadBuffer(32), // wallet_addr
    frozen_dict.loadUintBig(64),
    frozen_dict.loadCoins(),
    frozen_dict.loadBoolean(),
  ];

  return {
    addr,
    weight,
    stake,
    banned,
  };
}
*/

export async function fetchElectorData(isTestnet: boolean = false) {
  const res = await (
    await fetch(
      `https://${
        isTestnet ? "testnet." : ""
      }toncenter.com/api/v2/getExtendedAddressInformation?address=Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF`
    )
  ).json();

  const storageSlice = Cell.fromBase64(
    res.result.account_state.data
  ).beginParse();
  const elect = storageSlice.loadMaybeRef();
  const credits = storageSlice.loadDict(
    Dictionary.Keys.Buffer(32),
    BuilderCoinDictValue
  ); // wallet_addr -> builder (Coins)
  const past_elections = storageSlice.loadDict(
    Dictionary.Keys.Uint(32),
    BuilderPastElectDictValue
  ); // election_id -> builder
  const grams = storageSlice.loadCoins();
  const active_id = storageSlice.loadUint(32);
  const active_hash = storageSlice.loadBuffer(32);

  const electInfo = unpack_elect(elect);
  const past_elections_info: { [key: number]: any } = {};
  for (const key of past_elections.keys()) {
    const past_election = past_elections.get(key);
    const past_election_info = unpack_past_elections(past_election ?? null);

    past_elections_info[key] = past_election_info;
  }

  return {
    elect: electInfo,
    credits,
    past_elections: past_elections_info,
    nobody_balance: grams,
    active_id,
    active_hash: active_hash.toString("hex"),
  };
}

export function UnReadablesReplacer(
  key: string | Buffer | number,
  value: any
): any {
  if (Buffer.isBuffer(key)) {
    key = key.toString("hex");
  }
  if (typeof value === "bigint") {
    return value.toString() + "n";
  } else if (value instanceof Dictionary) {
    const keys = value.keys();
    const result: any = {};
    for (let k of keys) {
      const val = value.get(k);
      if (Buffer.isBuffer(k)) {
        k = k.toString("hex");
      }
      result[k] = UnReadablesReplacer(k, val);
    }
    return result;
  } else if (Address.isAddress(value)) {
    return value.toString();
  } else if (Buffer.isBuffer(value)) {
    return value.toString("hex");
  }
  return value;
}
