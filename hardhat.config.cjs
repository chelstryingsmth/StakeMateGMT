require("@nomicfoundation/hardhat-ethers");

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    botTestnet: {
      url: "https://rpc.bohr.life",
      chainId: 968,
      accounts: privateKey ? [privateKey] : [],
    },
    botMainnet: {
      url: "https://rpc.botchain.ai",
      chainId: 677,
      accounts: privateKey ? [privateKey] : [],
    },
  },
};
