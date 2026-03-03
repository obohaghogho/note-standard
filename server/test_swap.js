// Mock test script to verify precision and fee calculation behavior
const { ethers } = require("ethers");
const mathUtils = require("./utils/mathUtils");
const commissionService = require("./services/commissionService");

// Let's simulate calculateSwapPreview locally
async function testSwapPricing() {
  console.log("--- SWAP PRICING TEST ---");

  const userId = "test-user-id";
  const amount = 2; // e.g. 2 USD -> ETH
  const finalPrice = 0.0003; // 1 USD = 0.0003 ETH

  // Simulate Fee Calculate (e.g. 1% fee on 2 USD = 0.02 USD)
  const fee = 0.02;
  const amountToSwap = amount - fee; // 1.98 USD

  console.log(`Input Amount: ${amount} USD`);
  console.log(`Fee: ${fee} USD`);
  console.log(`Amount To Swap: ${amountToSwap} USD`);

  // Execute Division (Old Bug style: amountToSwap / finalPrice instead of multiply)
  // Now with mathUtils multiply:
  const preciseAmountOut = mathUtils.multiply(amountToSwap, finalPrice);
  const formattedAmountOut = mathUtils.formatForCurrency(
    parseFloat(preciseAmountOut),
    "ETH",
  );

  console.log(`\nOld native map float: ${amountToSwap * finalPrice} ETH`);
  console.log(`Precise BigNumber Amount Out: ${preciseAmountOut} ETH`);
  console.log(`Formatted Output (ETH 18 decimals): ${formattedAmountOut} ETH`);

  // Let's do another one (Big ETH to USD)
  const ethAmount = 5;
  const ethPriceUsd = 3000;
  const preciseFiatOut = mathUtils.multiply(ethAmount - 0.05, ethPriceUsd); // deducting 0.05 ETH fee
  const formattedFiatOut = mathUtils.formatForCurrency(
    parseFloat(preciseFiatOut),
    "USD",
  );

  console.log(`\nETH Input: 5 ETH, Fee: 0.05 ETH => Net Swap = 4.95 ETH`);
  console.log(`Rate: 1 ETH = $3000 USD`);
  console.log(`BigNumber Exact Fiat Out: ${preciseFiatOut} USD`);
  console.log(`Formatted Output (USD 2 decimals): ${formattedFiatOut} USD`);
}

testSwapPricing().catch(console.error);
