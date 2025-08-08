const express = require("express");
const {
  createForum,
  getForumdDetails,
  editDetails,
  deleteForum,
  changeInviteCode,
  removeUser,
  bookList,
  hideBook,
  unhideBook,
} = require("../controllers/forumController.js");

const router = express.Router();

//---> path: /api/forum

//forum action
router.post("/", createForum);
router.get("/:forumID", getForumdDetails);
router.patch("/:forumID", editDetails);
router.delete("/:forumID", deleteForum);
router.patch("/:forumID/invite", changeInviteCode);

//user action
router.delete("/:forumID/users/:userID", removeUser);

//book action
router.get("/:forumID/books", bookList);
router.patch("/:forumID/books/:bookID/hide", hideBook);
router.patch("/:forumID/books/:bookID/unhide", unhideBook);

module.exports = router;
