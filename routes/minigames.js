// Import dependencies
import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import hackingRoutes from "./hacking.js"; // Import hacking routes
import indexRoutes from "./index.js"; // Import main routes

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "secret_key",
    resave: false,
    saveUninitialized: false,
  })
);

// Use routes
app.use("/", indexRoutes);
app.use("/hacking", hackingRoutes); // Use hacking routes

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
