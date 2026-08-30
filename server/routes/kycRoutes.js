/**
 * KYC API & Admin Compliance Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides secure endpoints for document upload, KYC application submission,
 * status inquiries, and server-authoritative admin review & promotion.
 */

'use strict';

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const kycService = require("../services/kycService");
const { requireAuth, requireKycReviewerPermission } = require("../middleware/authMiddleware");
const logger = require("../utils/logger");

// Multer memory storage configuration for file upload inspection
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB Max File Size
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowedMimeTypes.includes(file.mimetype) || !allowedExtensions.includes(ext)) {
      return cb(new Error("UNSUPPORTED_FILE_TYPE: Only PDF, JPG, PNG, and WEBP documents under 5MB are allowed."));
    }
    cb(null, true);
  },
});

// ── USER ENDPOINTS ───────────────────────────────────────────────────────────
const fs = require("fs");

// Helper to ensure kyc-documents bucket exists in Supabase Storage
const ensureBucketExists = async (bucketName = "kyc-documents") => {
  try {
    const supabase = require("../config/database");
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === bucketName)) {
      await supabase.storage.createBucket(bucketName, { public: false });
    }
  } catch (e) {
    logger.warn(`[KycRoutes] Bucket check/create notice: ${e.message}`);
  }
};

/**
 * POST /api/kyc/documents/upload
 * Secure private document upload endpoint
 */
