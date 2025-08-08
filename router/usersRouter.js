const express = require("express");
const {
  getOwnInfo,
  getUserInfo,
  editOwnInfo,
} = require("../controllers/usersController.js");

const router = express.Router();

//path: /api/users
router.get("/users/me", getOwnInfo);
router.get("/users/:userID", getUserInfo);
router.patch("/users/me", editOwnInfo);

// authRouter.post("/sign-in", signIn);
// authRouter.post("/sign-out", signOut);

module.exports = router;
