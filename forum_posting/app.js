const express = require("express");
const path = require("path");
const logger = require("morgan");
const createError = require("http-errors");
const session = require("express-session");
const PgPersistence = require("./lib/pg-persistence");
const flash = require("express-flash");
const LokiStore = require("connect-loki")(session);
const { dbQuery } = require("./lib/db-query.js");
const bcrypt = require(`bcrypt`);
const app = express();

// Setting up view engine
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

// Middleware setup
app.use(logger("dev"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session middleware
app.use(
  session({
    cookie: {
      httpOnly: true,
      maxAge: 31 * 24 * 60 * 60 * 1000,
      path: "/",
      secure: false,
    },
    name: "mystery-session-id",
    secret: "E3XwBrzGAmVKjbEuNfHq",
    store: new LokiStore({ path: "./session-store.db" }),
    resave: false,
    saveUninitialized: false,
  })
);

// Flash middleware
app.use(flash());

// Set up local variables for views
app.use((req, res, next) => {
  res.locals.messages = req.session.flash;
  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;
  res.locals.isAdmin = req.session.isAdmin;
  next();
});

// Global Authentication Middleware
app.use((req, res, next) => {
  const publicPaths = [
    "/login",
    "/register",
    "/stylesheets/",
    "/scripts/",
    "/images/",
    "/favicon.ico",
  ];
  if (publicPaths.some((path) => req.path.startsWith(path))) {
    return next();
  }
  if (!req.session.signedIn) {
    req.session.returnTo = req.originalUrl;
    req.flash("error", "You must be signed in to view this page.");
    return res.redirect("/login");
  }
  next();
});

const requiresAuthentication = (req, res, next) => {
  if (!req.session.signedIn) {
    req.session.returnTo = req.originalUrl;
    req.flash("error", "You must be signed in to view this page.");
    res.redirect("/login");
  } else {
    next();
  }
};

async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

async function checkPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  next();
});

app.use((req, res, next) => {
  res.locals.messages = req.flash();
  console.log("Flash messages available:", res.locals.messages);
  next();
});

// Home page with all mysteries
app.get("/", async (req, res, next) => {
  if (!req.session.signedIn) {
    req.flash("error", "You must be signed in to view mysteries.");
    return res.render("index", { promptLogin: true });
  }

  let itemsPerPage = 5;
  let currentPage = parseInt(req.query.page, 10) || 1;

  if (isNaN(currentPage) || currentPage <= 0) {
    const error = createError(
      400,
      "Invalid page number. Page number must be greater than 0."
    );
    return next(error);
  }

  const offset = (currentPage - 1) * itemsPerPage;

  try {
    const mysteriesQuery = `
      SELECT * FROM mysteries 
      ORDER BY title ASC 
      LIMIT $1 OFFSET $2
    `;
    const countQuery = `SELECT COUNT(*) FROM mysteries`;

    const { rows: mysteries } = await dbQuery(mysteriesQuery, [
      itemsPerPage,
      offset,
    ]);
    const { rows: countResult } = await dbQuery(countQuery);
    const totalItems = parseInt(countResult[0].count, 10);
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (currentPage > totalPages) {
      const error = createError(400, "Page number exceeds available pages.");
      return next(error);
    }

    res.render("index", {
      mysteries,
      currentPage,
      totalPages,
    });
  } catch (error) {
    console.error("Failed to fetch mysteries:", error);
    next(
      createError(500, "An unexpected error occurred while fetching mysteries.")
    );
  }
});

