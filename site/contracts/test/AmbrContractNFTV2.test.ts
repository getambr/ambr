import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

// Status enum mirror (must match the contract)
const Status = { Active: 0n, Amended: 1n, Revoked: 2n, Expired: 3n };

describe("AmbrContractNFTV2", () => {
  async function deployFixture() {
    const [owner, holder, cp, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AmbrContractNFTV2", owner);
    const nft = await Factory.deploy(owner.address);
    const hash = ethers.keccak256(ethers.toUtf8Bytes("agreement-v1"));
    return { nft, owner, holder, cp, stranger, hash };
  }

  /** Mint a token and return its id (1-based sequential). */
  async function mint(
    nft: any,
    owner: any,
    to: string,
    counterparty: string,
    hash: string
  ): Promise<bigint> {
    await (await nft.connect(owner).mint(to, counterparty, "ipfs://meta", hash)).wait();
    return await nft.nextTokenId();
  }

  // ---------------------------------------------------------------
  // Mint + defaults
  // ---------------------------------------------------------------

  describe("mint", () => {
    it("mints with Active status, no successor, isCurrent = true", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);

      expect(await nft.ownerOf(id)).to.equal(holder.address);
      expect(await nft.contractHash(id)).to.equal(hash);
      expect(await nft.counterparty(id)).to.equal(cp.address);
      expect(await nft.status(id)).to.equal(Status.Active);
      expect(await nft.supersededBy(id)).to.equal(0n);
      expect(await nft.isCurrent(id)).to.equal(true);
    });

    it("emits ContractMinted", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      await expect(nft.connect(owner).mint(holder.address, cp.address, "ipfs://meta", hash))
        .to.emit(nft, "ContractMinted")
        .withArgs(1n, holder.address, cp.address, hash);
    });

    it("rejects mint from non-owner", async () => {
      const { nft, holder, cp, stranger, hash } = await loadFixture(deployFixture);
      await expect(
        nft.connect(stranger).mint(holder.address, cp.address, "ipfs://meta", hash)
      ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    });
  });

  // ---------------------------------------------------------------
  // supersede (amendment)
  // ---------------------------------------------------------------

  describe("supersede", () => {
    it("marks old token Amended, points to successor, flips isCurrent", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const oldId = await mint(nft, owner, holder.address, cp.address, hash);
      const newId = await mint(nft, owner, holder.address, cp.address, hash);

      await expect(nft.connect(owner).supersede(oldId, newId))
        .to.emit(nft, "StatusChanged")
        .withArgs(oldId, Status.Amended, newId);

      expect(await nft.status(oldId)).to.equal(Status.Amended);
      expect(await nft.supersededBy(oldId)).to.equal(newId);
      expect(await nft.isCurrent(oldId)).to.equal(false);
      // successor remains the current one
      expect(await nft.status(newId)).to.equal(Status.Active);
      expect(await nft.isCurrent(newId)).to.equal(true);
      // history preserved: old token still exists in the wallet (never burned)
      expect(await nft.ownerOf(oldId)).to.equal(holder.address);
    });

    it("rejects self-supersede", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);
      await expect(nft.connect(owner).supersede(id, id)).to.be.revertedWith("Self-supersede");
    });

    it("rejects nonexistent old or new token", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);
      await expect(nft.connect(owner).supersede(999n, id)).to.be.revertedWith(
        "Old token does not exist"
      );
      await expect(nft.connect(owner).supersede(id, 999n)).to.be.revertedWith(
        "New token does not exist"
      );
    });

    it("rejects double-supersede (old token no longer Active)", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const a = await mint(nft, owner, holder.address, cp.address, hash);
      const b = await mint(nft, owner, holder.address, cp.address, hash);
      const c = await mint(nft, owner, holder.address, cp.address, hash);

      await nft.connect(owner).supersede(a, b);
      await expect(nft.connect(owner).supersede(a, c)).to.be.revertedWith(
        "Old token not active"
      );
    });

    it("rejects superseding WITH a non-active successor", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const a = await mint(nft, owner, holder.address, cp.address, hash);
      const b = await mint(nft, owner, holder.address, cp.address, hash);
      await nft.connect(owner).revoke(b);

      await expect(nft.connect(owner).supersede(a, b)).to.be.revertedWith(
        "New token not active"
      );
    });

    it("rejects supersede from non-owner", async () => {
      const { nft, owner, holder, cp, stranger, hash } = await loadFixture(deployFixture);
      const a = await mint(nft, owner, holder.address, cp.address, hash);
      const b = await mint(nft, owner, holder.address, cp.address, hash);
      await expect(
        nft.connect(stranger).supersede(a, b)
      ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    });
  });

  // ---------------------------------------------------------------
  // revoke
  // ---------------------------------------------------------------

  describe("revoke", () => {
    it("marks the token Revoked with no successor; token stays in wallet", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);

      await expect(nft.connect(owner).revoke(id))
        .to.emit(nft, "StatusChanged")
        .withArgs(id, Status.Revoked, 0n);

      expect(await nft.status(id)).to.equal(Status.Revoked);
      expect(await nft.supersededBy(id)).to.equal(0n);
      expect(await nft.isCurrent(id)).to.equal(false);
      // evidence preserved — never burned
      expect(await nft.ownerOf(id)).to.equal(holder.address);
    });

    it("rejects revoking a nonexistent token", async () => {
      const { nft, owner } = await loadFixture(deployFixture);
      await expect(nft.connect(owner).revoke(999n)).to.be.revertedWith(
        "Token does not exist"
      );
    });

    it("terminal states are immutable: no revoke after amend, no double revoke", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const a = await mint(nft, owner, holder.address, cp.address, hash);
      const b = await mint(nft, owner, holder.address, cp.address, hash);

      await nft.connect(owner).supersede(a, b);
      await expect(nft.connect(owner).revoke(a)).to.be.revertedWith("Token not active");

      await nft.connect(owner).revoke(b);
      await expect(nft.connect(owner).revoke(b)).to.be.revertedWith("Token not active");
    });

    it("rejects revoke from non-owner", async () => {
      const { nft, owner, holder, cp, stranger, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);
      await expect(nft.connect(stranger).revoke(id)).to.be.revertedWithCustomError(
        nft,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  // ---------------------------------------------------------------
  // expire
  // ---------------------------------------------------------------

  describe("expire", () => {
    it("marks the token Expired", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);

      await expect(nft.connect(owner).expire(id))
        .to.emit(nft, "StatusChanged")
        .withArgs(id, Status.Expired, 0n);

      expect(await nft.status(id)).to.equal(Status.Expired);
      expect(await nft.isCurrent(id)).to.equal(false);
    });

    it("only transitions from Active", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);
      await nft.connect(owner).revoke(id);
      await expect(nft.connect(owner).expire(id)).to.be.revertedWith("Token not active");
    });

    it("rejects expire from non-owner", async () => {
      const { nft, owner, holder, cp, stranger, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);
      await expect(nft.connect(stranger).expire(id)).to.be.revertedWithCustomError(
        nft,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  // ---------------------------------------------------------------
  // isCurrent — the third-party check
  // ---------------------------------------------------------------

  describe("isCurrent", () => {
    it("returns false for a nonexistent token", async () => {
      const { nft } = await loadFixture(deployFixture);
      expect(await nft.isCurrent(999n)).to.equal(false);
    });
  });

  // ---------------------------------------------------------------
  // v1 regression — counterparty-gated transfers must be unchanged
  // ---------------------------------------------------------------

  describe("transfer control (v1 behavior preserved)", () => {
    it("blocks transfer without counterparty approval", async () => {
      const { nft, owner, holder, cp, stranger, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);

      await expect(
        nft.connect(holder).transferFrom(holder.address, stranger.address, id)
      ).to.be.revertedWith("Transfer not approved by counterparty");
    });

    it("allows transfer after approval, and the approval is single-use", async () => {
      const { nft, owner, holder, cp, stranger, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);

      await expect(nft.connect(cp).approveTransfer(id))
        .to.emit(nft, "TransferApprovalGranted")
        .withArgs(id, cp.address);

      await nft.connect(holder).transferFrom(holder.address, stranger.address, id);
      expect(await nft.ownerOf(id)).to.equal(stranger.address);

      // approval consumed — a second transfer needs a fresh approval
      await expect(
        nft.connect(stranger).transferFrom(stranger.address, holder.address, id)
      ).to.be.revertedWith("Transfer not approved by counterparty");
    });

    it("only the counterparty can approve; counterparty or holder can revoke approval", async () => {
      const { nft, owner, holder, cp, stranger, hash } = await loadFixture(deployFixture);
      const id = await mint(nft, owner, holder.address, cp.address, hash);

      await expect(nft.connect(stranger).approveTransfer(id)).to.be.revertedWith(
        "Only counterparty"
      );

      await nft.connect(cp).approveTransfer(id);
      await expect(nft.connect(holder).revokeTransferApproval(id))
        .to.emit(nft, "TransferApprovalRevoked")
        .withArgs(id, holder.address);

      await expect(
        nft.connect(holder).transferFrom(holder.address, stranger.address, id)
      ).to.be.revertedWith("Transfer not approved by counterparty");

      await expect(nft.connect(stranger).revokeTransferApproval(id)).to.be.revertedWith(
        "Only counterparty or holder"
      );
    });
  });

  // ---------------------------------------------------------------
  // Paired-token scenario (bilateral contract: one token per party)
  // ---------------------------------------------------------------

  describe("paired tokens (bilateral amendment)", () => {
    it("supersedes both parties' tokens independently; history intact on both", async () => {
      const { nft, owner, holder, cp, hash } = await loadFixture(deployFixture);
      const hashV2 = ethers.keccak256(ethers.toUtf8Bytes("agreement-v2"));

      // original bilateral pair — one token in each wallet
      const a1 = await mint(nft, owner, holder.address, cp.address, hash);
      const a2 = await mint(nft, owner, cp.address, holder.address, hash);

      // amendment pair
      const b1 = await mint(nft, owner, holder.address, cp.address, hashV2);
      const b2 = await mint(nft, owner, cp.address, holder.address, hashV2);

      await nft.connect(owner).supersede(a1, b1);
      await nft.connect(owner).supersede(a2, b2);

      // both originals amended + pointing at their successors
      expect(await nft.status(a1)).to.equal(Status.Amended);
      expect(await nft.status(a2)).to.equal(Status.Amended);
      expect(await nft.supersededBy(a1)).to.equal(b1);
      expect(await nft.supersededBy(a2)).to.equal(b2);
      expect(await nft.isCurrent(a1)).to.equal(false);
      expect(await nft.isCurrent(a2)).to.equal(false);

      // both successors current, in the right wallets
      expect(await nft.isCurrent(b1)).to.equal(true);
      expect(await nft.isCurrent(b2)).to.equal(true);
      expect(await nft.ownerOf(b1)).to.equal(holder.address);
      expect(await nft.ownerOf(b2)).to.equal(cp.address);

      // full evidence trail still in the wallets
      expect(await nft.ownerOf(a1)).to.equal(holder.address);
      expect(await nft.ownerOf(a2)).to.equal(cp.address);
    });
  });
});
