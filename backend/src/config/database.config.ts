import mongoose from "mongoose";
import { envConfig } from "./env.config";

export const connectDataBase = async () => {
    try {
        await mongoose.connect(envConfig.MONGO_URI);
        console.log(`DataBase Connected!!`);
    } catch (error) {
        console.error("Error in database connection: ", error);
        process.exit(1);
    }
}