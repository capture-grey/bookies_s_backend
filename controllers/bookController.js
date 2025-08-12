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
    const { title, author, genre } = req.body; // All fields optional except at least one must be provided
    const currentBookId = req.params.bookId;

    if (!currentBookId || !mongoose.Types.ObjectId.isValid(currentBookId)) {
      return res.status(400).json({
        success: false,
        message: "Valid bookId is required in URL parameter",
      });
    }

    // Check at least one field is being updated
    if (!title && !author && genre === undefined) {
      return res.status(400).json({
        success: false,
        message:
          "At least one field (title, author, or genre) must be provided for update",
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

    // Prepare update fields
    const updateFields = {};
    if (title !== undefined) updateFields.title = title.trim();
    if (author !== undefined) updateFields.author = author.trim();
    if (genre !== undefined) updateFields.genre = genre.trim();

    // Only check for duplicates if title or author are being updated
    if (title || author) {
      const normalizedTitle = title ? title.trim() : undefined;
      const normalizedAuthor = author ? author.trim() : undefined;

      // Find if another book with same title+author exists (excluding current book)
      const existingBook = await Book.findOne({
        _id: { $ne: currentBookId },
        ...(normalizedTitle && {
          title: {
            $regex: new RegExp(`^${escapeRegex(normalizedTitle)}$`, "i"),
          },
        }),
        ...(normalizedAuthor && {
          author: {
            $regex: new RegExp(`^${escapeRegex(normalizedAuthor)}$`, "i"),
          },
        }),
      }).session(session);

      let finalBookId = currentBookId;

      if (existingBook) {
        // If existing book has no genre but new genre provided, update it
        if (
          updateFields.genre &&
          (!existingBook.genre || existingBook.genre.trim() === "")
        ) {
          existingBook.genre = updateFields.genre;
          await existingBook.save({ session });
        }

        // Replace book ref in user's ownedBooks
        user.ownedBooks = user.ownedBooks.map((id) =>
          id.equals(currentBookId) ? existingBook._id : id
        );

        // Deduplicate ownedBooks
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

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
          success: true,
          message: "Book merged successfully",
          data: { bookId: finalBookId },
        });
      }
    }

    // If no duplicate found or only genre is being updated, update current book
    const currentBook = await Book.findByIdAndUpdate(
      currentBookId,
      updateFields,
      { new: true, session }
    );

    if (!currentBook) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Book updated successfully",
      data: { bookId: currentBookId },
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
