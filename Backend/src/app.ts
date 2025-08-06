import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { appConfig } from "./2-utils/app-config";
import { errorMiddleware } from "./6-middleware/error-middleware";
import { userController } from "./5-controllers/user-controller";
import { securityMiddleware } from "./6-middleware/security.middleware";
import fileUpload from "express-fileupload";
import path from "path";

class App {
    public async start(): Promise<void> {
        // Connecting to MongoDB:
        await mongoose.connect(appConfig.mongodbConnectionString);

        // Create the server object: 
        const server = express();

        server.use(cors()); // Always first
        server.use(fileUpload()); // Before body parsers if you expect file uploads
        server.use(express.json()); 
        server.use(express.urlencoded({ extended: true }));

        // Serve uploaded images:
        server.use("/1-assets", express.static(path.join(__dirname, "1-assets")));
        server.use("/assets", express.static(path.join(__dirname, "1-assets")));

        // Protect against XSS attacks :
        server.use(securityMiddleware.preventXssAttack);

        // Listen to controller routes: 
        server.use(userController.router);

        // Route not found middleware: 
        server.use(errorMiddleware.routeNotFound);

        // Catch-all middleware: 
        server.use(errorMiddleware.catchAll);

        // Run server: 
        server.listen(appConfig.port, () =>
            console.log("Listening on http://localhost:" + appConfig.port)
        );
    }
}

const app = new App();
app.start();
