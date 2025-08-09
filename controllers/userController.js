const mongoose = require("mongoose");
const JWT = require("jsonwebtoken");
const bcrypt = require("bcrypt");
//const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

const User = require("../models/user");
const Book = require("../models/book");
const Forum = require("../models/forum");

const getOwnInfo = async (req, res, next) => {
  try {
    console.log("here");
    const userId = req.user._id;

    //  user with forum data populated
    const user = await User.findById(userId)
      .select("name joinedForums")
      .populate({
        path: "joinedForums.forumId",
        select: "name location members hiddenBooks",
        populate: {
          path: "members.userId",
          select: "ownedBooks",
        },
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    //  forums
    const forums = user.joinedForums.map((forum) => {
      const forumData = forum.forumId;

      // combine all books from all members
      const allMemberBooks = forumData.members.flatMap(
        (m) => m.userId?.ownedBooks || []
      );

      // remove hidden books from count
      const visibleBooks = allMemberBooks.filter(
        (bookId) =>
          !forumData.hiddenBooks.some(
            (hiddenId) => hiddenId.toString() === bookId.toString()
          )
      );

      return {
        forumId: forumData._id,
        name: forumData.name,
        location: forumData.location,
        memberCount: forumData.members.length,
        membersBookCount: visibleBooks.length,
        role: forum.role,
      };
    });

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        forums,
      },
    });
  } catch (error) {
    console.error("Get own info error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getUserInfo = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    // check if user id valid
    const userId = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId",
      });
    }

    await session.startTransaction();

    // get details
    const user = await User.findById(userId)
      .select("name email ownedBooks")
      .populate({
        path: "ownedBooks",
        select: "title author genre",
        options: { session },
      })
      .session(session);

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        books: user.ownedBooks,
      },
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

const editOwnInfo = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const userId = req.user._id;
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required and must be a non-empty string",
      });
    }

    await session.startTransaction();

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.name = name.trim();
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Name updated successfully",
      data: { name: user.name },
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

module.exports = {
  getOwnInfo,
  getUserInfo,
  editOwnInfo,
};
