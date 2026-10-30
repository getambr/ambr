// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AmbrContractNFT v2 — agreement receipt with on-chain mandate lifecycle
/// @notice v1 (0x20cEE8DDeb9b700Da6f9E00cd6a430fB351DB250) is mint-only:
///         revocation and amendment lived solely in Ambr's off-chain database,
///         so a revoked or superseded mandate still read as "valid" on-chain.
///         v2 adds an on-chain status (Active / Amended / Revoked / Expired)
///         and a supersession pointer, so any third party can verify the
///         current state of an authorization from the chain alone — without
///         trusting Ambr's database.
///
///         History is append-only by design: tokens are never burned on
///         amendment or revocation. The full authorized → amended → revoked
///         trail stays on-chain as evidence.
/// @dev    v2a trust model: status transitions are relayed by the contract
///         owner (Ambr's minter key) only AFTER the application layer has
///         verified bilateral consent (amendment approval flow / signed revoke
///         request). v2b — party-signed EIP-712 status transitions verified
///         on-chain — is the planned follow-up that removes the relayer trust.
contract AmbrContractNFTV2 is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    enum Status {
        Active,   // 0 — default for every minted token
        Amended,  // 1 — superseded by a successor token (supersededBy set)
        Revoked,  // 2 — authority cancelled, no successor
        Expired   // 3 — authority lapsed by time
    }

    mapping(uint256 => bytes32) public contractHash;
    mapping(uint256 => address) public counterparty;
    mapping(uint256 => bool) public transferApproved;
    mapping(uint256 => Status) public status;
    mapping(uint256 => uint256) public supersededBy; // 0 = no successor

    event ContractMinted(
        uint256 indexed tokenId,
        address indexed to,
        address indexed counterpartyAddr,
        bytes32 hash
    );
    event TransferApprovalGranted(uint256 indexed tokenId, address indexed approver);
    event TransferApprovalRevoked(uint256 indexed tokenId, address indexed revoker);
    event StatusChanged(uint256 indexed tokenId, Status status, uint256 supersededBy);

    constructor(address initialOwner)
        ERC721("Ambr Contract", "AMBR")
        Ownable(initialOwner)
    {}

    function mint(
        address to,
        address _counterparty,
        string calldata uri,
        bytes32 _hash
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        contractHash[tokenId] = _hash;
        counterparty[tokenId] = _counterparty;
        emit ContractMinted(tokenId, to, _counterparty, _hash);
        return tokenId;
    }

    // ---------------------------------------------------------------
    // Mandate lifecycle (new in v2)
    // ---------------------------------------------------------------

    /// @notice Mark `oldTokenId` as amended and point it at its successor.
    ///         Both tokens are kept — never burned — so the amendment history
    ///         remains on-chain as evidence.
    function supersede(uint256 oldTokenId, uint256 newTokenId) external onlyOwner {
        require(oldTokenId != newTokenId, "Self-supersede");
        require(_ownerOf(oldTokenId) != address(0), "Old token does not exist");
        require(_ownerOf(newTokenId) != address(0), "New token does not exist");
        require(status[oldTokenId] == Status.Active, "Old token not active");
        require(status[newTokenId] == Status.Active, "New token not active");

        status[oldTokenId] = Status.Amended;
        supersededBy[oldTokenId] = newTokenId;
        emit StatusChanged(oldTokenId, Status.Amended, newTokenId);
    }

    /// @notice Cancel the authority recorded by `tokenId`. A revocation has no
    ///         successor — the token stays in the wallet as evidence, marked
    ///         Revoked.
    function revoke(uint256 tokenId) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(status[tokenId] == Status.Active, "Token not active");

        status[tokenId] = Status.Revoked;
        emit StatusChanged(tokenId, Status.Revoked, 0);
    }

    /// @notice Mark the authority as lapsed by time.
    function expire(uint256 tokenId) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(status[tokenId] == Status.Active, "Token not active");

        status[tokenId] = Status.Expired;
        emit StatusChanged(tokenId, Status.Expired, 0);
    }

    /// @notice The third-party check: is this authorization currently in force?
    ///         Answerable from the chain alone — no Ambr database required.
    function isCurrent(uint256 tokenId) external view returns (bool) {
        return
            _ownerOf(tokenId) != address(0) &&
            status[tokenId] == Status.Active &&
            supersededBy[tokenId] == 0;
    }

    // ---------------------------------------------------------------
    // Transfer control (unchanged from v1)
    // ---------------------------------------------------------------

    function approveTransfer(uint256 tokenId) external {
        require(msg.sender == counterparty[tokenId], "Only counterparty");
        transferApproved[tokenId] = true;
        emit TransferApprovalGranted(tokenId, msg.sender);
    }

    function revokeTransferApproval(uint256 tokenId) external {
        require(
            msg.sender == counterparty[tokenId] || msg.sender == ownerOf(tokenId),
            "Only counterparty or holder"
        );
        transferApproved[tokenId] = false;
        emit TransferApprovalRevoked(tokenId, msg.sender);
    }

    function isCounterparty(uint256 tokenId, address addr) external view returns (bool) {
        return counterparty[tokenId] == addr;
    }

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // Mint: allow unconditionally
        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }

        // Burn: allow unconditionally
        if (to == address(0)) {
            return super._update(to, tokenId, auth);
        }

        // Transfer: require counterparty approval (skip if no counterparty)
        if (counterparty[tokenId] != address(0)) {
            require(transferApproved[tokenId], "Transfer not approved by counterparty");
            transferApproved[tokenId] = false;
        }

        return super._update(to, tokenId, auth);
    }
}
