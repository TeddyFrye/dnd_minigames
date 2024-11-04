import express from "express";
import { hackingGameController } from "../controllers/hackingController.js";

const router = express.Router();

// Main hacking game route
router.get("/", hackingGameController.mainPage);
router.post("/guess", hackingGameController.guess);

export default router;
