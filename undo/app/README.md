# Undo web app (NEAR testnet)

Next.js 16 app for the Undo v2 contract: demo wallet, panic button, private court, council, and live promise checks.

## Run

```bash
npm install
npm run dev        # http://localhost:3100
```

Server routes read secrets from the repository root `.env` (never sent to the browser):
`NEAR_AI_API_KEY` (court), `NEAR_ACCOUNT_ID` / `NEAR_PRIVATE_KEY` (posts recommendations; the S8 DAO's council member),
and a faucet for demo accounts (`NEAR_UNDO_FAUCET_*`, falling back to `NEAR_S21_CONTRACT_*`).

## Pages

| Page | What it does |
|---|---|
| `/dompet` | One click creates a protected demo wallet (100 rUSDC) + its recovery account. Send rUSDC or plain USDC, simulate a stolen key, PANIK from the recovery account, finalize, report, contest, "barang diterima", withdraw. |
| `/sidang/[id]` | Evidence is encrypted **in the browser** to the attested model key pinned on-chain; its hash is committed on-chain, then only the ciphertext goes to the court server. Run the court (one NEAR AI call) and see the verified recommendation. |
| `/dewan` | Disputes with their TEE recommendations; the council decides through a Sputnik DAO proposal + vote. |
| `/janji` | Live checks of J1–J7: locked contract (0 keys, code hash = published build), reserve 1:1, pinned model + prompt hash. |

## API

| Route | |
|---|---|
| `POST /api/demo/account` | Creates a throwaway testnet account for a browser-generated public key (testnet helper, else faucet sub-account). |
| `POST /api/court/evidence` | Stores an evidence envelope only if its sha256 equals the on-chain commitment. |
| `POST /api/court/run` | Free checks (dispute, evidence, procedure, attested key == on-chain pin), then ONE paid E2EE NEAR AI call, the TEE signature, and `post_recommendation`. A run that already paid is retried only with `retryPaid: true`. |
| `POST /api/council/resolve` | DAO `add_proposal` + `act_proposal` for `resolve`. |

Demo data: accounts and keys live in this browser's localStorage; evidence ciphertext and court run records live in `.data/` (gitignored). Testnet only.
