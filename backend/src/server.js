const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { getAddress, isAddress } = require("ethers");
const {
  EvidenceValidationError,
  prepareEvidence,
  verifyEvidenceSubmission,
} = require("./evidence");
const { EvidenceStore } = require("./store");
const { createChainReader } = require("./chain");

const MAX_BODY_BYTES = 64 * 1_024;

function sendJson(response, statusCode, payload, origin = "*") {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": origin,
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new EvidenceValidationError("request body exceeds 64 KiB", 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new EvidenceValidationError("request body must be valid JSON");
  }
}

function evidenceRouteParts(pathname) {
  const match = pathname.match(
    /^\/api\/evidence\/(\d+)\/(0x[0-9a-fA-F]{40})\/(\d+)$/
  );
  if (!match) return null;
  return { chainId: Number(match[1]), contractAddress: match[2], challengeId: match[3] };
}

function soloEvidenceRouteParts(pathname) {
  const match = pathname.match(
    /^\/api\/solo-goal-evidence\/(\d+)\/(0x[0-9a-fA-F]{40})\/(\d+)$/
  );
  if (!match) return null;
  return { chainId: Number(match[1]), contractAddress: match[2], soloGoalId: match[3] };
}

function createDeploymentPolicy({ chainId, contractAddress }) {
  const configuredChainId = chainId == null || chainId === "" ? null : Number(chainId);
  if (
    configuredChainId !== null &&
    (!Number.isSafeInteger(configuredChainId) || configuredChainId <= 0)
  ) {
    throw new Error("BOT_CHAIN_ID must be a positive integer");
  }

  const configuredContract = contractAddress || null;
  if (configuredContract && !isAddress(configuredContract)) {
    throw new Error("STAKEMATE_CONTRACT_ADDRESS must be a valid EVM address");
  }

  const normalizedContract = configuredContract
    ? getAddress(configuredContract)
    : null;

  return {
    chainId: configuredChainId,
    contractAddress: normalizedContract,
    assertAllowed(input) {
      if (configuredChainId !== null && Number(input?.chainId) !== configuredChainId) {
        throw new EvidenceValidationError(
          `evidence must target configured chain ID ${configuredChainId}`
        );
      }
      if (
        normalizedContract &&
        (!isAddress(input?.contractAddress) ||
          getAddress(input.contractAddress) !== normalizedContract)
      ) {
        throw new EvidenceValidationError(
          "evidence must target the configured StakeMate contract"
        );
      }
    },
  };
}

