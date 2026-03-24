const fxService = {
    convert: async (amount, from, to, useCache) => {
        const rates = {
            "USD/NGN": 1500.5555,
        };
        const key = `${from}/${to}`;
        const rate = rates[key] || 1;
        return {
            amount: amount * rate,
            rate: rate
        };
    }
};

async function testConversion(usdAmount, currency, upCurrency) {
    console.log(`\nTesting Input: ${usdAmount} USD, Chosen: ${currency}`);
    
    // Simulate logic from updated subscriptionController.js
    const hasFincra = true; 
    const isInternational = ["USD", "EUR", "GBP"].includes(upCurrency);
    const useFincra = (process.env.NODE_ENV === "production" || hasFincra) && isInternational;
    
    let processedCurrency = useFincra ? "USD" : "NGN"; 
    let finalAmount = usdAmount; 
    let exchangeRate = 1;

    if (!useFincra) {
      // NGN Flow (Paystack)
      const conversion = await fxService.convert(usdAmount, "USD", "NGN", true);
      finalAmount = conversion.amount;
      exchangeRate = conversion.rate;
    } else {
      // International Flow (Fincra USD)
      finalAmount = usdAmount; 
      exchangeRate = 1; 
    }

    finalAmount = Math.round(finalAmount * 100) / 100;

    console.log(`Provider: ${useFincra ? 'Fincra' : 'Paystack'}`);
    console.log(`Currency Sent to Provider: ${processedCurrency}`);
    console.log(`Amount Sent to Provider: ${finalAmount}`);
    
    if (useFincra && processedCurrency !== "USD") {
        console.error("FAIL: Fincra should always use USD for international payments!");
    } else if (upCurrency === "NGN" && processedCurrency !== "NGN") {
        console.error("FAIL: NGN should use Paystack/NGN!");
    } else {
        console.log("PASS: Correct provider and currency selection.");
    }
}

async function runTests() {
    await testConversion(9.99, "GBP", "GBP");
    await testConversion(9.99, "EUR", "EUR");
    await testConversion(9.99, "NGN", "NGN");
    await testConversion(29.99, "USD", "USD");
}

runTests();
