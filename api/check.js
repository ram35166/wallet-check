// Vercel serverless function: checks if an Ethereum address has exposed its public key.
// Your Etherscan key stays secret here (set as ETHERSCAN_KEY in Vercel settings).

const BASE = "https://api.etherscan.io/v2/api?chainid=1";

module.exports = async (req, res) => {
  const address = String((req.query && req.query.address) || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "That is not a valid Ethereum address (0x + 40 characters)." });
  }
  const key = process.env.ETHERSCAN_KEY;
  if (!key) {
    return res.status(500).json({ error: "Server is missing ETHERSCAN_KEY." });
  }

  try {
    // 1) Is it a smart contract wallet or a normal key-based address?
    const codeRes = await fetch(`${BASE}&module=proxy&action=eth_getCode&address=${address}&tag=latest&apikey=${key}`);
    const codeJson = await codeRes.json();
    const isContract = typeof codeJson.result === "string" && codeJson.result !== "0x" && codeJson.result.startsWith("0x");

    // 2) Oldest 1000 transactions: find ones SENT by this address.
    const txRes = await fetch(`${BASE}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1000&sort=asc&apikey=${key}`);
    const txJson = await txRes.json();

    let txs = [];
    if (txJson.status === "1" && Array.isArray(txJson.result)) {
      txs = txJson.result;
    } else if (!(txJson.message && txJson.message.includes("No transactions"))) {
      return res.status(502).json({ error: "Etherscan problem: " + (typeof txJson.result === "string" ? txJson.result : txJson.message) });
    }

    const sent = txs.filter(t => t.from && t.from.toLowerCase() === address.toLowerCase());
    const first = sent[0];

    return res.status(200).json({
      address,
      isContract,
      exposed: sent.length > 0,
      sentCount: sent.length,
      capped: txs.length >= 1000,
      firstSent: first ? { hash: first.hash, time: Number(first.timeStamp) * 1000 } : null
    });
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong. Try again in a minute." });
  }
};