// Search Page
app.get("/search", async (req, res, next) => {
  const { searchType, query } = req.query;
  const itemsPerPage = 5;
  const currentPage = parseInt(req.query.page, 10) || 1;

  if (isNaN(currentPage) || currentPage <= 0) {
    return next(
      createError(
        400,
        "Invalid page number. Page number must be greater than 0."
      )
    );
  }

  const offset = (currentPage - 1) * itemsPerPage;
  let finalSearchType = searchType || "mysteries";

  try {
    let searchQuery, countQuery;

    if (finalSearchType === "mysteries") {
      searchQuery = `
        SELECT * FROM mysteries 
        WHERE title ILIKE $1 OR description ILIKE $1
        ORDER BY title ASC
        LIMIT $2 OFFSET $3
      `;
      countQuery = `
        SELECT COUNT(*) FROM mysteries 
        WHERE title ILIKE $1 OR description ILIKE $1
      `;
    } else if (finalSearchType === "clues") {
      searchQuery = `
        SELECT * FROM clues 
        WHERE name ILIKE $1
        ORDER BY name ASC
        LIMIT $2 OFFSET $3
      `;
      countQuery = `
        SELECT COUNT(*) FROM clues 
        WHERE name ILIKE $1
      `;
    } else if (finalSearchType === "mysteriesByIngredient") {
      searchQuery = `
        SELECT DISTINCT r.id, r.title, r.description
        FROM mysteries r
        JOIN mysteryClues ri ON r.id = ri.mystery_id
        JOIN clues i ON ri.ingredient_id = i.id
        WHERE i.name ILIKE $1
        ORDER BY r.title ASC
        LIMIT $2 OFFSET $3
      `;
      countQuery = `
        SELECT COUNT(DISTINCT r.id) FROM mysteries r
        JOIN mysteryClues ri ON r.id = ri.mystery_id
        JOIN clues i ON ri.ingredient_id = i.id
        WHERE i.name ILIKE $1
      `;
    } else {
      req.flash("error", "Invalid search type selected.");
      return res.redirect("/");
    }

    const { rows } = await dbQuery(searchQuery, [
      `%${query}%`,
      itemsPerPage,
      offset,
    ]);
    const results = rows;

    const { rows: countResult } = await dbQuery(countQuery, [`%${query}%`]);
    const totalItems = parseInt(countResult[0].count, 10);
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (currentPage > totalPages && totalPages > 0) {
      return next(createError(400, "Page number exceeds available pages."));
    }

    res.render("search-results", {
      searchType: finalSearchType,
      results,
      query,
      currentPage,
      totalPages,
    });
  } catch (error) {
    console.error("Error executing search:", error);
    next(createError(500, "Failed to execute search."));
  }
});

// Log out
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session during logout:", err);
      req.flash("error", "There was an error logging you out.");
      res.redirect("/");
    } else {
      res.redirect("/login");
    }
  });
});

// Get Create mystery page
app.get("/mysteries/new", requiresAuthentication, async (req, res) => {
  try {
    console.log("GET /mysteries/new hit");
    const ingredientQuery = "SELECT * FROM clues";
    const { rows: clues } = await dbQuery(ingredientQuery);
    console.log({ clues });
    res.render("new-mystery", { clues });
  } catch (error) {
    console.error("Error fetching clues:", error);
    req.flash("error", "Error loading clues.");
    res.redirect("/");
  }
});

