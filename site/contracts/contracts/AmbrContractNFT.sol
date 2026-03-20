// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AmbrContractNFT is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    mapping(uint256 => bytes32) public contractHash;
    mapping(uint256 => address) public counterparty;
    mapping(uint256 => bool) public transferApproved;

    event ContractMinted(
        uint256 indexed tokenId,
        address indexed to,
        address indexed counterpartyAddr,
        bytes32 hash
    );
    event TransferApprovalGranted(uint256 indexed tokenId, address indexed approver);
    event TransferApprovalRevoked(uint256 indexed tokenId, address indexed revoker);

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
