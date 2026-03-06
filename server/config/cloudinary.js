const cloudinary = require("cloudinary").v2;
const env = require("./env");
const logger = require("../utils/logger");

if (env.CLOUDINARY_URL) {
  cloudinary.config();
  logger.info("Cloudinary configured successfully");
} else {
  logger.warn("Cloudinary URL not found. Image uploads might fail.");
}

module.exports = cloudinary;
