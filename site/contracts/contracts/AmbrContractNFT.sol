// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AmbrContractNFT is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    event ContractMinted(uint256 indexed tokenId, address indexed to);

    constructor(address initialOwner)
        ERC721("Ambr Contract", "AMBR")
        Ownable(initialOwner)
    {}

    function mint(address to, string calldata uri)
        external
        onlyOwner
        returns (uint256)
    {
        uint256 tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit ContractMinted(tokenId, to);
        return tokenId;
    }

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }
}
