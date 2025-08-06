import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { IUser } from "../3-models/user-model";
import { appConfig } from "./app-config";


// Utility class for hashing and JWT
class Cyber {

    // Hash password with SHA512 + salt from config
    public hash(plaintext: string): string {
        // Hash with salt:
        const hashText = crypto.createHmac("sha512", appConfig.hashSaltKey).update(plaintext).digest("hex");
        return hashText;
    }

    // Generate JWT for user
    public generateToken(user: IUser): string {
        // Remove password field for token safety
        (user as any).password = undefined;

        // Place user in container (so we can expand with more fields later if needed)
        const container = { user };

        // JWT options
        const options: SignOptions = { expiresIn: "3h" };
        const secretKey = appConfig.jwtSecretKey;

        // Create and return JWT
        const token = jwt.sign(container, secretKey, options);
        return token;
    }

    // Verify a token's validity
    public verifyToken(token: string): boolean {
        try {
            if (!token) return false;
            jwt.verify(token, appConfig.jwtSecretKey);
            return true;
        }
        catch {
            return false;
        }
    }
    // In cyber.ts
    public getUserFromToken(token: string): IUser | null {
        try {
            const container = jwt.verify(token, appConfig.jwtSecretKey) as { user: IUser };
            return container.user;
        } catch {
            return null;
        }
    }

}

export const cyber = new Cyber();
