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
  const session = await mongoose.startSession();
};
const editBook = async (req, res, next) => {
  const session = await mongoose.startSession();
};

module.exports = {
  addBook,
  deleteBook,
  editBook,
};
