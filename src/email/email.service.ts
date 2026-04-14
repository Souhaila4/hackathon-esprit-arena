import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'arenaofcoders@gmail.com',
        pass: 'tuil omlu fawc jido',
      },
    });
  }

  async sendVerificationCode(
    email: string,
    code: string,
    firstName: string,
  ): Promise<void> {
    const mailOptions = {
      from: 'arenaofcoders@gmail.com',
      to: email,
      subject: 'Verify Your Email - Arena of Coders',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Welcome to Arena of Coders!</h2>
          <p>Hi ${firstName},</p>
          <p>Thank you for signing up! Please use the verification code below to verify your email address:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't create an account with Arena of Coders, please ignore this email.</p>
          <p style="margin-top: 30px; color: #666; font-size: 12px;">Best regards,<br>The Arena of Coders Team</p>
        </div>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendPasswordResetCode(
    email: string,
    code: string,
    firstName: string,
  ): Promise<void> {
    const mailOptions = {
      from: 'arenaofcoders@gmail.com',
      to: email,
      subject: 'Reset Your Password - Arena of Coders',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Password Reset</h2>
          <p>Hi ${firstName},</p>
          <p>Use the code below to reset your password:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you didn't request a password reset, please ignore this email.</p>
          <p style="margin-top: 30px; color: #666; font-size: 12px;">Best regards,<br>The Arena of Coders Team</p>
        </div>
      `,
    };
    await this.transporter.sendMail(mailOptions);
  }

  async sendHackathonNotification(
    email: string,
    firstName: string,
    competitionTitle: string,
    specialty: string,
  ): Promise<void> {
    const mailOptions = {
      from: 'arenaofcoders@gmail.com',
      to: email,
      subject: `New ${specialty} hackathon: ${competitionTitle} – Arena of Coders`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">A hackathon for your specialty is here!</h2>
          <p>Hi ${firstName},</p>
          <p>A new <strong>${specialty}</strong> hackathon has been created and might be perfect for you:</p>
          <div style="background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%); padding: 24px; border-radius: 12px; margin: 20px 0;">
            <h3 style="color: #e94560; margin-top: 0;">${competitionTitle}</h3>
            <p style="color: #eee; margin-bottom: 0;">Log in to Arena of Coders to view details and join the competition.</p>
          </div>
          <p>Don't miss out – check the app for full details and deadlines.</p>
          <p style="margin-top: 30px; color: #666; font-size: 12px;">Best regards,<br>The Arena of Coders Team</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Failed to send hackathon notification email:', error);
    }
  }
}
