# Devnet end-to-end run

Run: `npm run e2e:devnet` (scripts/e2e-devnet.ts), 2026-11-20T08:46:54.901Z

- Program: `GGQeGU8BTtRDmHPoC25Py185wEuUeDz3phXWG4Gp6z2P`
- Mint (PLAY): `8DywivK9Vv5Yi2bCRPqDWakdhJE8Qd6eACLgCc8kDts7`
- Market: `FFZWppWmCkzHy5MH7qxzZW5LC12XSP3evhju2sTzwdoB` (id 1795164398838, close_slot 524296772, entropy from slot 524296772)
- Relayer / fee payer: `FkqePa3sPjtF2owmJ1n1yWFeQtMaDYEYrzxDFmXoSNut`; bettors A `8TnWVB9dufb2mRJuHMtVkLEf1BajB1WcyHAsiBQXy2d`, B `8z7UyxhmtcThqtQabGtv5zymsdRtawXZstH687miTSpw` hold 0 SOL
- Result: winner 0, A 1000 -> 1300 PLAY, B 1000 -> 700 PLAY
- Seed sha256(secret ‖ entropy ‖ market): `c33b8f17dae7beb3f177284b7d931ba9517b51a0208595768b54433616716916` (secret `dd5fb68c302d7fe4e7343facef8a40b73e003ff79ca478ad33a1106bcc9bd0c7`)

| Step | Signature |
|---|---|
| fund relayer 0.05 SOL | [`2ZRnVwioFD9YEPZmuovVzx7wih766AXETPk3fUWoAbjRoywWtTPcxpnTb8zhwHc3DwksKk7Rq8qGwKEznibX91Do`](https://explorer.solana.com/tx/2ZRnVwioFD9YEPZmuovVzx7wih766AXETPk3fUWoAbjRoywWtTPcxpnTb8zhwHc3DwksKk7Rq8qGwKEznibX91Do?cluster=devnet) |
| grant A 1000 PLAY | [`5h4qRs14w99HDsG9qFQwpxqHvrjErYWdNmxcwtcSLMs9RmXVtj2EdWH6VzFiNtM5DPF2NLeAuwPUDVJPgNxdcqZt`](https://explorer.solana.com/tx/5h4qRs14w99HDsG9qFQwpxqHvrjErYWdNmxcwtcSLMs9RmXVtj2EdWH6VzFiNtM5DPF2NLeAuwPUDVJPgNxdcqZt?cluster=devnet) |
| grant B 1000 PLAY | [`5cbwYWh8MUgs7wLdUeuFufi6482xk8rZXDrocEPzkCVVdC6DgrJrbTqE11uMxwKbGF6ffxFQ2jQmBjVottzLjhX3`](https://explorer.solana.com/tx/5cbwYWh8MUgs7wLdUeuFufi6482xk8rZXDrocEPzkCVVdC6DgrJrbTqE11uMxwKbGF6ffxFQ2jQmBjVottzLjhX3?cluster=devnet) |
| create_market | [`2nyS4JXEuPFAkC6go5MySsF4YcCk5ycoVb3mXWDpXiALy889EFR5NLsgx3XkNEWD5XeFyxRbKds9zN1ABzciNf8e`](https://explorer.solana.com/tx/2nyS4JXEuPFAkC6go5MySsF4YcCk5ycoVb3mXWDpXiALy889EFR5NLsgx3XkNEWD5XeFyxRbKds9zN1ABzciNf8e?cluster=devnet) |
| place_bet A 100 on 0 | [`2T93imYxA8xE5FaKuTfaB1AYMjFfsryejrYM48TWdHo88KYteUgA1s8Tms9cFiGGkWY81YwASwpNZ8j5hLuRkikC`](https://explorer.solana.com/tx/2T93imYxA8xE5FaKuTfaB1AYMjFfsryejrYM48TWdHo88KYteUgA1s8Tms9cFiGGkWY81YwASwpNZ8j5hLuRkikC?cluster=devnet) |
| place_bet B 300 on 1 | [`WP6DEMUGdEhPxxkhLqPXj33tzHASWZst7zbmxe4yDNp2MtyT4nji8WJm83HGy9Z6ozpCwMXTTLTTsnJUv6w72y6`](https://explorer.solana.com/tx/WP6DEMUGdEhPxxkhLqPXj33tzHASWZst7zbmxe4yDNp2MtyT4nji8WJm83HGy9Z6ozpCwMXTTLTTsnJUv6w72y6?cluster=devnet) |
| lock | [`2gGVmCkfvpeb2vf236twRQn35TBQHF1b38rzTcFHVTefwBfLpDax5nR1vJNLCXvTvkDZsSo7zuXvf6PdZVrB42Ai`](https://explorer.solana.com/tx/2gGVmCkfvpeb2vf236twRQn35TBQHF1b38rzTcFHVTefwBfLpDax5nR1vJNLCXvTvkDZsSo7zuXvf6PdZVrB42Ai?cluster=devnet) |
| settle (winner 0) | [`4H5Y1fMopo23gZ5TvE7cNExF5Vn4ULjvyFrTfwZssLAqAaJX4FbC5JsLiG74Am9hTgYuzezzP51oraHcpMnQyTM6`](https://explorer.solana.com/tx/4H5Y1fMopo23gZ5TvE7cNExF5Vn4ULjvyFrTfwZssLAqAaJX4FbC5JsLiG74Am9hTgYuzezzP51oraHcpMnQyTM6?cluster=devnet) |
| claim A | [`5ajr8FcT8ABDuBP3hCCJs8P34AYo2uqevGNfZLCjsrWvbT1rqVxEVnQQ6TUS9PbHqNwPYG16gzPwLKLx21pyEdCK`](https://explorer.solana.com/tx/5ajr8FcT8ABDuBP3hCCJs8P34AYo2uqevGNfZLCjsrWvbT1rqVxEVnQQ6TUS9PbHqNwPYG16gzPwLKLx21pyEdCK?cluster=devnet) |
| claim B | [`22vPU7Wr13aUjEijuShjaMgGdW6qQ9iNboTTcfg4bP1AnktLisDRcfs3mGVisK3rsugKnAKMNiTM8hPmRoZ4P6Ae`](https://explorer.solana.com/tx/22vPU7Wr13aUjEijuShjaMgGdW6qQ9iNboTTcfg4bP1AnktLisDRcfs3mGVisK3rsugKnAKMNiTM8hPmRoZ4P6Ae?cluster=devnet) |