router.post("/documents/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const documentType = req.body.documentType || "document";

    if (!file) {
      return res.status(400).json({ error: "NO_FILE_PROVIDED: Please select a file to upload." });
    }

    if (!["government_id", "utility_bill", "idCard", "utilityBill"].includes(documentType)) {
      return res.status(400).json({ error: "INVALID_DOCUMENT_TYPE: Document type must be government_id or utility_bill." });
    }

    const userId = req.user.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    const storagePath = `kyc/${userId}/${timestamp}_${documentType}${ext}`;

    await ensureBucketExists("kyc-documents");

    // Local Disk Fallback Backup
    const localDir = path.join(__dirname, "../uploads", `kyc/${userId}`);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localFilePath = path.join(localDir, `${timestamp}_${documentType}${ext}`);
    try {
      fs.writeFileSync(localFilePath, file.buffer);
    } catch (e) {
      logger.warn(`[KycRoutes] Local disk backup write notice: ${e.message}`);
    }

    // Upload to Supabase Storage private bucket
    const supabase = require("../config/database");
    const { error: uploadErr } = await supabase.storage
      .from("kyc-documents")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadErr) {
      logger.error(`[KycRoutes] Supabase storage upload failed: ${uploadErr.message}`);
    }

    return res.status(200).json({
      success: true,
      storagePath,
      fileName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });
  } catch (err) {
    logger.error(`[KycRoutes] Upload error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/kyc/documents/stream
 * Secure stream/download endpoint for viewing uploaded KYC documents
 */
router.get("/documents/stream", requireAuth, async (req, res) => {
  try {
    const storagePath = req.query.path;
    if (!storagePath) {
      return res.status(400).json({ error: "MISSING_PATH: Storage path parameter is required." });
    }

    // Verify permission: Must be owner of document or compliance reviewer/admin
    const userId = req.user.id;
    const isOwner = storagePath.includes(`kyc/${userId}/`);
    let isReviewer = false;

    if (!isOwner) {
      try {
        const supabase = require("../config/database");
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, plan_tier, can_review_kyc")
          .eq("id", userId)
          .maybeSingle();

        isReviewer = Boolean(
          profile?.can_review_kyc ||
          profile?.role === "admin" ||
          profile?.role === "compliance_officer" ||
          profile?.plan_tier === "admin"
        );
      } catch (e) {}
    }

    if (!isOwner && !isReviewer) {
      return res.status(403).json({ error: "UNAUTHORIZED_DOCUMENT_ACCESS: Access to document denied." });
    }

    await ensureBucketExists("kyc-documents");
    const supabase = require("../config/database");
    
    // Download document from Supabase storage
    const { data: blobData, error: downloadErr } = await supabase.storage
      .from("kyc-documents")
      .download(storagePath);

    let buffer = null;

    if (!downloadErr && blobData) {
      const arrayBuffer = await blobData.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      // Local Disk Fallback check
      const localFilePath = path.join(__dirname, "../uploads", storagePath);
      if (fs.existsSync(localFilePath)) {
        buffer = fs.readFileSync(localFilePath);
      }
    }

    if (!buffer) {
      return res.status(404).json({
        error: "DOCUMENT_NOT_FOUND: The requested document file is not present in storage. Please request resubmission from the user."
      });
    }
    
    const ext = path.extname(storagePath).toLowerCase();
    const contentTypeMap = {
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };
    
    res.setHeader("Content-Type", contentTypeMap[ext] || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(storagePath)}"`);
    return res.send(buffer);
  } catch (err) {
    logger.error(`[KycRoutes] Stream document error: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/kyc/submit
 * Submit a new KYC verification request (status: PENDING_REVIEW)
 */
router.post("/submit", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestedTier, bvn, dob, governmentIdStoragePath, utilityBillStoragePath, residentialAddress, occupation, autoApprove } = req.body;

    const request = await kycService.submitKycRequest({
      userId,
      requestedTier,
      bvn,
      dob,
      governmentIdStoragePath,
      utilityBillStoragePath,
      residentialAddress,
      occupation,
      autoApprove,
    });

    return res.status(201).json({
      success: true,
      message: "Your KYC verification request has been submitted for compliance review.",
      request,
    });
  } catch (err) {
    logger.error(`[KycRoutes] Submit error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/kyc/my-request
 * Fetch user's current approved kyc_level and pending request
 */
router.get("/my-request", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const status = await kycService.getUserKycStatus(userId);
    return res.status(200).json(status);
  } catch (err) {
    logger.error(`[KycRoutes] Get status error: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// ── ADMIN / REVIEWER ENDPOINTS ──────────────────────────────────────────────

/**
 * GET /api/admin/kyc/pending
 * List pending KYC review requests
 */
router.get("/admin/pending", requireAuth, requireKycReviewerPermission, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50", 10);
    const offset = parseInt(req.query.offset || "0", 10);
    const requests = await kycService.getPendingKycRequests({ limit, offset });
    return res.status(200).json({ success: true, count: requests.length, requests });
  } catch (err) {
    logger.error(`[KycRoutes] Admin list pending error: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/kyc/:requestId
 * Fetch single KYC request details with short-lived signed URLs
 */
router.get("/admin/:requestId", requireAuth, requireKycReviewerPermission, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const request = await kycService.getKycRequestById(requestId, req.user.id, true);
    return res.status(200).json({ success: true, request });
  } catch (err) {
    logger.error(`[KycRoutes] Admin get request error: ${err.message}`);
    return res.status(404).json({ error: err.message });
  }
});

/**
 * POST /api/admin/kyc/:requestId/approve
 * Server-Authoritative Approval & Profile Tier Promotion
 */
router.post("/admin/:requestId/approve", requireAuth, requireKycReviewerPermission, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const reviewerId = req.user.id;
    const notes = req.body.notes || "";

    const request = await kycService.approveKycRequest({ requestId, reviewerId, notes });
    return res.status(200).json({
      success: true,
      message: `KYC request ${requestId} approved and user promoted to Tier ${request.requested_tier}.`,
      request,
    });
  } catch (err) {
    logger.error(`[KycRoutes] Admin approve error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/kyc/:requestId/reject
 * Reject KYC Request
 */
router.post("/admin/:requestId/reject", requireAuth, requireKycReviewerPermission, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const reviewerId = req.user.id;
    const { reason, notes } = req.body;

    const request = await kycService.rejectKycRequest({ requestId, reviewerId, reason, notes });
    return res.status(200).json({
      success: true,
      message: `KYC request ${requestId} rejected.`,
      request,
    });
  } catch (err) {
    logger.error(`[KycRoutes] Admin reject error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/kyc/:requestId/resubmit
 * Request KYC Resubmission
 */
router.post("/admin/:requestId/resubmit", requireAuth, requireKycReviewerPermission, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const reviewerId = req.user.id;
    const { reason, notes } = req.body;

    const request = await kycService.requestKycResubmission({ requestId, reviewerId, reason, notes });
    return res.status(200).json({
      success: true,
      message: `KYC request ${requestId} marked for resubmission.`,
      request,
    });
  } catch (err) {
    logger.error(`[KycRoutes] Admin resubmit error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
