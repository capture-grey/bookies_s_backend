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
const deleteAccount = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const userId = req.user._id;

    const user = await User.findById(userId)
      .select("joinedForums ownedBooks")
      .session(session);

    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const adminForums = await Forum.find({
      "members.userId": userId,
      "members.role": "admin",
    }).session(session);

    for (const forum of adminForums) {
      if (forum.members.length === 1) {
        const otherMembers = await Forum.aggregate([
          { $match: { _id: forum._id } },
          { $unwind: "$members" },
          { $match: { "members.userId": { $ne: userId } } },
          { $sample: { size: 1 } },
        ]).session(session);

        if (otherMembers.length > 0) {
          const newAdminId = otherMembers[0].members.userId;

          await Forum.updateOne(
            { _id: forum._id, "members.userId": newAdminId },
            { $set: { "members.$.role": "admin" } },
            { session }
          );

          await User.updateOne(
            { _id: newAdminId, "joinedForums.forumId": forum._id },
            { $set: { "joinedForums.$.role": "admin" } },
            { session }
          );
        } else {
          await Forum.deleteOne({ _id: forum._id }).session(session);
        }
      }
    }

    // remove user from all forums
    await Forum.updateMany(
      { "members.userId": userId },
      { $pull: { members: { userId } } },
      { session }
    );

    // rmove  books from  hiddenBooks
    await Forum.updateMany(
      { hiddenBooks: { $in: user.ownedBooks } },
      { $pullAll: { hiddenBooks: user.ownedBooks } },
      { session }
    );

    // delete all user's books
    await Book.deleteMany({ _id: { $in: user.ownedBooks } }).session(session);

    //  delete the user
    await User.deleteOne({ _id: userId }).session(session);

    await session.commitTransaction();

    //clear cookie, token
    res.clearCookie("token");

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully",
      data: {
        forumsUpdated: adminForums.length,
        forumsDeleted: adminForums.filter((f) => f.members.length === 1).length,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Delete account error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};

module.exports = {
  getOwnInfo,
  deleteAccount,
  editOwnInfo,
};
