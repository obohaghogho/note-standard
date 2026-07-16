const https = require("https");

https.get("https://api.nowpayments.io/v1/status", (res) => {
  console.log("Status Code:", res.statusCode);
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    console.log("Body:", data);
  });
}).on("error", (err) => {
  console.error("Error:", err.message);
});
