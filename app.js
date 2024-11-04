// Import dependencies
import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import logger from "morgan";
import flash from "express-flash";
import LokiStore from "connect-loki";
import createError from "http-errors";
import { dbQuery } from "./lib/db-query.js";
import bcrypt from "bcrypt";
import hackingRoutes from "./routes/hacking.js"; // Import minigames routes
import forumRoutes from "./routes/forum.js"; // Import forum routes

// File paths setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize app
const app = express();
const port = process.env.PORT || 3000;

// Set up view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware setup
app.use(logger("dev"));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session handling
const LokiSessionStore = LokiStore(session);
app.use(
  session({
    cookie: {
      httpOnly: true,
      maxAge: 31 * 24 * 60 * 60 * 1000, // Session expires after 31 days
      path: "/",
      secure: false,
    },
    name: "combined-session-id",
    secret: "E3XwBrzGAmVKjbEuNfHq",
    store: new LokiSessionStore({ path: "./session-store.db" }),
    resave: false,
    saveUninitialized: false,
  })
);

// Flash messages
app.use(flash());

// Global variable setup
app.use((req, res, next) => {
  res.locals.messages = req.session.flash;
  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;
  res.locals.isAdmin = req.session.isAdmin;
  next();
});

// Global Authentication Middleware for protected routes
const requiresAuthentication = (req, res, next) => {
  if (!req.session.signedIn) {
    req.session.returnTo = req.originalUrl;
    req.flash("error", "You must be signed in to view this page.");
    return res.redirect("/login");
  }
  next();
};

// Password hashing helper functions
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

async function checkPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Load routes from individual route files
app.use("/", forumRoutes); // Load forum-related routes
app.use("/minigames", hackingRoutes); // Load minigame-related routes

// General Routes (Authentication, Home page, etc.)
app.get("/login", (req, res) => {
  res.render("login", { messages: req.flash() });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const userQuery = "SELECT * FROM users WHERE username = $1";
    const userResult = await dbQuery(userQuery, [username]);

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      const passwordValid = await checkPassword(password, user.password);

      if (passwordValid) {
        req.session.userId = user.id;
        req.session.username = username;
        req.session.isAdmin = user.is_admin;
        req.session.signedIn = true;

        req.session.save((err) => {
          if (err) {
            console.error("Error saving session:", err);
            return res.status(500).json({
              error: "An unexpected error occurred. Please try again.",
            });
          }
          const redirectUrl = req.session.returnTo || "/";
          delete req.session.returnTo;

          return res.status(200).json({ success: true, redirectUrl });
        });
      } else {
        return res
          .status(401)
          .json({ error: "Invalid password. Please try again." });
      }
    } else {
      return res
        .status(401)
        .json({ error: "No user found with the given username." });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      error: "An unexpected error occurred. Please try again.",
    });
  }
});

// Error handling
app.use(function (req, res, next) {
  next(createError(404));
});

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500);
  res.render("error", {
    message: err.message || "An unexpected error occurred.",
    error: {
      status: err.status || 500,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    },
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