// Create a new mystery
app.post("/mysteries", requiresAuthentication, async (req, res, next) => {
  const { title, description, clues } = req.body;

  const hasValidIngredient =
    clues &&
    Object.values(clues).some((ingredient) => {
      if (
        ingredient.checked === "true" &&
        ingredient.quantity &&
        ingredient.quantity.trim().length > 0
      ) {
        const parsedQuantity = ingredient.quantity.trim();
        const isNumericQuantity =
          !isNaN(parseFloat(parsedQuantity)) && isFinite(parsedQuantity);
        return isNumericQuantity ? parseFloat(parsedQuantity) > 0 : true; // Non-numeric is allowed if it's not empty
      }
      return false;
    });

  if (!hasValidIngredient) {
    req.flash(
      "error",
      "You must add at least one ingredient with a valid quantity (if numeric, it must be positive) to create a mystery."
    );

    try {
      const ingredientQuery = "SELECT * FROM clues";
      const { rows: cluesList } = await dbQuery(ingredientQuery);
      return res.render("new-mystery", {
        title,
        description,
        clues: cluesList,
        messages: req.flash(),
      });
    } catch (error) {
      console.error("Error fetching clues:", error);
      return next(createError(500, "Error loading clues."));
    }
  }

  try {
    await dbQuery("BEGIN");

    const insertMysteryQuery =
      "INSERT INTO mysteries (title, description, author_id) VALUES ($1, $2, $3) RETURNING id";
    const result = await dbQuery(insertMysteryQuery, [
      title,
      description,
      req.session.userId,
    ]);
    const mysteryId = result.rows[0].id;

    for (const ingredientId in clues) {
      if (clues.hasOwnProperty(ingredientId)) {
        const ingredientData = clues[ingredientId];

        if (
          ingredientData.checked === "true" &&
          ingredientData.quantity &&
          ingredientData.quantity.trim().length > 0
        ) {
          let parsedQuantity = ingredientData.quantity.trim();
          const parsedIngredientId = parseInt(ingredientData.id, 10);
          const isNumericQuantity =
            !isNaN(parseFloat(parsedQuantity)) && isFinite(parsedQuantity);

          if (
            !isNaN(parsedIngredientId) &&
            (!isNumericQuantity || parseFloat(parsedQuantity) > 0)
          ) {
            console.log([mysteryId, parsedIngredientId, parsedQuantity]);
            await dbQuery(
              "INSERT INTO mysteryClues (mystery_id, ingredient_id, quantity) VALUES ($1, $2, $3)",
              [mysteryId, parsedIngredientId, parsedQuantity]
            );
          } else {
            req.flash("error", "Invalid ingredient or quantity provided.");
          }
        }
      }
    }

    await dbQuery("COMMIT");
    req.flash("success", "Mystery added successfully.");
    res.redirect(`/mysteries/${mysteryId}`);
  } catch (error) {
    await dbQuery("ROLLBACK");
    console.error("Error adding mystery:", error);
    return next(
      createError(500, "Failed to add mystery due to a server error.")
    );
  }
});

// Get Edit Page
app.get(
  "/mysteries/:id/edit",
  requiresAuthentication,
  async (req, res, next) => {
    try {
      const mysteryId = parseInt(req.params.id, 10);
      if (isNaN(mysteryId)) {
        return next(
          createError(
            400,
            "Invalid mystery ID. Please provide a valid numeric mystery ID."
          )
        );
      }

      if (req.session.newClues) {
        delete req.session.newClues;
      }

      const mysteryQuery = `
      SELECT r.id, r.title, r.description, 
      i.name AS ingredient_name, ri.quantity, i.id AS ingredient_id
      FROM mysteries r
      LEFT JOIN mysteryClues ri ON r.id = ri.mystery_id
      LEFT JOIN clues i ON ri.ingredient_id = i.id
      WHERE r.id = $1
    `;
      const { rows } = await dbQuery(mysteryQuery, [mysteryId]);

      let mystery = {};
      if (rows.length > 0) {
        mystery = {
          id: rows[0].id,
          title: rows[0].title,
          description: rows[0].description,
          clues: rows
            .filter((row) => row.ingredient_id !== null)
            .map((row) => ({
              name: row.ingredient_name,
              quantity: row.quantity,
              id: row.ingredient_id,
            })),
        };

        if (req.session.newClues) {
          req.session.newClues.forEach((newIng) => {
            if (!mystery.clues.some((ing) => ing.id === newIng.id)) {
              mystery.clues.push({
                name: newIng.name,
                quantity: newIng.quantity,
                id: newIng.id,
              });
            }
          });
        }
      } else {
        return next(
          createError(
            404,
            "Mystery not found. The mystery you are trying to edit does not exist."
          )
        );
      }

      const allCluesQuery = "SELECT * FROM clues";
      const { rows: allClues } = await dbQuery(allCluesQuery);
      const cluesList = allClues || [];

      res.render("edit", {
        mystery,
        allClues: cluesList,
        flash: req.flash(),
      });
    } catch (error) {
      console.error("Error fetching mystery:", error);
      next(
        createError(
          500,
          "An unexpected error occurred while fetching the mystery."
        )
      );
    }
  }
);

