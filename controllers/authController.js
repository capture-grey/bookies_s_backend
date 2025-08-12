const mongoose = require("mongoose");
const JWT = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

const User = require("../models/user");
const Book = require("../models/book");
const Forum = require("../models/forum");

const signUp = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { name, email, password } = req.body;

    // Trim and validate inputs
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const trimmedPassword = password.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPassword) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Name, Email and Password all are required",
      });
    }

    // Check user already exists
    const userExist = await User.findOne({ email: trimmedEmail }).session(
      session
    );
    if (userExist) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Create user - let the pre-save middleware handle hashing
    const newUser = await User.create(
      [
        {
          name: trimmedName,
          email: trimmedEmail,
          password: trimmedPassword, // This will be hashed by the pre-save hook
        },
      ],
      { session }
    );

    // JWT token
    const token = JWT.sign({ userId: newUser[0]._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    await session.commitTransaction();
    session.endSession();

    // Return response without password
    const userResponse = newUser[0].toObject();
    delete userResponse.password;
    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        user: userResponse,
        token,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error from sign-up:", error);
    next(error);
  }
};
const signIn = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Trim and validate inputs
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      return res.status(401).json({
        success: false,
        message: "Both email and password required",
      });
    }

    // Find user with password selected
    const user = await User.findOne({ email: trimmedEmail }).select(
      "+password"
    );
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Compare passwords
    const isMatch = await user.comparePassword(trimmedPassword); // Using the model method
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate token only
    const token = JWT.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    // Return only token in response
    return res.status(200).json({
      success: true,
      message: "Logged in successfully",
      data: {
        token, // Only returning token
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    next(error);
  }
};
module.exports = {
  signIn,
  signUp,
};
