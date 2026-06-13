import { BadRequestException, NotFoundException, UnauthorizedException } from "../utils/app-error";
import { createUser, findUserByEmail } from "./user.service";

export const registerService = async (data: {
    name: string,
    email: string,
    password: string
}) => {
    const existing = await findUserByEmail(data.email);
    if (existing) {
        throw new BadRequestException("Email Already in Use!");
    }

    const user = await createUser({
        name: data.name,
        email: data.email,
        password: data.password
    });

    return user;
};

export const loginService = async (data: {
    email: string,
    password: string
}) => {
    const user = await findUserByEmail(data.email);
    if (!user) {
        throw new NotFoundException("Invalid Email or Password!");
    }
    const isMatch = await user.comparePassword(data.password);
    if (!isMatch) {
        throw new UnauthorizedException("Invalid Email or Password!");
    }

    return user;
}
