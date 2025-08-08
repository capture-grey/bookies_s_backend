const mongoose = require("mongoose");
const JWT = require("jsonwebtoken");
const bcrypt = require("bcrypt");
//const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

const User = require("../models/user");
const Book = require("../models/book");
const Forum = require("../models/forum");

const createForum = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const getForumdDetails = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const editDetails = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const deleteForum = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const changeInviteCode = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const removeUser = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const bookList = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const hideBook = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const unhideBook = async (req, res, next) => {
  const session = await mongoose.startSession();
};

module.exports = {
  createForum,
  getForumdDetails,
  editDetails,
  deleteForum,
  changeInviteCode,
  removeUser,
  bookList,
  hideBook,
  unhideBook,
};
