const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Wallet } = require("ethers");
const { createStakeMateServer } = require("../src/server");

async function postJson(baseUrl, pathname, body) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("prepares, verifies, stores, and retrieves signed evidence", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "stakemate-test-"));
  const { server } = await createStakeMateServer({
    storePath: path.join(temporaryDirectory, "evidence.json"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const participant = Wallet.createRandom();
  const contractAddress = Wallet.createRandom().address;
  const evidence = {
    chainId: 968,
    contractAddress,
    challengeId: "7",
    participant: participant.address,
    uri: "ipfs://bafybeigdyrzt/study-session.json",
    note: "Completed the planned two-hour study session.",
    issuedAt: Date.now(),
  };

  const preparedResponse = await postJson(baseUrl, "/api/evidence/prepare", evidence);
  assert.equal(preparedResponse.status, 200);
  const prepared = await preparedResponse.json();
  assert.match(prepared.digest, /^0x[0-9a-f]{64}$/);

  const signature = await participant.signMessage(prepared.signingMessage);
  const submissionResponse = await postJson(baseUrl, "/api/evidence", {
    ...evidence,
    signature,
  });
  assert.equal(submissionResponse.status, 201);
  const submission = await submissionResponse.json();
  assert.equal(submission.record.digest, prepared.digest);
  assert.equal(submission.record.signer, participant.address);

  const retrievalResponse = await fetch(
    `${baseUrl}/api/evidence/968/${contractAddress}/7?participant=${participant.address}`
  );
  assert.equal(retrievalResponse.status, 200);
  const retrieval = await retrievalResponse.json();
  assert.equal(retrieval.records.length, 1);
  assert.equal(retrieval.records[0].note, evidence.note);

  const healthResponse = await fetch(`${baseUrl}/health`);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.storedEvidence, 1);
});

test("rejects a signature from a different wallet", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "stakemate-test-"));
  const { server } = await createStakeMateServer({
    storePath: path.join(temporaryDirectory, "evidence.json"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const participant = Wallet.createRandom();
  const attacker = Wallet.createRandom();
  const evidence = {
    chainId: 677,
    contractAddress: Wallet.createRandom().address,
    challengeId: "11",
    participant: participant.address,
    uri: "https://example.com/evidence/11",
    note: "Signed by the wrong wallet",
    issuedAt: Date.now(),
  };

  const prepared = await (await postJson(baseUrl, "/api/evidence/prepare", evidence)).json();
  const forgedSignature = await attacker.signMessage(prepared.signingMessage);
  const response = await postJson(baseUrl, "/api/evidence", {
    ...evidence,
    signature: forgedSignature,
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "signature does not belong to participant");
});

test("stores solo-goal evidence in a separate commitment namespace", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "stakemate-test-"));
  const { server } = await createStakeMateServer({
    storePath: path.join(temporaryDirectory, "evidence.json"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const owner = Wallet.createRandom();
  const contractAddress = Wallet.createRandom().address;
  const evidence = {
    commitmentType: "solo-goal",
    soloGoalId: "3",
    chainId: 968,
    contractAddress,
    participant: owner.address,
    uri: "ipfs://bafybeigdyrzt/solo-goal.json",
    note: "Finished the certification and attached the certificate.",
    issuedAt: Date.now(),
  };

  const prepared = await (
    await postJson(baseUrl, "/api/evidence/prepare", evidence)
  ).json();
  const signature = await owner.signMessage(prepared.signingMessage);
  const storedResponse = await postJson(baseUrl, "/api/evidence", {
    ...evidence,
    signature,
  });
  assert.equal(storedResponse.status, 201);

  const retrievalResponse = await fetch(
    `${baseUrl}/api/solo-goal-evidence/968/${contractAddress}/3`
  );
  assert.equal(retrievalResponse.status, 200);
  const retrieval = await retrievalResponse.json();
  assert.equal(retrieval.records.length, 1);
  assert.equal(retrieval.records[0].commitmentType, "solo-goal");
  assert.equal(retrieval.records[0].soloGoalId, "3");
});

test("rejects malformed commitment ids with a validation error", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "stakemate-test-"));
  const { server } = await createStakeMateServer({
    storePath: path.join(temporaryDirectory, "evidence.json"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const participant = Wallet.createRandom();
  const response = await postJson(baseUrl, "/api/evidence/prepare", {
    chainId: 968,
    contractAddress: Wallet.createRandom().address,
    challengeId: "not-a-number",
    participant: participant.address,
    uri: "https://example.com/evidence",
    issuedAt: Date.now(),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /positive integer/i);
});

test("rejects evidence for a different configured chain or contract", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "stakemate-test-"));
  const contractAddress = Wallet.createRandom().address;
  const { server } = await createStakeMateServer({
    storePath: path.join(temporaryDirectory, "evidence.json"),
    chainId: 677,
    contractAddress,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const participant = Wallet.createRandom();
  const baseEvidence = {
    chainId: 677,
    contractAddress,
    challengeId: "1",
    participant: participant.address,
    uri: "https://example.com/evidence/1",
    issuedAt: Date.now(),
  };

  const wrongChain = await postJson(baseUrl, "/api/evidence/prepare", {
    ...baseEvidence,
    chainId: 968,
  });
  assert.equal(wrongChain.status, 400);
  assert.match((await wrongChain.json()).error, /chain ID 677/i);

  const wrongContract = await postJson(baseUrl, "/api/evidence/prepare", {
    ...baseEvidence,
    contractAddress: Wallet.createRandom().address,
  });
  assert.equal(wrongContract.status, 400);
  assert.match((await wrongContract.json()).error, /configured StakeMate contract/i);
});
