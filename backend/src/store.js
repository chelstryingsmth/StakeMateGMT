const fs = require("node:fs/promises");
const path = require("node:path");

class EvidenceStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { version: 1, records: [] };
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const stored = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      if (stored?.version !== 1 || !Array.isArray(stored.records)) {
        throw new Error("Unsupported evidence database format");
      }
      this.state = stored;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return this;
  }

  get count() {
    return this.state.records.length;
  }

  find({
    chainId,
    contractAddress,
    commitmentType,
    commitmentId,
    challengeId,
    soloGoalId,
    participant,
  }) {
    const contract = contractAddress?.toLowerCase();
    const account = participant?.toLowerCase();
    const expectedType =
      commitmentType ?? (soloGoalId != null ? "solo-goal" : challengeId != null ? "challenge" : null);
    const expectedId = commitmentId ?? soloGoalId ?? challengeId;
    return this.state.records.filter((record) => {
      const recordType = record.commitmentType ?? "challenge";
      const recordId = record.commitmentId ?? record.soloGoalId ?? record.challengeId;
      return (
        (chainId == null || record.chainId === Number(chainId)) &&
        (contract == null || record.contractAddress.toLowerCase() === contract) &&
        (expectedType == null || recordType === expectedType) &&
        (expectedId == null || recordId === String(expectedId)) &&
        (account == null || record.participant.toLowerCase() === account)
      );
    });
  }

  async append(record) {
    let result;
    this.writeQueue = this.writeQueue.then(async () => {
      const existing = this.state.records.find((item) => item.digest === record.digest);
      if (existing) {
        result = { inserted: false, record: existing };
        return;
      }

      this.state.records.push(record);
      await this.persist();
      result = { inserted: true, record };
    });
    await this.writeQueue;
    return result;
  }

  async persist() {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, this.filePath);
  }
}

module.exports = { EvidenceStore };
