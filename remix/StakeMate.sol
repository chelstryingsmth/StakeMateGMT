// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StakeMate
/// @notice Two-person BOT staking challenges with objective check-ins or peer-reviewed evidence.
/// @dev A "day" is a rolling 24-hour window measured from the time the partner joins.
contract StakeMate {
    enum ChallengeStatus {
        Pending,
        Active,
        Finalized,
        Cancelled
    }

    enum ChallengeOutcome {
        None,
        BothSucceeded,
        CreatorSucceeded,
        PartnerSucceeded,
        BothFailed
    }

    enum VerificationMode {
        DailyCheckIn,
        PartnerReview
    }

    enum PayoutMode {
        WinnerTakesPool,
        IndividualForfeit
    }

    enum ReviewDecision {
        Pending,
        Approved,
        Rejected
    }

    enum SoloGoalStatus {
        PendingVerifier,
        Active,
        Approved,
        Rejected,
        Cancelled,
        Expired
    }

    struct Challenge {
        address creator;
        address partner;
        address forfeitureRecipient;
        uint256 stakeAmount;
        uint256 createdAt;
        uint256 startTime;
        uint256 endTime;
        uint16 durationDays;
        uint16 requiredCheckIns;
        uint16 creatorCheckIns;
        uint16 partnerCheckIns;
        ChallengeStatus status;
        ChallengeOutcome outcome;
        string title;
        VerificationMode verificationMode;
        PayoutMode payoutMode;
        uint32 reviewPeriod;
        uint256 reviewDeadline;
    }

    struct Evidence {
        bytes32 digest;
        string uri;
        uint256 submittedAt;
        ReviewDecision decision;
    }

    struct SoloGoal {
        address owner;
        address verifier;
        address failureRecipient;
        uint256 amount;
        uint256 createdAt;
        uint256 acceptedAt;
        uint256 goalDeadline;
        uint256 reviewDeadline;
        uint256 resolvedAt;
        uint32 goalDuration;
        uint32 reviewPeriod;
        bytes32 resolutionDigest;
        SoloGoalStatus status;
        string title;
    }

    uint16 public constant MAX_DURATION_DAYS = 365;
    uint32 public constant MIN_REVIEW_PERIOD = 1 hours;
    uint32 public constant MAX_REVIEW_PERIOD = 7 days;
    uint32 public constant MIN_SOLO_GOAL_DURATION = 1 hours;
    uint32 public constant MAX_SOLO_LOCK_DURATION = 365 days;
    uint16 public constant MAX_TITLE_BYTES = 100;
    uint16 public constant MAX_EVIDENCE_URI_BYTES = 256;

    uint256 public challengeCount;
    uint256 public soloGoalCount;

    mapping(uint256 challengeId => Challenge challenge) public challenges;
    mapping(
        uint256 challengeId => mapping(address participant => mapping(uint256 dayIndex => bool checkedIn))
    ) private checkIns;
    mapping(uint256 challengeId => mapping(address participant => Evidence evidence))
        public evidenceByParticipant;
    mapping(uint256 soloGoalId => SoloGoal goal) public soloGoals;
    mapping(uint256 soloGoalId => Evidence evidence) public soloGoalEvidence;
    mapping(address account => uint256 amount) public claimable;

    uint256 private withdrawalLock = 1;

    error ChallengeNotFound();
    error InvalidAddress();
    error InvalidStake();
    error InvalidDuration();
    error InvalidRequiredCheckIns();
    error InvalidReviewPeriod();
    error InvalidLockDuration();
    error InvalidTitle();
    error InvalidEvidence();
    error SoloGoalNotFound();
    error NotCreator();
    error NotGoalOwner();
    error NotInvitedPartner();
    error NotParticipant();
    error NotReviewer();
    error NotGoalVerifier();
    error InvalidStatus();
    error WrongVerificationMode();
    error ChallengeEnded();
    error ChallengeNotEnded();
    error ApprovalTooEarly();
    error GoalSubmissionClosed();
    error GoalNotExpired();
    error ReviewWindowClosed();
    error ReviewStillOpen();
    error AlreadyCheckedIn();
    error AlreadyReviewed();
    error NothingToWithdraw();
    error TransferFailed();
    error ReentrantCall();
    error DirectPaymentsDisabled();

    event ChallengeCreated(
        uint256 indexed challengeId,
        address indexed creator,
        address indexed partner,
        uint256 stakeAmount,
        uint16 durationDays,
        uint16 requiredCheckIns,
        address forfeitureRecipient,
        VerificationMode verificationMode,
        PayoutMode payoutMode,
        uint32 reviewPeriod,
        string title
    );
    event ChallengeJoined(
        uint256 indexed challengeId,
        uint256 startTime,
        uint256 endTime,
        uint256 reviewDeadline
    );
    event CheckedIn(uint256 indexed challengeId, address indexed participant, uint256 indexed dayIndex);
    event EvidenceSubmitted(
        uint256 indexed challengeId,
        address indexed participant,
        bytes32 indexed digest,
        string uri
    );
    event EvidenceReviewed(
        uint256 indexed challengeId,
        address indexed reviewer,
        address indexed participant,
        ReviewDecision decision
    );
    event EvidenceAutoApproved(uint256 indexed challengeId, address indexed participant);
    event ChallengeFinalized(
        uint256 indexed challengeId,
        ChallengeOutcome outcome,
        bool creatorSucceeded,
        bool partnerSucceeded
    );
    event ChallengeCancelled(uint256 indexed challengeId);
    event SoloGoalCreated(
        uint256 indexed soloGoalId,
        address indexed owner,
        address indexed verifier,
        address failureRecipient,
        uint256 amount,
        uint32 goalDuration,
        uint32 reviewPeriod,
        string title
    );
    event SoloGoalAccepted(
        uint256 indexed soloGoalId,
        address indexed verifier,
        uint256 goalDeadline,
        uint256 reviewDeadline
    );
    event SoloGoalEvidenceSubmitted(
        uint256 indexed soloGoalId,
        address indexed owner,
        bytes32 indexed digest,
        string uri
    );
    event SoloGoalApproved(
        uint256 indexed soloGoalId,
        address indexed owner,
        address indexed verifier,
        uint256 amount
    );
    event SoloGoalRejected(
        uint256 indexed soloGoalId,
        address indexed verifier,
        address indexed failureRecipient,
        uint256 amount,
        bytes32 reasonDigest
    );
    event SoloGoalCancelled(uint256 indexed soloGoalId);
    event SoloGoalExpired(
        uint256 indexed soloGoalId,
        address indexed failureRecipient,
        uint256 amount
    );
    event PayoutWithdrawn(address indexed account, uint256 amount);

    modifier nonReentrant() {
        if (withdrawalLock != 1) revert ReentrantCall();
        withdrawalLock = 2;
        _;
        withdrawalLock = 1;
    }

    /// @notice Create an objective daily check-in challenge and escrow the creator's BOT stake.
    function createChallenge(
        address partner,
        address forfeitureRecipient,
        uint16 durationDays,
        uint16 requiredCheckIns,
        string calldata title
    ) external payable returns (uint256 challengeId) {
        if (requiredCheckIns == 0 || requiredCheckIns > durationDays) {
            revert InvalidRequiredCheckIns();
        }

        challengeId = _createChallenge(
            partner,
            forfeitureRecipient,
            durationDays,
            requiredCheckIns,
            0,
            VerificationMode.DailyCheckIn,
            PayoutMode.WinnerTakesPool,
            title
        );
    }

    /// @notice Create a real-world challenge whose final evidence is reviewed by the other participant.
    /// @dev Failed stakes go to a neutral recipient, so a reviewer cannot profit from rejecting evidence.
    function createEvidenceChallenge(
        address partner,
        address forfeitureRecipient,
        uint16 durationDays,
        uint32 reviewPeriod,
        string calldata title
    ) external payable returns (uint256 challengeId) {
        if (reviewPeriod < MIN_REVIEW_PERIOD || reviewPeriod > MAX_REVIEW_PERIOD) {
            revert InvalidReviewPeriod();
        }

        challengeId = _createChallenge(
            partner,
            forfeitureRecipient,
            durationDays,
            0,
            reviewPeriod,
            VerificationMode.PartnerReview,
            PayoutMode.IndividualForfeit,
            title
        );
    }

    /// @notice Propose a personal BOT lock to a verifier friend.
    /// @dev The owner may cancel only before the verifier accepts. After acceptance, the owner
    ///      can recover the BOT only through verifier approval.
    function createSoloGoal(
        address verifier,
        address failureRecipient,
        uint32 goalDuration,
        uint32 reviewPeriod,
        string calldata title
    ) external payable returns (uint256 soloGoalId) {
        if (verifier == address(0) || failureRecipient == address(0)) revert InvalidAddress();
        if (
            verifier == msg.sender ||
            failureRecipient == msg.sender ||
            failureRecipient == verifier
        ) revert InvalidAddress();
        if (msg.value == 0) revert InvalidStake();
        if (
            goalDuration < MIN_SOLO_GOAL_DURATION ||
            goalDuration > MAX_SOLO_LOCK_DURATION
        ) revert InvalidLockDuration();
        if (reviewPeriod < MIN_REVIEW_PERIOD || reviewPeriod > MAX_REVIEW_PERIOD) {
            revert InvalidReviewPeriod();
        }

        uint256 titleLength = bytes(title).length;
        if (titleLength == 0 || titleLength > MAX_TITLE_BYTES) revert InvalidTitle();

        soloGoalId = ++soloGoalCount;
        soloGoals[soloGoalId] = SoloGoal({
            owner: msg.sender,
            verifier: verifier,
            failureRecipient: failureRecipient,
            amount: msg.value,
            createdAt: block.timestamp,
            acceptedAt: 0,
            goalDeadline: 0,
            reviewDeadline: 0,
            resolvedAt: 0,
            goalDuration: goalDuration,
            reviewPeriod: reviewPeriod,
            resolutionDigest: bytes32(0),
            status: SoloGoalStatus.PendingVerifier,
            title: title
        });

        emit SoloGoalCreated(
            soloGoalId,
            msg.sender,
            verifier,
            failureRecipient,
            msg.value,
            goalDuration,
            reviewPeriod,
            title
        );
    }

    /// @notice Accept responsibility for reviewing a proposed solo goal.
    function acceptSoloGoal(uint256 soloGoalId) external {
        SoloGoal storage goal = _existingSoloGoal(soloGoalId);
        if (goal.status != SoloGoalStatus.PendingVerifier) revert InvalidStatus();
        if (msg.sender != goal.verifier) revert NotGoalVerifier();

        goal.status = SoloGoalStatus.Active;
        goal.acceptedAt = block.timestamp;
        goal.goalDeadline = block.timestamp + uint256(goal.goalDuration);
        goal.reviewDeadline = goal.goalDeadline + uint256(goal.reviewPeriod);

        emit SoloGoalAccepted(
            soloGoalId,
            msg.sender,
            goal.goalDeadline,
            goal.reviewDeadline
        );
    }

    /// @notice Cancel a proposal before the verifier accepts and recover the deposit.
    function cancelPendingSoloGoal(uint256 soloGoalId) external {
        SoloGoal storage goal = _existingSoloGoal(soloGoalId);
        if (goal.status != SoloGoalStatus.PendingVerifier) revert InvalidStatus();
        if (msg.sender != goal.owner) revert NotGoalOwner();

        goal.status = SoloGoalStatus.Cancelled;
        goal.resolvedAt = block.timestamp;
        claimable[goal.owner] += goal.amount;

        emit SoloGoalCancelled(soloGoalId);
    }

    /// @notice Submit or replace evidence before the personal goal deadline.
    function submitSoloGoalEvidence(
        uint256 soloGoalId,
        bytes32 digest,
        string calldata uri
    ) external {
        SoloGoal storage goal = _existingSoloGoal(soloGoalId);
        if (goal.status != SoloGoalStatus.Active) revert InvalidStatus();
        if (msg.sender != goal.owner) revert NotGoalOwner();
        if (block.timestamp >= goal.goalDeadline) revert GoalSubmissionClosed();
        if (digest == bytes32(0)) revert InvalidEvidence();

        uint256 uriLength = bytes(uri).length;
        if (uriLength == 0 || uriLength > MAX_EVIDENCE_URI_BYTES) revert InvalidEvidence();

        soloGoalEvidence[soloGoalId] = Evidence({
            digest: digest,
            uri: uri,
            submittedAt: block.timestamp,
            decision: ReviewDecision.Pending
        });

        emit SoloGoalEvidenceSubmitted(soloGoalId, msg.sender, digest, uri);
    }

    /// @notice Approve a completed personal goal and release its BOT to the original owner.
    function approveSoloGoal(uint256 soloGoalId) external {
        SoloGoal storage goal = _existingSoloGoal(soloGoalId);
        _requireOpenSoloGoalReview(goal);

        Evidence storage evidence = soloGoalEvidence[soloGoalId];
        if (evidence.digest == bytes32(0)) revert InvalidEvidence();

        goal.status = SoloGoalStatus.Approved;
        goal.resolvedAt = block.timestamp;
        goal.resolutionDigest = evidence.digest;
        evidence.decision = ReviewDecision.Approved;
        claimable[goal.owner] += goal.amount;

        emit SoloGoalApproved(soloGoalId, goal.owner, msg.sender, goal.amount);
    }

    /// @notice Reject a personal goal and forfeit its BOT to the neutral recipient.
    function rejectSoloGoal(uint256 soloGoalId, bytes32 reasonDigest) external {
        SoloGoal storage goal = _existingSoloGoal(soloGoalId);
        _requireOpenSoloGoalReview(goal);
        if (reasonDigest == bytes32(0)) revert InvalidEvidence();

        goal.status = SoloGoalStatus.Rejected;
        goal.resolvedAt = block.timestamp;
        goal.resolutionDigest = reasonDigest;
        soloGoalEvidence[soloGoalId].decision = ReviewDecision.Rejected;
        claimable[goal.failureRecipient] += goal.amount;

        emit SoloGoalRejected(
            soloGoalId,
            msg.sender,
            goal.failureRecipient,
            goal.amount,
            reasonDigest
        );
    }

    /// @notice Settle an ignored review after its deadline by forfeiting to the neutral recipient.
    function finalizeExpiredSoloGoal(uint256 soloGoalId) external {
        SoloGoal storage goal = _existingSoloGoal(soloGoalId);
        if (goal.status != SoloGoalStatus.Active) revert InvalidStatus();
        if (block.timestamp <= goal.reviewDeadline) revert GoalNotExpired();

        goal.status = SoloGoalStatus.Expired;
        goal.resolvedAt = block.timestamp;
        claimable[goal.failureRecipient] += goal.amount;

        emit SoloGoalExpired(soloGoalId, goal.failureRecipient, goal.amount);
    }

    /// @notice Accept an invitation by matching the creator's BOT stake.
    function joinChallenge(uint256 challengeId) external payable {
        Challenge storage challenge = _existingChallenge(challengeId);
        if (challenge.status != ChallengeStatus.Pending) revert InvalidStatus();
        if (msg.sender != challenge.partner) revert NotInvitedPartner();
        if (msg.value != challenge.stakeAmount) revert InvalidStake();

        challenge.startTime = block.timestamp;
        challenge.endTime = block.timestamp + uint256(challenge.durationDays) * 1 days;
        if (challenge.verificationMode == VerificationMode.PartnerReview) {
            challenge.reviewDeadline = challenge.endTime + uint256(challenge.reviewPeriod);
        }
        challenge.status = ChallengeStatus.Active;

        emit ChallengeJoined(
            challengeId,
            challenge.startTime,
            challenge.endTime,
            challenge.reviewDeadline
        );
    }

    /// @notice Record one check-in during the current 24-hour challenge window.
    function checkIn(uint256 challengeId) external {
        Challenge storage challenge = _existingChallenge(challengeId);
        if (challenge.verificationMode != VerificationMode.DailyCheckIn) {
            revert WrongVerificationMode();
        }
        if (challenge.status != ChallengeStatus.Active) revert InvalidStatus();
        if (block.timestamp >= challenge.endTime) revert ChallengeEnded();
        _requireParticipant(challenge, msg.sender);

        uint256 dayIndex = (block.timestamp - challenge.startTime) / 1 days;
        if (checkIns[challengeId][msg.sender][dayIndex]) revert AlreadyCheckedIn();

        checkIns[challengeId][msg.sender][dayIndex] = true;
        if (msg.sender == challenge.creator) {
            ++challenge.creatorCheckIns;
        } else {
            ++challenge.partnerCheckIns;
        }

        emit CheckedIn(challengeId, msg.sender, dayIndex);
    }

    /// @notice Submit or replace the caller's evidence before the challenge deadline.
    /// @param digest Keccak-256 digest of the signed evidence record stored by the backend.
    /// @param uri HTTPS, IPFS, or Arweave pointer to the evidence record or attachment.
    function submitEvidence(uint256 challengeId, bytes32 digest, string calldata uri) external {
        Challenge storage challenge = _existingChallenge(challengeId);
        if (challenge.verificationMode != VerificationMode.PartnerReview) {
            revert WrongVerificationMode();
        }
        if (challenge.status != ChallengeStatus.Active) revert InvalidStatus();
        if (block.timestamp >= challenge.endTime) revert ChallengeEnded();
        _requireParticipant(challenge, msg.sender);
        if (digest == bytes32(0)) revert InvalidEvidence();

        uint256 uriLength = bytes(uri).length;
        if (uriLength == 0 || uriLength > MAX_EVIDENCE_URI_BYTES) revert InvalidEvidence();

        evidenceByParticipant[challengeId][msg.sender] = Evidence({
            digest: digest,
            uri: uri,
            submittedAt: block.timestamp,
            decision: ReviewDecision.Pending
        });

        emit EvidenceSubmitted(challengeId, msg.sender, digest, uri);
    }

    /// @notice Review the other participant's evidence during the agreed review window.
    function reviewEvidence(uint256 challengeId, address participant, bool approved) external {
        Challenge storage challenge = _existingChallenge(challengeId);
        if (challenge.verificationMode != VerificationMode.PartnerReview) {
            revert WrongVerificationMode();
        }
        if (challenge.status != ChallengeStatus.Active) revert InvalidStatus();
        if (block.timestamp < challenge.endTime) revert ChallengeNotEnded();
        if (block.timestamp > challenge.reviewDeadline) revert ReviewWindowClosed();

        address expectedReviewer;
        if (participant == challenge.creator) {
            expectedReviewer = challenge.partner;
        } else if (participant == challenge.partner) {
            expectedReviewer = challenge.creator;
        } else {
            revert NotParticipant();
        }
        if (msg.sender != expectedReviewer) revert NotReviewer();

        Evidence storage submittedEvidence = evidenceByParticipant[challengeId][participant];
        if (submittedEvidence.digest == bytes32(0)) revert InvalidEvidence();
        if (submittedEvidence.decision != ReviewDecision.Pending) revert AlreadyReviewed();

        submittedEvidence.decision = approved
            ? ReviewDecision.Approved
            : ReviewDecision.Rejected;

        emit EvidenceReviewed(challengeId, msg.sender, participant, submittedEvidence.decision);
    }

    /// @notice Resolve a finished challenge and credit pull-based payouts.
    /// @dev Anyone may finalize. Submitted but unreviewed evidence auto-approves after the review deadline.
    function finalizeChallenge(uint256 challengeId) external {
        Challenge storage challenge = _existingChallenge(challengeId);
        if (challenge.status != ChallengeStatus.Active) revert InvalidStatus();
        if (block.timestamp < challenge.endTime) revert ChallengeNotEnded();

        bool creatorSucceeded;
        bool partnerSucceeded;

        if (challenge.verificationMode == VerificationMode.DailyCheckIn) {
            creatorSucceeded = challenge.creatorCheckIns >= challenge.requiredCheckIns;
            partnerSucceeded = challenge.partnerCheckIns >= challenge.requiredCheckIns;
        } else {
            if (
                block.timestamp < challenge.reviewDeadline &&
                !_allSubmittedEvidenceReviewed(challengeId, challenge)
            ) {
                revert ReviewStillOpen();
            }

            if (block.timestamp >= challenge.reviewDeadline) {
                _autoApprovePendingEvidence(challengeId, challenge.creator);
                _autoApprovePendingEvidence(challengeId, challenge.partner);
            }

            creatorSucceeded = _evidenceSucceeded(challengeId, challenge.creator);
            partnerSucceeded = _evidenceSucceeded(challengeId, challenge.partner);
        }

        challenge.status = ChallengeStatus.Finalized;
        challenge.outcome = _outcomeFor(creatorSucceeded, partnerSucceeded);
        _creditPayouts(challenge, creatorSucceeded, partnerSucceeded);

        emit ChallengeFinalized(
            challengeId,
            challenge.outcome,
            creatorSucceeded,
            partnerSucceeded
        );
    }

    /// @notice Cancel an invitation that has not been accepted and recover the creator's stake.
    function cancelUnjoinedChallenge(uint256 challengeId) external {
        Challenge storage challenge = _existingChallenge(challengeId);
        if (msg.sender != challenge.creator) revert NotCreator();
        if (challenge.status != ChallengeStatus.Pending) revert InvalidStatus();

        challenge.status = ChallengeStatus.Cancelled;
        claimable[challenge.creator] += challenge.stakeAmount;

        emit ChallengeCancelled(challengeId);
    }

    /// @notice Withdraw all BOT currently credited to the caller.
    function withdrawPayout() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        claimable[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit PayoutWithdrawn(msg.sender, amount);
    }

    function hasCheckedIn(
        uint256 challengeId,
        address participant,
        uint256 dayIndex
    ) external view returns (bool) {
        if (challengeId == 0 || challengeId > challengeCount) revert ChallengeNotFound();
        return checkIns[challengeId][participant][dayIndex];
    }

    function currentDayIndex(uint256 challengeId) external view returns (uint256) {
        Challenge storage challenge = _existingChallenge(challengeId);
        if (challenge.verificationMode != VerificationMode.DailyCheckIn) {
            revert WrongVerificationMode();
        }
        if (challenge.status != ChallengeStatus.Active) revert InvalidStatus();
        if (block.timestamp >= challenge.endTime) revert ChallengeEnded();
        return (block.timestamp - challenge.startTime) / 1 days;
    }

    function _createChallenge(
        address partner,
        address forfeitureRecipient,
        uint16 durationDays,
        uint16 requiredCheckIns,
        uint32 reviewPeriod,
        VerificationMode verificationMode,
        PayoutMode payoutMode,
        string calldata title
    ) private returns (uint256 challengeId) {
        if (partner == address(0) || forfeitureRecipient == address(0)) revert InvalidAddress();
        if (
            partner == msg.sender ||
            forfeitureRecipient == msg.sender ||
            forfeitureRecipient == partner
        ) revert InvalidAddress();
        if (msg.value == 0) revert InvalidStake();
        if (durationDays == 0 || durationDays > MAX_DURATION_DAYS) revert InvalidDuration();

        uint256 titleLength = bytes(title).length;
        if (titleLength == 0 || titleLength > MAX_TITLE_BYTES) revert InvalidTitle();

        challengeId = ++challengeCount;
        Challenge storage challenge = challenges[challengeId];
        challenge.creator = msg.sender;
        challenge.partner = partner;
        challenge.forfeitureRecipient = forfeitureRecipient;
        challenge.stakeAmount = msg.value;
        challenge.createdAt = block.timestamp;
        challenge.durationDays = durationDays;
        challenge.requiredCheckIns = requiredCheckIns;
        challenge.status = ChallengeStatus.Pending;
        challenge.title = title;
        challenge.verificationMode = verificationMode;
        challenge.payoutMode = payoutMode;
        challenge.reviewPeriod = reviewPeriod;

        emit ChallengeCreated(
            challengeId,
            msg.sender,
            partner,
            msg.value,
            durationDays,
            requiredCheckIns,
            forfeitureRecipient,
            verificationMode,
            payoutMode,
            reviewPeriod,
            title
        );
    }

    function _creditPayouts(
        Challenge storage challenge,
        bool creatorSucceeded,
        bool partnerSucceeded
    ) private {
        uint256 stake = challenge.stakeAmount;

        if (challenge.payoutMode == PayoutMode.WinnerTakesPool) {
            if (creatorSucceeded && partnerSucceeded) {
                claimable[challenge.creator] += stake;
                claimable[challenge.partner] += stake;
            } else if (creatorSucceeded) {
                claimable[challenge.creator] += stake * 2;
            } else if (partnerSucceeded) {
                claimable[challenge.partner] += stake * 2;
            } else {
                claimable[challenge.forfeitureRecipient] += stake * 2;
            }
            return;
        }

        if (creatorSucceeded) {
            claimable[challenge.creator] += stake;
        } else {
            claimable[challenge.forfeitureRecipient] += stake;
        }

        if (partnerSucceeded) {
            claimable[challenge.partner] += stake;
        } else {
            claimable[challenge.forfeitureRecipient] += stake;
        }
    }

    function _allSubmittedEvidenceReviewed(
        uint256 challengeId,
        Challenge storage challenge
    ) private view returns (bool) {
        Evidence storage creatorEvidence = evidenceByParticipant[challengeId][challenge.creator];
        Evidence storage partnerEvidence = evidenceByParticipant[challengeId][challenge.partner];

        bool creatorReady = creatorEvidence.digest == bytes32(0) ||
            creatorEvidence.decision != ReviewDecision.Pending;
        bool partnerReady = partnerEvidence.digest == bytes32(0) ||
            partnerEvidence.decision != ReviewDecision.Pending;
        return creatorReady && partnerReady;
    }

    function _autoApprovePendingEvidence(uint256 challengeId, address participant) private {
        Evidence storage submittedEvidence = evidenceByParticipant[challengeId][participant];
        if (
            submittedEvidence.digest != bytes32(0) &&
            submittedEvidence.decision == ReviewDecision.Pending
        ) {
            submittedEvidence.decision = ReviewDecision.Approved;
            emit EvidenceAutoApproved(challengeId, participant);
        }
    }

    function _evidenceSucceeded(
        uint256 challengeId,
        address participant
    ) private view returns (bool) {
        Evidence storage submittedEvidence = evidenceByParticipant[challengeId][participant];
        return
            submittedEvidence.digest != bytes32(0) &&
            submittedEvidence.decision == ReviewDecision.Approved;
    }

    function _outcomeFor(
        bool creatorSucceeded,
        bool partnerSucceeded
    ) private pure returns (ChallengeOutcome) {
        if (creatorSucceeded && partnerSucceeded) return ChallengeOutcome.BothSucceeded;
        if (creatorSucceeded) return ChallengeOutcome.CreatorSucceeded;
        if (partnerSucceeded) return ChallengeOutcome.PartnerSucceeded;
        return ChallengeOutcome.BothFailed;
    }

    function _requireParticipant(Challenge storage challenge, address account) private view {
        if (account != challenge.creator && account != challenge.partner) revert NotParticipant();
    }

    function _requireOpenSoloGoalReview(SoloGoal storage goal) private view {
        if (goal.status != SoloGoalStatus.Active) revert InvalidStatus();
        if (msg.sender != goal.verifier) revert NotGoalVerifier();
        if (block.timestamp < goal.goalDeadline) revert ApprovalTooEarly();
        if (block.timestamp > goal.reviewDeadline) revert ReviewWindowClosed();
    }

    function _existingChallenge(uint256 challengeId) private view returns (Challenge storage challenge) {
        if (challengeId == 0 || challengeId > challengeCount) revert ChallengeNotFound();
        return challenges[challengeId];
    }

    function _existingSoloGoal(uint256 soloGoalId) private view returns (SoloGoal storage goal) {
        if (soloGoalId == 0 || soloGoalId > soloGoalCount) revert SoloGoalNotFound();
        return soloGoals[soloGoalId];
    }

    receive() external payable {
        revert DirectPaymentsDisabled();
    }

    fallback() external payable {
        revert DirectPaymentsDisabled();
    }
}
