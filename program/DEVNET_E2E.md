# Devnet end-to-end run

Run: `npm run e2e:devnet` (scripts/e2e-devnet.ts), 2026-11-18T18:49:56.339Z

- Program: `GGQeGU8BTtRDmHPoC25Py185wEuUeDz3phXWG4Gp6z2P`
- Mint (PLAY): `8DywivK9Vv5Yi2bCRPqDWakdhJE8Qd6eACLgCc8kDts7`
- Market: `E4boRtq6njaQMuL9a9zVxkqTdwP4Xogw7L2xCqvr95JS` (id 1795027780615, close_slot 523725723, entropy from slot 523725723)
- Relayer / fee payer: `HWPavxjtez4PCaV2y9nGPbF84mwJudX98RZH7isZqhrF`; bettors A `Ayhzm2sEFmSsdRkgT7z9R7EC5eDYPpVtorBNLPP9vHnk`, B `HjLCipT3kdKPvPdhr47Dt2yeAKRUAPMKqTqWMBFEuPQ8` hold 0 SOL
- Result: winner 0, A 1000 -> 1300 PLAY, B 1000 -> 700 PLAY
- Seed sha256(secret ‖ entropy ‖ market): `08d3c37d9b07c62be74e11c899b1e6f3aab2fc4288544e2ca3d0090354579518` (secret `91a4ba4673a71eec5a3fbf5b2f9d3bdd827b28ab8e460c38846b5e06a52c5703`)

| Step | Signature |
|---|---|
| fund relayer 0.05 SOL | [`4pyJgtQoxTuzZgc2dAnwPTUTEzugSANj1q2FNFMdqMnFBq32jtQ7iwLSHaGyYrBHt8syqy1JGSnU4emsoWNKej4e`](https://explorer.solana.com/tx/4pyJgtQoxTuzZgc2dAnwPTUTEzugSANj1q2FNFMdqMnFBq32jtQ7iwLSHaGyYrBHt8syqy1JGSnU4emsoWNKej4e?cluster=devnet) |
| grant A 1000 PLAY | [`5ge89jGN4F8FoaBHibwQVo4qt92BhipfmuxELujmFLTgpMBQHDCesrAXZSD41mZoSnfVEHKdyLXwadxfc8oRqZRQ`](https://explorer.solana.com/tx/5ge89jGN4F8FoaBHibwQVo4qt92BhipfmuxELujmFLTgpMBQHDCesrAXZSD41mZoSnfVEHKdyLXwadxfc8oRqZRQ?cluster=devnet) |
| grant B 1000 PLAY | [`2UiR2rm9Ac8JoVE1vm3zfj8ZDyzRvgsGBeVsG72vcoTEm6wDfqq8pmLBDK3YfR2MefXHT45XkGeHfYWwaDsrZNw9`](https://explorer.solana.com/tx/2UiR2rm9Ac8JoVE1vm3zfj8ZDyzRvgsGBeVsG72vcoTEm6wDfqq8pmLBDK3YfR2MefXHT45XkGeHfYWwaDsrZNw9?cluster=devnet) |
| create_market | [`532nm316LdqPCZz7gAWQWfdLQSf3RAbWKG3q4WepqE7n6BSwzFP6NVKhabrxG8vJHwhPt4RRbUJRKbRA4dZpTCE6`](https://explorer.solana.com/tx/532nm316LdqPCZz7gAWQWfdLQSf3RAbWKG3q4WepqE7n6BSwzFP6NVKhabrxG8vJHwhPt4RRbUJRKbRA4dZpTCE6?cluster=devnet) |
| place_bet A 100 on 0 | [`198v3J3TxQ6UX7SrLryKVyfNZnJwvsMjR7at9f3cNmUX1E9pgTw3dKtK7JmbXUyjoa5uUaFJ2Dr5JCAaHQcSgt1`](https://explorer.solana.com/tx/198v3J3TxQ6UX7SrLryKVyfNZnJwvsMjR7at9f3cNmUX1E9pgTw3dKtK7JmbXUyjoa5uUaFJ2Dr5JCAaHQcSgt1?cluster=devnet) |
| place_bet B 300 on 1 | [`ifb9xguw7YjrqkMSxThqY8aUNxv8G4UqB3K3iYHskZNLLFa2N6hibM9gdUnsTTLzgH6Jx7Kz21Sj1M7abkKZrKL`](https://explorer.solana.com/tx/ifb9xguw7YjrqkMSxThqY8aUNxv8G4UqB3K3iYHskZNLLFa2N6hibM9gdUnsTTLzgH6Jx7Kz21Sj1M7abkKZrKL?cluster=devnet) |
| lock | [`5AWsF9U2XByqvoTf4KEkQtNhcNxDhrW5xL4nUanoWDkZDtZj2paRzGzQXfp9S5aFME891GmWde7MUaUTHfSXhGMc`](https://explorer.solana.com/tx/5AWsF9U2XByqvoTf4KEkQtNhcNxDhrW5xL4nUanoWDkZDtZj2paRzGzQXfp9S5aFME891GmWde7MUaUTHfSXhGMc?cluster=devnet) |
| settle (winner 0) | [`3Q2gUeiPr9oiPKCaY4yaDVgLWFfsNybB6uaqGy8Yi4RGW95HxYFaTKXyo92AV8bkEsEcyJhU4xJeF6kpNGJg75w2`](https://explorer.solana.com/tx/3Q2gUeiPr9oiPKCaY4yaDVgLWFfsNybB6uaqGy8Yi4RGW95HxYFaTKXyo92AV8bkEsEcyJhU4xJeF6kpNGJg75w2?cluster=devnet) |
| claim A | [`wh1ma2egUHhC3vi798pFo7UFpUWi986WA6T5LGs59PF5LgTeAAnfLoyA4Swbev6HCsqjHinioB4DPMEGoqkfvTJ`](https://explorer.solana.com/tx/wh1ma2egUHhC3vi798pFo7UFpUWi986WA6T5LGs59PF5LgTeAAnfLoyA4Swbev6HCsqjHinioB4DPMEGoqkfvTJ?cluster=devnet) |
| claim B | [`4F5H4VjhQUtHvnWRRZ2G7BQDh5RAdhc88mmohCjz6CJavChyGqZbLfqUjbRxVcXHuQUGvH534eNzX6XB2x8nNb3H`](https://explorer.solana.com/tx/4F5H4VjhQUtHvnWRRZ2G7BQDh5RAdhc88mmohCjz6CJavChyGqZbLfqUjbRxVcXHuQUGvH534eNzX6XB2x8nNb3H?cluster=devnet) |
