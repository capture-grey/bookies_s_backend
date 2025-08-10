const express = require("express");
const {
  createForum,
  getForumDetails,
  editDetails,
  joinForum,
  leaveForum,
  deleteForum,
  getMemberDetails,
  makeAdmin,
  removeUser,
  hideBook,
  unhideBook,
} = require("../controllers/forumController.js");

const { authenticate } = require("../middlewares/common/authMiddleware.js");

const router = express.Router();

//---> path: /api/forum

//forum action
router.post("/", authenticate, createForum);
router.get("/:forumId", authenticate, getForumDetails);
router.patch("/:forumId", authenticate, editDetails);
router.post("/join", authenticate, joinForum);
router.delete("/:forumId/leave", authenticate, leaveForum);
router.delete("/:forumId", authenticate, deleteForum);

//user action
router.get("/:forumId/users/:memberId", authenticate, getMemberDetails);
router.patch("/:forumId/users/:memberId", authenticate, makeAdmin);
router.delete("/:forumId/users/:memberId", authenticate, removeUser);

//book action
router.patch("/:forumId/books/:bookId/hide", authenticate, hideBook);
router.patch("/:forumId/books/:bookId/unhide", authenticate, unhideBook);

module.exports = router;
