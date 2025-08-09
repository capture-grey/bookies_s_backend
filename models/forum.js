const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const ForumSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    messengerLink: {
      type: String,
      trim: true,
    },
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["admin", "member"],
          default: "member",
        },
      },
    ],
    hiddenBooks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Book",
      },
    ],
    inviteCode: {
      type: String,
      default: () => uuidv4(),
      unique: true,
    },
    featured: {
      book: {
        type: String,
        trim: true,
      },
      quote: {
        type: String,
        trim: true,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Forum", ForumSchema);
