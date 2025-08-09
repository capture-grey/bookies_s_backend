const jwt = require("jsonwebtoken");
const User = require("../../models/user");

module.exports = {
  authenticate: async (req, res, next) => {
    try {
      //  token from cookie or authorization header

      const token =
        req.cookies.token ||
        req.header("Authorization")?.replace("Bearer ", "");

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Please authenticate(no token)",
        });
      }

      // token verification
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        return res.status(401).json({
          success: false,
          message:
            err.name === "TokenExpiredError"
              ? "Token expired"
              : "Invalid token",
        });
      }

      const user = await User.findById(decoded.userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      // add user to req body
      req.user = user;
      console.log("authenticated by auth middleware");
      next();
    } catch (err) {
      console.error("Auth error:", err.message);
      return res.status(401).json({
        success: false,
        message: "Please authenticate - auth catch err",
      });
    }
  },
};
