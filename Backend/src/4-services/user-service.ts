import { IUser, UserModel } from "../3-models/user-model";
import { AuthorizationError, ValidationError } from "../3-models/client-errors";
import { cyber } from "../2-utils/cyber";

class UserService {
    // Register a new user and return a JWT token
    public async register(user: IUser): Promise<string> {
        // Normalize email: trim + lowercase (schema also enforces lowercase, but we validate on normalized value)
        if (user.email) user.email = String(user.email).trim().toLowerCase();

        // Check for duplicate email (case-insensitive due to normalization)
        const exists = await UserModel.exists({ email: user.email }).exec();
        if (exists) throw new ValidationError("Email already taken.");

        // Save user to database
        const dbUser = await new UserModel(user).save();

        // Generate and return JWT token
        return cyber.generateToken(dbUser);
    }

    // Login user and return a JWT token
    public async login(email: string, password: string): Promise<string> {
        // Normalize email to match storage format
        const normalizedEmail = String(email).trim().toLowerCase();

        // Find user by normalized email
        const user = await UserModel.findOne({ email: normalizedEmail }).exec();
        if (!user) throw new AuthorizationError("Incorrect email or password.");

        // Hash the given password and compare to stored hash
        const hashedPassword = cyber.hash(password);
        if (user.password !== hashedPassword) throw new AuthorizationError("Incorrect email or password.");

        // Generate and return JWT token
        return cyber.generateToken(user);
    }
}

export const userService = new UserService();
