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
router.delete("/:bookId", authenticate, deleteBook);
router.patch("/:bookId", authenticate, editBook);

module.exports = router;
