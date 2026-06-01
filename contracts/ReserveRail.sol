// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
}

contract ReserveRail {
    uint16 public constant TOTAL_BPS = 10000;

    struct Asset {
        string name;
        string assetType;
        string jurisdiction;
        string currency;
        uint256 notional;
        uint64 maturityDate;
        bytes32 documentHash;
        string metadataUri;
        uint16 minCoverageBps;
        bool active;
    }

    struct AssetSpec {
        string name;
        string assetType;
        string jurisdiction;
        string currency;
        uint256 notional;
        uint64 maturityDate;
        bytes32 documentHash;
        string metadataUri;
        uint16 minCoverageBps;
    }

    struct Tranche {
        address recipient;
        uint16 basisPoints;
        uint8 priority;
        string label;
    }

    struct ReserveSnapshot {
        uint256 totalReserves;
        uint16 coverageBps;
        bytes32 proofRoot;
        uint64 timestamp;
        string sourceUri;
        address attestor;
    }

    address public owner;
    bool private locked;
    bytes32[] private assetIds;
    mapping(bytes32 => Asset) public assets;
    mapping(bytes32 => Tranche[]) private tranchesByAsset;
    mapping(bytes32 => ReserveSnapshot) public latestReserveSnapshot;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AssetRegistered(
        bytes32 indexed assetId,
        string name,
        string assetType,
        uint256 notional,
        bytes32 indexed documentHash
    );
    event WaterfallConfigured(bytes32 indexed assetId, bytes32 indexed waterfallHash, uint256 trancheCount);
    event CashflowReceived(bytes32 indexed assetId, address indexed from, address indexed token, uint256 amount);
    event CashflowDistributed(
        bytes32 indexed assetId,
        bytes32 indexed distributionId,
        address indexed token,
        uint256 grossAmount,
        uint256 remainder,
        bytes32 waterfallHash
    );
    event TranchePaid(
        bytes32 indexed assetId,
        bytes32 indexed distributionId,
        address indexed token,
        address recipient,
        uint256 amount,
        uint16 basisPoints,
        uint8 priority,
        string label
    );
    event ReserveSnapshotRecorded(
        bytes32 indexed assetId,
        bytes32 indexed proofRoot,
        uint256 totalReserves,
        uint16 coverageBps,
        address indexed attestor,
        string sourceUri
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "ReserveRail: not owner");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "ReserveRail: reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "ReserveRail: zero owner");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    receive() external payable {
        emit CashflowReceived(bytes32(0), msg.sender, address(0), msg.value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ReserveRail: zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function registerAsset(
        bytes32 assetId,
        AssetSpec calldata spec
    ) external onlyOwner {
        require(assetId != bytes32(0), "ReserveRail: zero asset id");
        require(!assets[assetId].active, "ReserveRail: asset exists");
        require(spec.notional > 0, "ReserveRail: zero notional");
        require(spec.documentHash != bytes32(0), "ReserveRail: zero document hash");
        require(spec.minCoverageBps >= TOTAL_BPS, "ReserveRail: weak coverage");

        assets[assetId] = Asset({
            name: spec.name,
            assetType: spec.assetType,
            jurisdiction: spec.jurisdiction,
            currency: spec.currency,
            notional: spec.notional,
            maturityDate: spec.maturityDate,
            documentHash: spec.documentHash,
            metadataUri: spec.metadataUri,
            minCoverageBps: spec.minCoverageBps,
            active: true
        });
        assetIds.push(assetId);

        emit AssetRegistered(assetId, spec.name, spec.assetType, spec.notional, spec.documentHash);
    }

    function configureWaterfall(
        bytes32 assetId,
        address[] calldata recipients,
        uint16[] calldata basisPoints,
        uint8[] calldata priorities,
        string[] calldata labels
    ) external onlyOwner {
        require(assets[assetId].active, "ReserveRail: unknown asset");
        require(recipients.length > 0, "ReserveRail: empty waterfall");
        require(recipients.length == basisPoints.length, "ReserveRail: bps length mismatch");
        require(recipients.length == priorities.length, "ReserveRail: priority length mismatch");
        require(recipients.length == labels.length, "ReserveRail: label length mismatch");

        delete tranchesByAsset[assetId];

        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "ReserveRail: zero recipient");
            require(basisPoints[i] > 0, "ReserveRail: zero bps");
            total += basisPoints[i];
            for (uint256 j = 0; j < i; j++) {
                require(recipients[i] != recipients[j], "ReserveRail: duplicate recipient");
            }
            tranchesByAsset[assetId].push(Tranche({
                recipient: recipients[i],
                basisPoints: basisPoints[i],
                priority: priorities[i],
                label: labels[i]
            }));
        }
        require(total == TOTAL_BPS, "ReserveRail: bps must equal 10000");

        emit WaterfallConfigured(assetId, currentWaterfallHash(assetId), recipients.length);
    }

    function recordCashflow(bytes32 assetId, address token, uint256 amount) external {
        require(assets[assetId].active, "ReserveRail: unknown asset");
        require(amount > 0, "ReserveRail: zero amount");
        emit CashflowReceived(assetId, msg.sender, token, amount);
    }

    function distributeCashflow(
        bytes32 assetId,
        address token,
        uint256 amount,
        bytes32 distributionId
    ) external onlyOwner nonReentrant {
        require(assets[assetId].active, "ReserveRail: unknown asset");
        require(amount > 0, "ReserveRail: zero amount");
        require(tranchesByAsset[assetId].length > 0, "ReserveRail: waterfall missing");

        if (token == address(0)) {
            require(address(this).balance >= amount, "ReserveRail: insufficient native balance");
        } else {
            require(IERC20(token).balanceOf(address(this)) >= amount, "ReserveRail: insufficient token balance");
        }

        uint256 paid;
        Tranche[] storage waterfall = tranchesByAsset[assetId];
        for (uint256 i = 0; i < waterfall.length; i++) {
            Tranche storage tranche = waterfall[i];
            uint256 payout = (amount * tranche.basisPoints) / TOTAL_BPS;
            paid += payout;
            if (payout > 0) {
                _pay(token, tranche.recipient, payout);
            }
            emit TranchePaid(
                assetId,
                distributionId,
                token,
                tranche.recipient,
                payout,
                tranche.basisPoints,
                tranche.priority,
                tranche.label
            );
        }

        uint256 remainder = amount - paid;
        if (remainder > 0) {
            _pay(token, owner, remainder);
        }

        emit CashflowDistributed(assetId, distributionId, token, amount, remainder, currentWaterfallHash(assetId));
    }

    function recordReserveSnapshot(
        bytes32 assetId,
        uint256 totalReserves,
        bytes32 proofRoot,
        string calldata sourceUri
    ) external onlyOwner {
        Asset storage asset = assets[assetId];
        require(asset.active, "ReserveRail: unknown asset");
        require(totalReserves > 0, "ReserveRail: zero reserves");
        require(proofRoot != bytes32(0), "ReserveRail: zero proof root");

        uint16 coverageBps = uint16((totalReserves * TOTAL_BPS) / asset.notional);
        require(coverageBps >= asset.minCoverageBps, "ReserveRail: undercollateralized");

        latestReserveSnapshot[assetId] = ReserveSnapshot({
            totalReserves: totalReserves,
            coverageBps: coverageBps,
            proofRoot: proofRoot,
            timestamp: uint64(block.timestamp),
            sourceUri: sourceUri,
            attestor: msg.sender
        });

        emit ReserveSnapshotRecorded(assetId, proofRoot, totalReserves, coverageBps, msg.sender, sourceUri);
    }

    function getAssetIds() external view returns (bytes32[] memory) {
        return assetIds;
    }

    function getWaterfall(bytes32 assetId) external view returns (Tranche[] memory) {
        return tranchesByAsset[assetId];
    }

    function currentWaterfallHash(bytes32 assetId) public view returns (bytes32) {
        Tranche[] storage waterfall = tranchesByAsset[assetId];
        address[] memory recipients = new address[](waterfall.length);
        uint16[] memory bps = new uint16[](waterfall.length);
        uint8[] memory priorities = new uint8[](waterfall.length);
        string[] memory labels = new string[](waterfall.length);

        for (uint256 i = 0; i < waterfall.length; i++) {
            recipients[i] = waterfall[i].recipient;
            bps[i] = waterfall[i].basisPoints;
            priorities[i] = waterfall[i].priority;
            labels[i] = waterfall[i].label;
        }

        return keccak256(abi.encode(recipients, bps, priorities, labels));
    }

    function _pay(address token, address recipient, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = recipient.call{value: amount}("");
            require(ok, "ReserveRail: native payout failed");
        } else {
            require(IERC20(token).transfer(recipient, amount), "ReserveRail: token payout failed");
        }
    }
}