async function createStakeMateServer(options = {}) {
  const storePath =
    options.storePath ??
    process.env.EVIDENCE_STORE_PATH ??
    path.join(__dirname, "..", "data", "evidence.json");
  const allowedOrigin = options.allowedOrigin ?? process.env.CORS_ORIGIN ?? "*";
  const configuredContractAddress =
    options.contractAddress ?? process.env.STAKEMATE_CONTRACT_ADDRESS;
  const deploymentPolicy = createDeploymentPolicy({
    chainId: options.chainId ?? process.env.BOT_CHAIN_ID,
    contractAddress: configuredContractAddress,
  });
  const store = await new EvidenceStore(storePath).init();
  const chainReader = createChainReader({
    rpcUrl: options.rpcUrl ?? process.env.BOT_RPC_URL,
    contractAddress: configuredContractAddress,
  });

  const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-origin": allowedOrigin,
      });
      response.end();
      return;
    }

    try {
      const requestUrl = new URL(request.url, "http://localhost");

      if (request.method === "GET" && requestUrl.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          service: "stakemate-evidence",
          storedEvidence: store.count,
          chainReaderConfigured: Boolean(chainReader),
        }, allowedOrigin);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/evidence/prepare") {
        const input = await readJson(request);
        deploymentPolicy.assertAllowed(input);
        const prepared = prepareEvidence(input);
        sendJson(response, 200, prepared, allowedOrigin);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/evidence") {
        const input = await readJson(request);
        deploymentPolicy.assertAllowed(input);
        const verified = verifyEvidenceSubmission(input);
        const record = {
          ...verified.evidence,
          digest: verified.digest,
          signingMessage: verified.signingMessage,
          signature: verified.signature,
          signer: verified.signer,
          receivedAt: Date.now(),
        };
        const stored = await store.append(record);
        sendJson(response, stored.inserted ? 201 : 200, stored, allowedOrigin);
        return;
      }

      const evidenceParts = evidenceRouteParts(requestUrl.pathname);
      if (request.method === "GET" && evidenceParts) {
        if (!isAddress(evidenceParts.contractAddress)) {
          throw new EvidenceValidationError("contract address is invalid");
        }
        const participant = requestUrl.searchParams.get("participant") ?? undefined;
        if (participant && !isAddress(participant)) {
          throw new EvidenceValidationError("participant address is invalid");
        }
        const records = store.find({ ...evidenceParts, participant });
        sendJson(response, 200, { records }, allowedOrigin);
        return;
      }

      const soloEvidenceParts = soloEvidenceRouteParts(requestUrl.pathname);
      if (request.method === "GET" && soloEvidenceParts) {
        if (!isAddress(soloEvidenceParts.contractAddress)) {
          throw new EvidenceValidationError("contract address is invalid");
        }
        const participant = requestUrl.searchParams.get("participant") ?? undefined;
        if (participant && !isAddress(participant)) {
          throw new EvidenceValidationError("participant address is invalid");
        }
        const records = store.find({
          ...soloEvidenceParts,
          commitmentType: "solo-goal",
          participant,
        });
        sendJson(response, 200, { records }, allowedOrigin);
        return;
      }

      const challengeMatch = requestUrl.pathname.match(/^\/api\/challenges\/(\d+)$/);
      if (request.method === "GET" && challengeMatch) {
        if (!chainReader) {
          sendJson(response, 503, {
            error: "Chain reader is not configured",
            requiredEnvironment: ["BOT_RPC_URL", "STAKEMATE_CONTRACT_ADDRESS"],
          }, allowedOrigin);
          return;
        }
        const challenge = await chainReader.getChallenge(challengeMatch[1]);
        if (!challenge) {
          sendJson(response, 404, { error: "Challenge not found" }, allowedOrigin);
          return;
        }
        const evidenceRecords = store.find({
          contractAddress: chainReader.address,
          challengeId: challenge.id,
        });
        sendJson(response, 200, { challenge, evidenceRecords }, allowedOrigin);
        return;
      }

      const soloGoalMatch = requestUrl.pathname.match(/^\/api\/solo-goals\/(\d+)$/);
      if (request.method === "GET" && soloGoalMatch) {
        if (!chainReader) {
          sendJson(response, 503, {
            error: "Chain reader is not configured",
            requiredEnvironment: ["BOT_RPC_URL", "STAKEMATE_CONTRACT_ADDRESS"],
          }, allowedOrigin);
          return;
        }
        const soloGoal = await chainReader.getSoloGoal(soloGoalMatch[1]);
        if (!soloGoal) {
          sendJson(response, 404, { error: "Solo goal not found" }, allowedOrigin);
          return;
        }
        const evidenceRecords = store.find({
          contractAddress: chainReader.address,
          commitmentType: "solo-goal",
          commitmentId: soloGoal.id,
        });
        sendJson(response, 200, { soloGoal, evidenceRecords }, allowedOrigin);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/challenges") {
        if (!chainReader) {
          sendJson(response, 503, {
            error: "Chain reader is not configured",
            requiredEnvironment: ["BOT_RPC_URL", "STAKEMATE_CONTRACT_ADDRESS"],
          }, allowedOrigin);
          return;
        }
        const challenges = await chainReader.listRecent(requestUrl.searchParams.get("limit"));
        sendJson(response, 200, { challenges }, allowedOrigin);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/solo-goals") {
        if (!chainReader) {
          sendJson(response, 503, {
            error: "Chain reader is not configured",
            requiredEnvironment: ["BOT_RPC_URL", "STAKEMATE_CONTRACT_ADDRESS"],
          }, allowedOrigin);
          return;
        }
        const soloGoals = await chainReader.listRecentSoloGoals(
          requestUrl.searchParams.get("limit")
        );
        sendJson(response, 200, { soloGoals }, allowedOrigin);
        return;
      }

      sendJson(response, 404, { error: "Route not found" }, allowedOrigin);
    } catch (error) {
      const statusCode = error.statusCode ?? 500;
      const message = statusCode >= 500 ? "Internal server error" : error.message;
      if (statusCode >= 500) console.error(error);
      sendJson(response, statusCode, { error: message }, allowedOrigin);
    }
  });

  return { server, store, chainReader };
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 8787);
  createStakeMateServer()
    .then(({ server }) => {
      server.listen(port, "0.0.0.0", () => {
        console.log(`StakeMate evidence API listening on http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { createStakeMateServer };
