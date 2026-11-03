// S4 — Chain Signatures: derive foreign addresses, MPC-sign real txs, verify + broadcast.
// EVM: Base Sepolia (secp256k1, domain 0). Solana: devnet (Ed25519, domain 1).
import { contracts, chainAdapters, utils as csUtils } from "chainsig.js";
const responseToMpcSignature = contracts.utils.transaction.responseToMpcSignature;
import { createPublicClient, http, recoverTransactionAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { teraToGas } from "near-api-js";
import { account, accountId, provider, json, sleep } from "./lib.mjs";

const MPC = "v1.signer-prod.testnet";
const hex = (b) => Buffer.from(b).toString("hex");
const contract = new contracts.ChainSignatureContract({
  networkId: "testnet",
  contractId: MPC,
  fallbackRpcUrls: ["https://rpc.testnet.fastnear.com"],
});

// MPC sign through near-api-js v7 (bypasses chainsig.js's @near-js 2.x action builders)
async function mpcSign(payloadBytes, path, keyType) {
  const t0 = Date.now();
  const res = await account.callFunction({
    contractId: MPC,
    methodName: "sign",
    args: {
      request: {
        payload_v2: { [keyType]: hex(payloadBytes) },
        path,
        domain_id: keyType === "Eddsa" ? 1 : 0,
      },
    },
    gas: teraToGas("300"),
    deposit: 1n,
  });
  const ms = Date.now() - t0;
  console.log(`  MPC sign (${keyType}) returned in ${ms} ms; raw:`, json(res).slice(0, 300));
  return { sig: responseToMpcSignature({ signature: res }), ms };
}

const results = {};

// ---------------- EVM / Base Sepolia ----------------
console.log("=== EVM (Base Sepolia, chainId 84532) ===");
const publicClient = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
const evm = new chainAdapters.evm.EVM({ publicClient, contract });
const evmPath = "nh-spike-evm-1";
const { address: evmAddr, publicKey: evmPk } = await evm.deriveAddressAndPublicKey(accountId, evmPath);
console.log("derived EVM address:", evmAddr);

// cross-check client-side derivation against the contract's derived_public_key view
const onchainPk = await provider.callFunction({
  contractId: MPC,
  method: "derived_public_key",
  args: { path: evmPath, predecessor: accountId, domain_id: 0 },
});
const onchainSec1 = csUtils.cryptography.najToUncompressedPubKeySEC1(onchainPk);
console.log("on-chain derived_public_key:", onchainPk, onchainSec1 === evmPk ? "== client-side derivation ✅" : "!= client-side ❌");
const { balance: evmBal } = await evm.getBalance(evmAddr);
console.log("Base Sepolia balance (wei):", evmBal.toString());

const { transaction: evmTx, hashesToSign } = await evm.prepareTransactionForSigning({
  from: evmAddr,
  to: evmAddr,
  value: 0n,
});
console.log("unsigned EVM tx:", json(evmTx));
const { sig: evmSig, ms: evmMs } = await mpcSign(hashesToSign[0], evmPath, "Ecdsa");
const signedEvm = evm.finalizeTransactionSigning({ transaction: evmTx, rsvSignatures: [evmSig] });
const recovered = await recoverTransactionAddress({ serializedTransaction: signedEvm });
console.log("recovered signer:", recovered, recovered === evmAddr ? "== derived ✅" : "!= derived ❌");
results.evm = { address: evmAddr, signMs: evmMs, recoveredMatches: recovered === evmAddr };
try {
  const { hash } = await evm.broadcastTx(signedEvm);
  console.log("broadcast OK:", hash, `https://sepolia.basescan.org/tx/${hash}`);
  results.evm.broadcast = hash;
} catch (e) {
  const cause = e?.cause?.shortMessage ?? e?.cause?.details ?? e?.message;
  console.log("broadcast failed:", cause);
  results.evm.broadcastError = cause;
}

// ---------------- Solana devnet ----------------
console.log("\n=== Solana devnet (Ed25519) ===");
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const sol = new chainAdapters.solana.Solana({ solanaConnection: conn, contract });
const solPath = "nh-spike-sol-1";
const { address: solAddr } = await sol.deriveAddressAndPublicKey(accountId, solPath);
const { address: solDest } = await sol.deriveAddressAndPublicKey(accountId, "nh-spike-sol-2");
console.log("derived Solana address:", solAddr, "dest:", solDest);
results.sol = { address: solAddr };

let lamports = Number((await sol.getBalance(solAddr)).balance);
console.log("balance (lamports):", lamports);
if (lamports < 2_000_000) {
  try {
    const sig = await conn.requestAirdrop(new PublicKey(solAddr), 0.05 * LAMPORTS_PER_SOL);
    console.log("airdrop requested:", sig);
    for (let i = 0; i < 20 && lamports < 2_000_000; i++) {
      await sleep(2000);
      lamports = Number((await sol.getBalance(solAddr)).balance);
    }
    console.log("balance after airdrop:", lamports);
    results.sol.airdrop = sig;
  } catch (e) {
    console.log("airdrop failed:", e.message?.slice(0, 300));
    results.sol.airdropError = e.message?.slice(0, 200);
  }
}

const { transaction: solTx, hashesToSign: solHashes } = await sol.prepareTransactionForSigning({
  from: solAddr,
  to: solDest,
  amount: 1_000_000n, // 0.001 SOL
});
console.log("Solana message bytes to sign:", solHashes[0].length);
try {
  const { sig: solSig, ms: solMs } = await mpcSign(solHashes[0], solPath, "Eddsa");
  results.sol.signMs = solMs;
  const signedSol = sol.finalizeTransactionSigning({
    transaction: solTx.transaction,
    rsvSignatures: solSig,
    senderAddress: solAddr,
  });
  console.log("signature verifies locally:", solTx.transaction.verifySignatures());
  results.sol.verifies = solTx.transaction.verifySignatures();
  try {
    const { hash } = await sol.broadcastTx(signedSol);
    console.log("broadcast OK:", hash, `https://explorer.solana.com/tx/${hash}?cluster=devnet`);
    results.sol.broadcast = hash;
  } catch (e) {
    console.log("broadcast failed:", e.message?.slice(0, 300));
    results.sol.broadcastError = e.message?.slice(0, 200);
  }
} catch (e) {
  console.log("Eddsa sign failed:", e.message?.slice(0, 400));
  results.sol.signError = e.message?.slice(0, 300);
}

console.log("\n=== S4 summary ===\n" + json(results));
