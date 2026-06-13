import express from 'express'
import cors from 'cors'
import { envConfig } from './config/env.config';
import routes from './routes'
import cookieParser from 'cookie-parser';
import { asyncHandler } from './middlewares/asyncHandler.middleware';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { connectDataBase } from './config/database.config';
import passport from 'passport';

const app = express();


app.use(cors({
    origin: envConfig.FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(passport.initialize());

app.get("/health", asyncHandler(async (req, res) => {
    res.json({
        message: "Server is Running",
        status: "healthy"
    })
}))

app.use('/api', routes);

// Error Handling Middleware must be defined last
app.use(errorHandler);

app.listen(envConfig.PORT, async () => {
    await connectDataBase();
    console.log(`Server is Running on http://localhost:${envConfig.PORT} in ${envConfig.NODE_ENV} mode`);
})