// Add ingredient to mystery via edit page
app.post(
  "/mysteries/:id/add-ingredient",
  requiresAuthentication,
  async (req, res) => {
    console.log("POST body for adding ingredient:", req.body);
    const { newIngredient } = req.body;

    try {
      const mysteryId = parseInt(req.params.id, 10);
      if (isNaN(mysteryId)) {
        throw new Error("Invalid mystery ID");
      }

      if (newIngredient && newIngredient.id && newIngredient.quantity) {
        const parsedIngredientId = parseInt(newIngredient.id, 10);
        let parsedQuantity = newIngredient.quantity.trim();

        const quantityIsNumber =
          !isNaN(parseFloat(parsedQuantity)) && isFinite(parsedQuantity);

        if (quantityIsNumber && parseFloat(parsedQuantity) <= 0) {
          req.flash(
            "error",
            "Quantity must be greater than zero if it is a numeric value."
          );

          const allCluesQuery = "SELECT * FROM clues";
          const { rows: allClues } = await dbQuery(allCluesQuery);

          const mysteryQuery = `
            SELECT r.id, r.title, r.description, 
            i.name AS ingredient_name, ri.quantity, i.id AS ingredient_id
            FROM mysteries r
            LEFT JOIN mysteryClues ri ON r.id = ri.mystery_id
            LEFT JOIN clues i ON ri.ingredient_id = i.id
            WHERE r.id = $1
          `;
          const { rows } = await dbQuery(mysteryQuery, [mysteryId]);

          let mystery = {};
          if (rows.length > 0) {
            mystery = {
              id: rows[0].id,
              title: rows[0].title,
              description: rows[0].description,
              clues: rows
                .filter((row) => row.ingredient_id !== null)
                .map((row) => ({
                  name: row.ingredient_name,
                  quantity: row.quantity,
                  id: row.ingredient_id,
                })),
            };
          }

          return res.render("edit", {
            mystery,
            allClues,
            flash: req.flash(),
          });
        }

        if (!isNaN(parsedIngredientId) && parsedQuantity.length > 0) {
          console.log(
            `Adding new ingredient directly - Mystery ID: ${mysteryId}, Ingredient ID: ${parsedIngredientId}, Quantity: ${parsedQuantity}`
          );

          const selectQuery = `
            SELECT * FROM mysteryClues WHERE mystery_id = $1 AND ingredient_id = $2
          `;
          const existingEntry = await dbQuery(selectQuery, [
            mysteryId,
            parsedIngredientId,
          ]);

          if (existingEntry.rows.length > 0) {
            await dbQuery(
              "UPDATE mysteryClues SET quantity = $1 WHERE mystery_id = $2 AND ingredient_id = $3",
              [parsedQuantity, mysteryId, parsedIngredientId]
            );
          } else {
            await dbQuery(
              "INSERT INTO mysteryClues (mystery_id, ingredient_id, quantity) VALUES ($1, $2, $3)",
              [mysteryId, parsedIngredientId, parsedQuantity]
            );
          }
          console.log("Ingredient added successfully to the mystery.");
        } else {
          req.flash("error", "Invalid ingredient or quantity provided.");
        }
      } else {
        req.flash("error", "Ingredient and quantity are required.");
      }

      res.redirect(`/mysteries/${mysteryId}/edit`);
    } catch (error) {
      console.error("Error adding ingredient:", error);
      req.flash("error", "Failed to add ingredient.");
      res.redirect(`/mysteries/${req.params.id}/edit`);
    }
  }
);

