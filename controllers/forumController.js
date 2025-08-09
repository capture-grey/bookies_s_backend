const mongoose = require("mongoose");
const JWT = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

const User = require("../models/user");
const Book = require("../models/book");
const Forum = require("../models/forum");

//done
const createForum = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { name, location, description } = req.body;
    const creatorId = req.user._id;

    // validation
    if (!name?.trim() || !location?.trim()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Forum name and location are required",
      });
    }

    // create forum
    const [forum] = await Forum.create(
      [
        {
          name: name.trim(),
          location: location.trim(),
          description: description?.trim() || "",
          inviteCode: uuidv4(),
          members: [
            {
              userId: creatorId,
              role: "admin",
            },
          ],
        },
      ],
      { session }
    );

    // update user
    const updatedUser = await User.findByIdAndUpdate(
      creatorId,
      {
        $addToSet: {
          joinedForums: {
            forumId: forum._id,
            role: "admin",
          },
        },
      },
      { session, new: true }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: "Forum created successfully",
      data: {
        forumId: forum._id,
        name: forum.name,
        location: forum.location,
        inviteCode: forum.inviteCode,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Create forum error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.errors,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};
//done
const getForumDetails = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId } = req.params;
    const userId = req.user._id;

    const forum = await Forum.findById(forumId)
      .populate({
        path: "members.userId",
        select: "name email",
      })
      .session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Forum not found",
      });
    }

    // if user is a member
    const isMember = forum.members.some((member) =>
      member.userId._id.equals(userId)
    );
    if (!isMember) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "You are not a member of this forum",
      });
    }

    // if user admin
    const isAdmin = forum.members.some(
      (member) => member.userId._id.equals(userId) && member.role === "admin"
    );

    const memberIds = forum.members.map((member) => member.userId._id);

    const usersWithBooks = await User.find(
      { _id: { $in: memberIds } },
      { ownedBooks: 1 }
    )
      .populate({
        path: "ownedBooks",
        match: { _id: { $nin: forum.hiddenBooks || [] } },
        select: "title author genre",
      })
      .session(session);

    //  combine books
    const uniqueBooks = [];
    const bookIds = new Set();

    usersWithBooks.forEach((user) => {
      user.ownedBooks.forEach((book) => {
        if (!bookIds.has(book._id.toString())) {
          bookIds.add(book._id.toString());
          uniqueBooks.push({
            _id: book._id,
            title: book.title,
            author: book.author,
            genre: book.genre,
          });
        }
      });
    });

    const response = {
      success: true,
      data: {
        forumInfo: {
          name: forum.name,
          description: forum.description,
          location: forum.location,
          messengerLink: forum.messengerLink,
          inviteCode: forum.inviteCode,
          createdAt: forum.createdAt,
          membersCount: forum.members.length,
          booksCount: uniqueBooks.length,
          featuredBook: forum.featuredBook,
        },
        members: forum.members.map((member) => ({
          _id: member.userId._id,
          name: member.userId.name,
          email: member.userId.email,
          role: member.role,
        })),
        books: uniqueBooks,
      },
    };

    //  admin only
    if (isAdmin) {
      const hiddenBooks = await Book.find(
        { _id: { $in: forum.hiddenBooks || [] } },
        "title author genre"
      ).session(session);

      response.data.hiddenBooks = hiddenBooks;
    }

    await session.commitTransaction();
    return res.status(200).json(response);
  } catch (error) {
    await session.abortTransaction();
    console.error("Get forum details error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid forum ID",
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};
//done
const editDetails = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId } = req.params;
    const userId = req.user._id;
    const {
      name,
      location,
      description,
      messengerLink,
      inviteCode,
      featuredBook,
    } = req.body;

    const forum = await Forum.findById(forumId).session(session);
    if (!forum) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Forum not found",
      });
    }

    const isAdmin = forum.members.some(
      (member) => member.userId.equals(userId) && member.role === "admin"
    );

    if (!isAdmin) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Only admins can edit forum details",
      });
    }

    const updates = {
      name: name?.trim(),
      location: location?.trim(),
      description: description?.trim(),
      messengerLink: messengerLink?.trim(),
      inviteCode: inviteCode?.trim(),
      featuredBook: featuredBook?.trim(),
    };

    const updatedForum = await Forum.findByIdAndUpdate(
      forumId,
      { $set: updates },
      { new: true, session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Forum updated successfully",
      data: {
        name: updatedForum.name,
        location: updatedForum.location,
        description: updatedForum.description,
        messengerLink: updatedForum.messengerLink,
        inviteCode: updatedForum.inviteCode,
        featuredBook: updatedForum.featuredBook,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Edit forum details error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.errors,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};
//done
const leaveForum = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId } = req.params;
    const userId = req.user._id;

    // if forum exists
    const forum = await Forum.findById(forumId).session(session);
    if (!forum) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Forum not found",
      });
    }

    //  if user is a member
    const userMembership = forum.members.find((m) => m.userId.equals(userId));
    if (!userMembership) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "You are not a member of this forum",
      });
    }

    // if last admin
    if (userMembership.role === "admin") {
      const adminCount = forum.members.filter((m) => m.role === "admin").length;
      if (adminCount === 1) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message:
            "You are the last admin. Promote someone else or delete the forum instead.",
        });
      }
    }

    // remove user from forum members
    await Forum.updateOne(
      { _id: forumId },
      { $pull: { members: { userId } } },
      { session }
    );

    // remove forum from users list
    await User.updateOne(
      { _id: userId },
      { $pull: { joinedForums: { forumId } } },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Successfully left the forum",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Leave forum error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid forum ID",
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};
//done
const deleteForum = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId } = req.params;
    const userId = req.user._id;

    //  if forum exists, if user admin
    const forum = await Forum.findOne({
      _id: forumId,
      "members.userId": userId,
      "members.role": "admin",
    }).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Forum not found or you don't have admin privileges",
      });
    }

    //  remove forum from all members
    await User.updateMany(
      { "joinedForums.forumId": forumId },
      { $pull: { joinedForums: { forumId } } },
      { session }
    );

    //  delete the forum
    await Forum.deleteOne({ _id: forumId }).session(session);

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Forum deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Delete forum error:", error);
    next(error);
  } finally {
    await session.endSession();
  }
};
//done
const getMemberDetails = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId, memberId } = req.params;
    const requestingUserId = req.user._id;

    const forum = await Forum.findOne({
      _id: forumId,
      "members.userId": requestingUserId,
    }).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "You must be a member to view member details",
      });
    }

    // get target member
    const member = await User.findById(memberId)
      .select("name email joinedForums")
      .session(session);

    if (!member) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    // if member in forum forum
    const isInForum = forum.members.some((m) => m.userId.equals(memberId));
    if (!isInForum) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Member not found in this forum",
      });
    }

    // get member books
    const userBooks = await User.findById(memberId)
      .populate({
        path: "ownedBooks",
        match: { _id: { $nin: forum.hiddenBooks || [] } },
        select: "title author genre",
      })
      .session(session);

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      data: {
        member: {
          _id: member._id,
          name: member.name,
          email: member.email,
        },
        books: userBooks.ownedBooks || [],
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Get member details error:", error);
    next(error);
  } finally {
    await session.endSession();
  }
};
const makeAdmin = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId, userId } = req.params;
    const currentAdminId = req.user._id;

    // if current user is admin of this forum
    const forum = await Forum.findOne({
      _id: forumId,
      "members.userId": currentAdminId,
      "members.role": "admin",
    }).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Admin privileges required",
      });
    }

    // user exists and is a forum member
    const targetUser = await User.exists({ _id: userId }).session(session);
    if (!targetUser) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMember = forum.members.some((m) => m.userId.equals(userId));
    if (!isMember) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "User is not a member of this forum",
      });
    }

    //  if  already admin
    const alreadyAdmin = forum.members.some(
      (m) => m.userId.equals(userId) && m.role === "admin"
    );
    if (alreadyAdmin) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "User is already an admin",
      });
    }

    // uuser role
    await Forum.updateOne(
      { _id: forumId, "members.userId": userId },
      { $set: { "members.$.role": "admin" } },
      { session }
    );

    //  Update user's joinedForums role
    await User.updateOne(
      { _id: userId, "joinedForums.forumId": forumId },
      { $set: { "joinedForums.$.role": "admin" } },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "User promoted to admin successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Make admin error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};
//done
const removeUser = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId, memberId } = req.params;
    const adminId = req.user._id;

    // if admin
    const forum = await Forum.findOne({
      _id: forumId,
      "members.userId": adminId,
      "members.role": "admin",
    }).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Admin privileges required",
      });
    }

    // no admin nooo
    if (memberId === adminId.toString()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Admins cannot remove themselves",
      });
    }

    // remove user f
    const updatedForum = await Forum.findByIdAndUpdate(
      forumId,
      {
        $pull: { members: { userId: memberId } },
      },
      { new: true, session }
    );

    // remove from users list
    await User.findByIdAndUpdate(
      memberId,
      {
        $pull: { joinedForums: { forumId } },
      },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Member removed successfully",
      data: {
        remainingMembers: updatedForum.members.length,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Remove user error:", error);
    next(error);
  } finally {
    await session.endSession();
  }
};
//done
const hideBook = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId, bookId } = req.params;
    const userId = req.user._id;

    // privilege
    const forum = await Forum.findOne({
      _id: forumId,
      "members.userId": userId,
      "members.role": "admin",
    }).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Forum not found or admin privileges required",
      });
    }

    // if book exists
    const bookExists = await Book.exists({ _id: bookId }).session(session);
    if (!bookExists) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    // add to hidden books
    if (forum.hiddenBooks.includes(bookId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Book is already hidden",
      });
    }

    await Forum.findByIdAndUpdate(
      forumId,
      { $addToSet: { hiddenBooks: bookId } },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Book hidden successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Hide book error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};
//done
const unhideBook = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId, bookId } = req.params;
    const userId = req.user._id;

    // privilege
    const forum = await Forum.findOne({
      _id: forumId,
      "members.userId": userId,
      "members.role": "admin",
    }).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Forum not found or admin privileges required",
      });
    }

    // remove from hidden books
    if (!forum.hiddenBooks.includes(bookId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Book is not currently hidden",
      });
    }

    await Forum.findByIdAndUpdate(
      forumId,
      { $pull: { hiddenBooks: bookId } },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Book unhidden successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Unhide book error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};

module.exports = {
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
};
