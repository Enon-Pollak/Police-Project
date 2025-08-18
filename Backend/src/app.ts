import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { appConfig } from "./2-utils/app-config";
import { errorMiddleware } from "./6-middleware/error-middleware";
import { userController } from "./5-controllers/user-controller";
import { securityMiddleware } from "./6-middleware/security.middleware";
import fileUpload from "express-fileupload";
import path from "path";
import fs from "fs";
import { shiftController } from "./5-controllers/shift-controller";

/**
 * App - initializes Express, connects to MongoDB and wires middleware + controllers.
 * Comments are concise — enough to understand ordering and why certain middleware come first.
 */
class App {
    public async start(): Promise<void> {
        // Connect to MongoDB (must complete before handling requests)
        await mongoose.connect(appConfig.mongodbConnectionString);

        // Express app
        const server = express();

        // Middleware ordering matters:
        server.use(cors()); // CORS should be applied early
        server.use(fileUpload()); // File upload middleware before body parsers if uploads expected
        server.use(express.json()); // JSON body parser
        server.use(express.urlencoded({ extended: true })); // URL-encoded bodies

        // Register routes from controllers
        server.use(securityMiddleware.preventXssAttack);
        server.use(shiftController.router);
        server.use(userController.router);

        // Resolve static assets root (supports working from src or the built folder)
        const candidateRootA = path.join(__dirname, "..", "1-assets"); // project root assets
        const candidateRootB = path.join(__dirname, "1-assets");       // src assets during dev
        const assetsRoot = fs.existsSync(candidateRootA) ? candidateRootA : candidateRootB;

        // Serve static files under both paths (alias for convenience)
        server.use("/1-assets", express.static(assetsRoot));
        server.use("/assets", express.static(assetsRoot));

        // Security middleware (e.g. basic XSS prevention)
        server.use(securityMiddleware.preventXssAttack);

        // Error handling (route-not-found should come before catch-all)
        server.use(errorMiddleware.routeNotFound);
        server.use(errorMiddleware.catchAll);

        // Start listening
        server.listen(appConfig.port, () =>
            console.log("Listening on http://localhost:" + appConfig.port)
        );
    }
}

const app = new App();
app.start();
