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
    await session.startTransaction();
    const userId = req.user._id;
    const { name, email, currentPassword, newPassword } = req.body;

    console.log(userId, name, email, currentPassword, newPassword);

    if (!name && !email && !newPassword) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message:
          "At least one field (name, email, or password) must be provided",
      });
    }

    // get user
    const user = await User.findById(userId)
      .select("+password")
      .session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // update name
    if (name) {
      if (typeof name !== "string" || !name.trim()) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Name must be a non-empty string",
        });
      }
      user.name = name.trim();
    }

    // update email
    if (email) {
      if (typeof email !== "string" || !email.trim()) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Email must be a non-empty string",
        });
      }

      //  if email already exists
      const emailExists = await User.findOne({
        email: email.trim(),
        _id: { $ne: userId },
      }).session(session);

      if (emailExists) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Email already in use",
        });
      }

      user.email = email.trim().toLowerCase();
    }

    // update password
    if (newPassword) {
      if (!currentPassword) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Current password is required to set a new password",
        });
      }

      // verify current password
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        await session.abortTransaction();
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // validate new password
      if (newPassword.length < 6) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters long",
        });
      }

      user.password = newPassword;
    }

    // save changes
    await user.save({ session });
    await session.commitTransaction();

    const responseData = {
      name: user.name,
      email: user.email,
    };

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: responseData,
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.errors,
      });
    }

    console.error("Edit profile error:", error);
    next(error);
  } finally {
    await session.endSession();
  }
};
const deleteAccount = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const userId = req.user._id;

    // get user with forum reference
    const user = await User.findById(userId)
      .select("joinedForums")
      .session(session);

    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // admin transfer
    const adminForums = await Forum.find({
      "members.userId": userId,
      "members.role": "admin",
    }).session(session);

    for (const forum of adminForums) {
      if (forum.members.length > 1) {
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
        }
      }
    }

    // remove user from all forums
    await Forum.updateMany(
      { "members.userId": userId },
      { $pull: { members: { userId } } },
      { session }
    );

    // delete user
    await User.deleteOne({ _id: userId }).session(session);

    await session.commitTransaction();

    // clearn token
    res.clearCookie("token");

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully",
      data: {
        forumsUpdated: adminForums.length,
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
