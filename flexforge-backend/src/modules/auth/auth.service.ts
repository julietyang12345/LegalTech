import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async register(email: string, password: string, name?: string) {
    const user = await this.userService.create({
      email,
      password,
      fullName: name,
    });

    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        quotaTier: user.quotaTier,
      },
      access_token: token,
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        quotaTier: user.quotaTier,
      },
      access_token: token,
    };
  }

  async validateUser(userId: string) {
    return this.userService.findById(userId);
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.userService.findByEmail(email);

    if (!user) {
      return null;
    }

    const isPasswordValid = await this.userService.validatePassword(
      user,
      password,
    );

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }
}
