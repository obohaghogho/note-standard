const https = require("https");

https.get("https://www.google.com", (res) => {
  console.log("Status Code:", res.statusCode);
  res.on("data", () => {}); // consume
  res.on("end", () => {
    console.log("Done");
  });
}).on("error", (err) => {
  console.error("Error:", err.message);
});
