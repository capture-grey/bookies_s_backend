const mongoose = require("mongoose");
const JWT = require("jsonwebtoken");
const bcrypt = require("bcrypt");
//const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

const User = require("../models/user");
const Book = require("../models/book");
const Forum = require("../models/forum");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const addBook = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { title, author, genre } = req.body;

    // all fields provided
    if (!title || !author) {
      return res.status(400).json({
        success: false,
        message: "Title and Author are required",
      });
    }

    const userId = req.user._id;

    await session.startTransaction();

    //  if user exists
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const normalizedTitle = title.trim();
    const normalizedAuthor = author.trim();

    // if book already exists
    let book = await Book.findOne({
      title: { $regex: new RegExp(`^${escapeRegex(normalizedTitle)}$`, "i") },
      author: { $regex: new RegExp(`^${escapeRegex(normalizedAuthor)}$`, "i") },
    }).session(session);

    // create if not exists
    if (!book) {
      const [newBook] = await Book.create(
        [
          {
            title: normalizedTitle,
            author: normalizedAuthor,
            genre,
          },
        ],
        { session }
      );
      book = newBook;
    }

    // add to users list
    if (!user.ownedBooks.includes(book._id)) {
      user.ownedBooks.push(book._id);
      await user.save({ session });
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Book added successfully",
      id: book._id,
      title: book.title,
      author: book.author,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

const deleteBook = async (req, res, next) => {
  console.log("here");
  const session = await mongoose.startSession();

  try {
    const { bookId } = req.params;
    const userId = req.user._id;

    console.log(bookId, userId);

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid book ID format",
      });
    }

    await session.startTransaction();

    const userUpdate = await User.updateOne(
      { _id: userId },
      { $pull: { ownedBooks: bookId } },
      { session }
    );

    if (userUpdate.modifiedCount === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Book not found in user's collection",
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Book removed successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Remove from owned books error:", error);
    next(error);
  }
};

const editBook = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { newTitle, newAuthor, newGenre = "" } = req.body; // single genre string
    const currentBookId = req.params.bookId;

    if (!currentBookId || !mongoose.Types.ObjectId.isValid(currentBookId)) {
      return res.status(400).json({
        success: false,
        message: "Valid bookId is required in URL parameter",
      });
    }

    if (!newTitle || typeof newTitle !== "string") {
      return res.status(400).json({
        success: false,
        message: "New title is required and must be a string",
      });
    }

    if (!newAuthor || typeof newAuthor !== "string") {
      return res.status(400).json({
        success: false,
        message: "New author is required and must be a string",
      });
    }

    await session.startTransaction();

    const userId = req.user._id;

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.ownedBooks.some((id) => id.equals(currentBookId))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: "User doesn't own this book",
      });
    }

    const normalizedTitle = newTitle.trim();
    const normalizedAuthor = newAuthor.trim();
    const normalizedGenre = newGenre.trim();

    // Find if another book with same title+author exists (excluding current book)
    const existingBook = await Book.findOne({
      _id: { $ne: currentBookId },
      title: { $regex: new RegExp(`^${escapeRegex(normalizedTitle)}$`, "i") },
      author: { $regex: new RegExp(`^${escapeRegex(normalizedAuthor)}$`, "i") },
    }).session(session);

    let finalBookId = currentBookId;

    if (existingBook) {
      // If existing book has no genre but newGenre provided, update it
      if (
        normalizedGenre &&
        (!existingBook.genre || existingBook.genre.trim() === "")
      ) {
        existingBook.genre = normalizedGenre;
        await existingBook.save({ session });
      }

      // Replace book ref in user's ownedBooks
      user.ownedBooks = user.ownedBooks.map((id) =>
        id.equals(currentBookId) ? existingBook._id : id
      );

      // Deduplicate ownedBooks just in case
      user.ownedBooks = [
        ...new Set(user.ownedBooks.map((id) => id.toString())),
      ].map((id) => new mongoose.Types.ObjectId(id));

      finalBookId = existingBook._id;

      // Check if currentBook is owned by others; if none, delete it
      const otherOwnersCount = await User.countDocuments({
        ownedBooks: currentBookId,
        _id: { $ne: userId },
      }).session(session);

      if (otherOwnersCount === 0) {
        await Book.deleteOne({ _id: currentBookId }).session(session);
      }
    } else {
      // Update the current book document directly
      const currentBook = await Book.findById(currentBookId).session(session);
      if (!currentBook) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: "Book not found",
        });
      }

      currentBook.title = normalizedTitle;
      currentBook.author = normalizedAuthor;
      currentBook.genre = normalizedGenre;

      await currentBook.save({ session });
    }

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Book updated successfully",
      data: { bookId: finalBookId },
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    console.error("Error in updateOwnedBook:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  addBook,
  deleteBook,
  editBook,
};
