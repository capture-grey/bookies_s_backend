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

    //check if any field missing
    if (!name || !email || !password) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Name, Email and Password all are required",
      });
    }

    // check user already exist
    const userExist = await User.findOne({ email }).session(session);
    if (userExist) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "email already registered",
      });
    }

    // hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // create user
    const newUser = await User.create(
      [{ name, email, password: hashedPassword }],
      { session }
    );

    // jwt token
    const token = JWT.sign({ userId: newUser[0]._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    await session.commitTransaction();
    session.endSession();

    //create and send response with token
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
    console.log("error from sign-up");
    next(error);
  }
};
const signIn = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    //console.log("-------------------------here at sign-in line 79");

    // check if any field empty
    if (!email || !password) {
      return res.status(401).json({
        success: false,
        message: "both email and password required",
      });
    }

    //console.log("-------------------------here at sign-in line 89");

    // check if user exists then password matches
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: "invalid credentials",
      });
    }

    //console.log("-------------------------here at sign-in line 98");

    //generate token
    const token = JWT.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    //response
    return res.status(201).json({
      success: true,
      message: "logged in successfully",
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
        },
        token,
      },
    });

    //
  } catch (error) {
    next(error);
  }
};

module.exports = {
  signIn,
  signUp,
};
