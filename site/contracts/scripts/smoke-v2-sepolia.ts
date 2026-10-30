import { ethers } from "hardhat";

// Live lifecycle probe against a deployed AmbrContractNFTV2.
// Usage: V2_ADDRESS=0x... npx hardhat run scripts/smoke-v2-sepolia.ts --network baseSepolia

const Status = { Active: 0n, Amended: 1n, Revoked: 2n, Expired: 3n };

function assert(cond: boolean, label: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + label);
  console.log("  ok:", label);
}

// The public RPC serves eventually-consistent reads: poll until the expected
// state is visible instead of asserting on the first (possibly stale) read.
async function expectState(label: string, check: () => Promise<boolean>) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    if (await check()) {
      console.log("  ok:", label);
      return;
    }
    if (attempt < 8) await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("STATE NOT REACHED: " + label);
}

async function main() {
  const address = process.env.V2_ADDRESS;
  if (!address) throw new Error("Set V2_ADDRESS to the deployed AmbrContractNFTV2 address");

  const [signer] = await ethers.getSigners();
  const nft = await ethers.getContractAt("AmbrContractNFTV2", address, signer);
  const me = signer.address;
  console.log("Probing", address, "as", me);

  const hash = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

  // Public RPC is load-balanced and can serve stale reads right after a tx.
  // Derive token ids from the receipt's Transfer event (authoritative) and
  // retry transient estimateGas failures.
  const withRetry = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt >= 4) throw err;
        console.log(`  (${label}: attempt ${attempt} failed, retrying in 4s)`);
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  };

  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const mint = async (tag: string) => {
    const rc = await withRetry("mint " + tag, async () => {
      const tx = await nft.mint(me, me, "ipfs://smoke/" + tag, hash(tag));
      return tx.wait();
    });
    const log = rc!.logs.find((l: any) => l.topics?.[0] === transferTopic);
    const id = BigInt(log!.topics[3]);
    console.log(`minted ${tag} -> token ${id} (tx ${rc!.hash})`);
    return id;
  };

  console.log("\n1) mint A + B, supersede(A, B)");
  const a = await mint("smoke-A-" + Date.now());
  const b = await mint("smoke-B-" + Date.now());
  await withRetry("supersede", async () => (await nft.supersede(a, b)).wait());
  await expectState("status(A) == Amended", async () => (await nft.status(a)) === Status.Amended);
  await expectState("supersededBy(A) == B", async () => (await nft.supersededBy(a)) === b);
  await expectState("isCurrent(A) == false", async () => (await nft.isCurrent(a)) === false);
  await expectState("isCurrent(B) == true", async () => (await nft.isCurrent(b)) === true);

  console.log("\n2) mint C, revoke(C)");
  const c = await mint("smoke-C-" + Date.now());
  const rtx = await withRetry("revoke", async () => (await nft.revoke(c)).wait());
  console.log("revoked C (tx " + rtx?.hash + ")");
  await expectState("status(C) == Revoked", async () => (await nft.status(c)) === Status.Revoked);
  await expectState("isCurrent(C) == false", async () => (await nft.isCurrent(c)) === false);

  console.log("\n3) negative: revoking C again must revert");
  let reverted = false;
  try {
    await (await nft.revoke(c)).wait();
  } catch {
    reverted = true;
  }
  assert(reverted, "second revoke(C) reverted");

  console.log("\nAll on-chain lifecycle checks passed.");
  console.log("Explorer: https://sepolia.basescan.org/address/" + address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
