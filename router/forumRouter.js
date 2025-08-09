const express = require("express");
const {
  createForum,
  getForumDetails,
  editDetails,
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
router.delete("/:forumId/leave", authenticate, leaveForum);
router.delete("/:forumId", authenticate, deleteForum);

//user action
router.get("/:forumID/users/:userID", authenticate, getMemberDetails);
router.patch("/:forumID/users/:userID", authenticate, makeAdmin);
router.delete("/:forumID/users/:userID", authenticate, removeUser);

//book action
router.patch("/:forumID/books/:bookID/hide", authenticate, hideBook);
router.patch("/:forumID/books/:bookID/unhide", authenticate, unhideBook);

module.exports = router;