// Display Remove Clues Page
app.get(
  "/mysteries/:id/remove-clues",
  requiresAuthentication,
  async (req, res) => {
    try {
      const mysteryId = parseInt(req.params.id, 10);
      if (isNaN(mysteryId)) {
        throw new Error("Invalid mystery ID");
      }

      const mysteryQuery = `
      SELECT r.id, r.title, r.description,
      i.name AS ingredient_name, ri.quantity, i.id AS ingredient_id
      FROM mysteries r
      LEFT JOIN mysteryClues ri ON r.id = ri.mystery_id
      LEFT JOIN clues i ON ri.ingredient_id = i.id
      WHERE r.id = $1
    `;
      const { rows } = await dbQuery(mysteryQuery, [mysteryId]);

      if (rows.length > 0) {
        const mystery = {
          id: rows[0].id,
          title: rows[0].title,
          description: rows[0].description,
          clues: rows.map((row) => ({
            name: row.ingredient_name,
            quantity: row.quantity,
            id: row.ingredient_id,
          })),
        };
        res.render("delete-clues", { mystery: mystery });
      } else {
        res.status(404).send("Mystery not found");
      }
    } catch (error) {
      console.error("Error fetching mystery:", error);
      res.status(500).render("error", { error });
    }
  }
);

// Handle Ingredient Deletion
app.post(
  "/mysteries/:id/remove-ingredient",
  requiresAuthentication,
  async (req, res) => {
    const mysteryId = parseInt(req.params.id, 10);
    const { cluesToRemove } = req.body;

    try {
      if (isNaN(mysteryId)) {
        throw new Error("Invalid mystery ID");
      }

      if (Array.isArray(cluesToRemove) && cluesToRemove.length > 0) {
        for (const ingredientId of cluesToRemove) {
          const parsedIngredientId = parseInt(ingredientId, 10);
          if (!isNaN(parsedIngredientId)) {
            await dbQuery(
              "DELETE FROM mysteryClues WHERE mystery_id = $1 AND ingredient_id = $2",
              [mysteryId, parsedIngredientId]
            );
          }
        }
        req.flash("success", "Selected clues removed successfully.");
      } else {
        req.flash("error", "No clues were selected to remove.");
      }

      res.redirect(`/mysteries/${mysteryId}/remove-clues`);
    } catch (error) {
      console.error("Error deleting clues:", error);
      req.flash("error", "Failed to remove clues.");
      res.redirect(`/mysteries/${mysteryId}/remove-clues`);
    }
  }
);

// Save Edit
app.post("/mysteries/:id/edit", requiresAuthentication, async (req, res) => {
  console.log("POST body:", req.body);
  const { title, description, clues } = req.body;

  try {
    const mysteryId = parseInt(req.params.id, 10);
    if (isNaN(mysteryId)) {
      throw new Error("Invalid mystery ID");
    }

    await dbQuery("BEGIN");
    await dbQuery(
      "UPDATE mysteries SET title = $1, description = $2 WHERE id = $3",
      [title, description, mysteryId]
    );

    let allClues = clues ? [...clues] : [];
    if (req.session.newClues) {
      allClues = [...allClues, ...req.session.newClues];
    }

    if (allClues.length > 0) {
      console.log("Clues received for update:", allClues);
      for (let ingredientData of allClues) {
        console.log("Ingredient Data:", ingredientData);

        const parsedIngredientId = parseInt(ingredientData.id, 10);
        let parsedQuantity = ingredientData.quantity;

        if (Array.isArray(parsedQuantity)) {
          parsedQuantity =
            parsedQuantity.find((q) => q.trim().length > 0) || "";
        }
        parsedQuantity = parsedQuantity.trim();

        if (!isNaN(parsedIngredientId) && parsedQuantity.length > 0) {
          console.log(
            `Updating or inserting ingredient - Mystery ID: ${mysteryId}, Ingredient ID: ${parsedIngredientId}, Quantity: ${parsedQuantity}`
          );

          const selectQuery = `
            SELECT * FROM mysteryClues WHERE mystery_id = $1 AND ingredient_id = $2
          `;
          const existingEntry = await dbQuery(selectQuery, [
            mysteryId,
            parsedIngredientId,
          ]);

          if (existingEntry.rows.length > 0) {
            await dbQuery(
              "UPDATE mysteryClues SET quantity = $1 WHERE mystery_id = $2 AND ingredient_id = $3",
              [parsedQuantity, mysteryId, parsedIngredientId]
            );
          } else {
            await dbQuery(
              "INSERT INTO mysteryClues (mystery_id, ingredient_id, quantity) VALUES ($1, $2, $3)",
              [mysteryId, parsedIngredientId, parsedQuantity]
            );
          }
        } else {
          console.log("Skipping invalid ingredient or quantity.");
        }
      }
    }

    if (req.session.newClues) {
      delete req.session.newClues;
    }

    await dbQuery("COMMIT");
    req.flash("success", "Mystery updated successfully.");
    res.redirect(`/mysteries/${mysteryId}`);
  } catch (error) {
    await dbQuery("ROLLBACK");
    console.error("Error updating mystery:", error);
    req.flash("error", "Failed to update mystery due to a server error.");
    res.redirect(`/mysteries/${req.params.id}/edit`);
  }
});

