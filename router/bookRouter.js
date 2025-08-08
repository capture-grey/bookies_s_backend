const express = require("express");
const {
  addBook,
  deleteBook,
  editBook,
} = require("../controllers/bookController.js");
const { authenticate } = require("../middlewares/common/authMiddleware.js");

const router = express.Router();

//---> path: /api/book
router.post("/add", authenticate, addBook);
router.delete("/:bookId", deleteBook);
router.patch("/:bookId", editBook);

module.exports = router;
