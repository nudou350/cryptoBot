import * as fs from 'fs';
import * as path from 'path';

export class Logger {
  private logFile: string;
  private botName: string;

  constructor(botName: string) {
    this.botName = botName;
    this.logFile = path.join(__dirname, '../../logs', `${botName}.log`);
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.botName}] [${level}] ${message}\n`;
  }

  public info(message: string): void {
    const formattedMessage = this.formatMessage('INFO', message);
    console.log(formattedMessage.trim());
    fs.appendFileSync(this.logFile, formattedMessage);
  }

  public error(message: string): void {
    const formattedMessage = this.formatMessage('ERROR', message);
    console.error(formattedMessage.trim());
    fs.appendFileSync(this.logFile, formattedMessage);
  }

  public warn(message: string): void {
    const formattedMessage = this.formatMessage('WARN', message);
    console.warn(formattedMessage.trim());
    fs.appendFileSync(this.logFile, formattedMessage);
  }

  public debug(message: string): void {
    const formattedMessage = this.formatMessage('DEBUG', message);
    console.log(formattedMessage.trim());
    fs.appendFileSync(this.logFile, formattedMessage);
  }

  public trade(message: string): void {
    const formattedMessage = this.formatMessage('TRADE', message);
    console.log(formattedMessage.trim());
    fs.appendFileSync(this.logFile, formattedMessage);
  }

  public clear(): void {
    if (fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
      this.info('Log file cleared');
    }
  }
}