// Delete mystery
app.post("/mysteries/:id/delete", requiresAuthentication, async (req, res) => {
  const persistence = new PgPersistence(req.session);
  const mysteryId = parseInt(req.params.id, 10);

  if (await persistence.deleteMystery(mysteryId)) {
    req.flash("success", "Mystery deleted successfully.");
    res.redirect("/");
  } else {
    req.flash(
      "error",
      "Failed to delete mystery. You might not have permission."
    );
    res.redirect(`/mysteries/${mysteryId}`);
  }
});

// View Login page
app.get("/login", (req, res) => {
  res.render("login", { messages: req.flash() });
});

// Submit login info
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

// View Register page
app.get("/register", (req, res) => {
  res.render("register");
});

// Submit account registration info
app.post("/register", async (req, res) => {
  const { username, password, adminPassword } = req.body;

  try {
    if (!username || !password) {
      req.flash("error", "Username and password are required");
      return res.render("register", {
        username,
        messages: req.flash(),
      });
    }

    const userExistsQuery = "SELECT 1 FROM users WHERE username = $1";
    const userExistsResult = await dbQuery(userExistsQuery, [username]);

    if (userExistsResult.rows.length > 0) {
      req.flash("error", "Username already taken, please choose another one.");
      return res.render("register", {
        username,
        messages: req.flash(),
      });
    }

    const isAdmin = adminPassword === "LaunchSchool";

    const hashedPassword = await hashPassword(password);

    const result = await dbQuery(
      "INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING id",
      [username, hashedPassword, isAdmin]
    );

    req.session.userId = result.rows[0].id;
    req.session.username = username;
    req.session.isAdmin = isAdmin;
    req.session.signedIn = true;

    req.flash("success", "Registration successful");
    res.redirect("/");
  } catch (error) {
    console.error("Registration error:", error);
    req.flash("error", "Error registering user, please try again.");
    return res.render("register", {
      username,
      messages: req.flash(),
    });
  }
});

// View all mysteries via main page
app.get("/mysteries", (req, res) => {
  res.redirect("/");
});

// Get a single mystery
app.get("/mysteries/:id", async (req, res) => {
  try {
    console.log(`GET /mysteries/:id hit with id: ${req.params.id}`);
    const mysteryId = parseInt(req.params.id, 10);
    if (isNaN(mysteryId)) {
      req.flash("error", "Invalid mystery ID.");
      return res.redirect("/");
    }

    const mysteryQuery = `
      SELECT r.id, r.title, r.description, 
      i.name AS ingredient_name, ri.quantity, ri.id AS ingredient_id
      FROM mysteries r
      LEFT JOIN mysteryClues ri ON r.id = ri.mystery_id
      LEFT JOIN clues i ON ri.ingredient_id = i.id
      WHERE r.id = $1
    `;
    const { rows } = await dbQuery(mysteryQuery, [mysteryId]);

    if (rows.length > 0) {
      const mystery = {
        id: rows[0].id,
        title: rows[0].title,
        description: rows[0].description,
        clues: rows.map((row) => ({
          name: row.ingredient_name,
          quantity: row.quantity,
        })),
      };
      res.render("mystery", { mystery });
    } else {
      req.flash("error", "Mystery not found.");
      return res.redirect("/");
    }
  } catch (error) {
    console.error("Error fetching mystery:", error);
    req.flash(
      "error",
      "An unexpected error occurred while fetching the mystery."
    );
    res.redirect("/");
  }
});

