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

    // combine books
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
          featured: forum.featured || null, // Add featured field here
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

    // admin only
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
      featured, // { book, quote }
    } = req.body;

    // 1. Verify forum exists and user is admin
    const forum = await Forum.findOne({
      _id: forumId,
      "members.userId": userId,
      "members.role": "admin",
    }).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Admin privileges required",
      });
    }

    // 2. Prepare updates
    const updates = {
      name: name?.trim(),
      location: location?.trim(),
      description: description?.trim(),
      messengerLink: messengerLink?.trim(),
      inviteCode: inviteCode?.trim(),
    };

    // 3. Handle featured content
    if (featured) {
      updates.featured = {
        book: featured.book?.trim(),
        quote: featured.quote?.trim(),
      };
    }

    // 4. Apply updates
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
        featured: updatedForum.featured || null,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Edit forum error:", error);

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
const joinForum = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { inviteCode } = req.body;
    const userId = req.user._id;
    console.log(inviteCode);
    console.log(userId);

    // validation
    if (!inviteCode?.trim()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invite code is required",
      });
    }

    // find forum
    const forum = await Forum.findOne({
      inviteCode: inviteCode.trim(),
    }).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Invalid invite code",
      });
    }

    // if user alrady member
    const isAlreadyMember = forum.members.some((member) =>
      member.userId.equals(userId)
    );
    if (isAlreadyMember) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "You are already a member of this forum",
      });
    }

    // add user to forum
    await Forum.findByIdAndUpdate(
      forum._id,
      {
        $addToSet: {
          members: {
            userId: userId,
            role: "member",
          },
        },
      },
      { session }
    );

    // add forum to user forum list
    await User.findByIdAndUpdate(
      userId,
      {
        $addToSet: {
          joinedForums: {
            forumId: forum._id,
            role: "member",
          },
        },
      },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Successfully joined the forum",
      data: {
        forumId: forum._id,
        name: forum.name,
        membersCount: forum.members.length + 1,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Join forum error:", error);

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

    console.log(forumId, memberId, requestingUserId);

    const forum = await Forum.findById(forumId).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Forum not found",
      });
    }

    const isMember = forum.members.some(
      (m) => m.userId.toString() === requestingUserId.toString()
    );
    if (!isMember) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "You must be a member to view member details",
      });
    }

    const targetMember = forum.members.find(
      (m) => m.userId.toString() === memberId
    );

    if (!targetMember) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Member not found in this forum",
      });
    }

    const memberWithBooks = await User.findById(memberId)
      .select("name email")
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
          _id: memberId,
          name: memberWithBooks.name,
          email: memberWithBooks.email,
          role: targetMember.role,
        },
        books: memberWithBooks.ownedBooks || [],
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Get member details error:", error);

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
const makeAdmin = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { forumId, memberId } = req.params;
    const currentAdminId = req.user._id;

    //  if current user is admin
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

    // if target exists
    const targetUser = await User.findById(memberId).session(session);
    if (!targetUser) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // if target member
    const isMember = forum.members.some((m) => m.userId.equals(memberId));
    if (!isMember) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "User is not a member of this forum",
      });
    }

    // update role
    await Forum.updateOne(
      { _id: forumId, "members.userId": memberId },
      { $set: { "members.$.role": "admin" } },
      { session }
    );

    // update role in user joined forums
    await User.updateOne(
      { _id: memberId, "joinedForums.forumId": forumId },
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

    // if admin
    const forum = await Forum.findOne({
      _id: forumId,
      "members.userId": userId,
      "members.role": "admin",
    }).session(session);

    if (!forum) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Admin privileges required",
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

    // if already hidden
    if (forum.hiddenBooks.some((id) => id.equals(bookId))) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Book is already hidden",
      });
    }

    // add to hidden
    await Forum.findByIdAndUpdate(
      forumId,
      { $addToSet: { hiddenBooks: bookId } },
      { session }
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Book hidden successfully",
    });
    return;
  } catch (error) {
    await session.abortTransaction();

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    console.error("Hide book error:", error);
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
  joinForum,
  leaveForum,
  deleteForum,
  getMemberDetails,
  makeAdmin,
  removeUser,
  hideBook,
  unhideBook,
};
