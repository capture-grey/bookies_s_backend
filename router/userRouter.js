const express = require("express");
const {
  getOwnInfo,
  getUserInfo,
  editOwnInfo,
} = require("../controllers/userController.js");
const { authenticate } = require("../middlewares/common/authMiddleware.js");

const router = express.Router();

//---> path: /api/user

router.get("/me", authenticate, getOwnInfo);
router.patch("/me", authenticate, editOwnInfo);
router.get("/:userId", getUserInfo);

module.exports = router;