// Middleware to check if user is admin
const requiresAdmin = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    const error = createError(
      403,
      "You do not have permission to access the Manage Clues page."
    );
    next(error);
  }
};

// Display Manage Clues Page
app.get(
  "/clues/manage",
  requiresAuthentication,
  requiresAdmin,
  async (req, res, next) => {
    try {
      const itemsPerPage = 10;
      const currentPage = parseInt(req.query.page, 10) || 1;

      if (isNaN(currentPage) || currentPage <= 0) {
        return next(
          createError(
            400,
            "Invalid page number. Page number must be greater than 0."
          )
        );
      }

      const offset = (currentPage - 1) * itemsPerPage;
      const countQuery = "SELECT COUNT(*) FROM clues";
      const { rows: countResult } = await dbQuery(countQuery);
      const totalItems = parseInt(countResult[0].count, 10);
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      if (currentPage > totalPages && totalItems > 0) {
        return next(createError(400, "Page number exceeds available pages."));
      }

      const cluesQuery =
        "SELECT * FROM clues ORDER BY name ASC LIMIT $1 OFFSET $2";
      const { rows: clues } = await dbQuery(cluesQuery, [itemsPerPage, offset]);

      res.render("manage-clues", {
        clues,
        currentPage,
        totalPages,
      });
    } catch (error) {
      console.error("Error fetching clues:", error);
      req.flash("error", "Failed to load clues.");
      res.redirect("/");
    }
  }
);

// Handle Adding a New Ingredient
app.post(
  "/clues/add",
  requiresAuthentication,
  requiresAdmin,
  async (req, res) => {
    const { name } = req.body;

    try {
      if (!name || name.trim().length === 0) {
        throw new Error("Ingredient name is required");
      }

      const trimmedName = name.trim();

      await dbQuery("INSERT INTO clues (name) VALUES ($1) RETURNING id", [
        trimmedName,
      ]);

      req.flash("success", "Ingredient added successfully.");
      res.redirect("/clues/manage");
    } catch (error) {
      console.error("Error adding ingredient:", error);
      req.flash("error", "Failed to add ingredient. It may already exist.");
      res.redirect("/clues/manage");
    }
  }
);

// Handle Editing an Ingredient
app.post(
  "/clues/:id/edit",
  requiresAuthentication,
  requiresAdmin,
  async (req, res) => {
    const ingredientId = parseInt(req.params.id, 10);
    const { name } = req.body;

    try {
      if (isNaN(ingredientId)) {
        return next(createError(400, "Invalid ingredient ID."));
      }

      if (!name || name.trim().length === 0) {
        req.flash("error", "Ingredient name is required.");
        return res.redirect("/clues/manage");
      }

      const trimmedName = name.trim();
      await dbQuery("UPDATE clues SET name = $1 WHERE id = $2", [
        trimmedName,
        ingredientId,
      ]);

      req.flash("success", "Ingredient updated successfully.");
      res.redirect("/clues/manage");
    } catch (error) {
      console.error("Error updating ingredient:", error);
      req.flash("error", "Failed to update ingredient.");
      res.redirect("/clues/manage");
    }
  }
);

// Handle Deleting an Ingredient
app.post(
  "/clues/:id/delete",
  requiresAuthentication,
  requiresAdmin,
  async (req, res) => {
    const ingredientId = parseInt(req.params.id, 10);

    try {
      if (isNaN(ingredientId)) {
        throw new Error("Invalid ingredient ID");
      }

      await dbQuery("DELETE FROM clues WHERE id = $1", [ingredientId]);

      req.flash("success", "Ingredient deleted successfully.");
      res.redirect("/clues/manage");
    } catch (error) {
      console.error("Error deleting ingredient:", error);
      req.flash("error", "Failed to delete ingredient.");
      res.redirect("/clues/manage");
    }
  }
);

// Error;
app.use(function (req, res, next) {
  next(createError(404));
});

// Error-handling middleware
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

// Port Creation
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
