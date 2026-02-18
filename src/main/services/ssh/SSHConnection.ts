/**
 * SSHConnection Service
 * Wraps ssh2 Client with promise-based API and event handling
 */

import { Client, ClientChannel } from 'ssh2';
import { EventEmitter } from 'events';
import type { SSHConnectionConfig, PTYOptions, SSHCommandResult } from '@shared/types';

export class SSHConnection extends EventEmitter {
  private client: Client;
  private stream: ClientChannel | null = null;
  private config: SSHConnectionConfig;
  private isConnected: boolean = false;
  
  constructor(config: SSHConnectionConfig) {
    super();
    this.client = new Client();
    this.config = config;
    this.setupClientEvents();
  }
  
  private setupClientEvents(): void {
    this.client.on('ready', () => {
      this.isConnected = true;
      this.emit('ready');
    });
    
    this.client.on('error', (err: Error) => {
      this.emit('error', err);
    });
    
    this.client.on('close', () => {
      this.isConnected = false;
      this.stream = null;
      this.emit('close');
    });
    
    this.client.on('end', () => {
      this.isConnected = false;
      this.emit('end');
    });
  }
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.client.end();
        reject(new Error('Connection timeout after 30 seconds'));
      }, this.config.readyTimeout || 30000);
      
      this.client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      this.client.once('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
      
      this.client.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
        readyTimeout: this.config.readyTimeout || 30000,
        keepaliveInterval: this.config.keepaliveInterval || 10000,
      });
    });
  }
  
  async createPTY(options: PTYOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected'));
        return;
      }
      
      this.client.shell(
        {
          cols: options.cols,
          rows: options.rows,
          term: options.term || 'xterm-256color',
        },
        (err: Error | undefined, stream: ClientChannel) => {
          if (err) {
            reject(err);
            return;
          }
          
          this.stream = stream;
          
          stream.on('data', (data: Buffer) => {
            this.emit('data', data.toString());
          });
          
          stream.on('close', () => {
            this.stream = null;
            this.emit('stream-close');
          });
          
          stream.stderr.on('data', (data: Buffer) => {
            this.emit('data', data.toString());
          });
          
          resolve();
        }
      );
    });
  }
  
  write(data: string): void {
    if (this.stream) {
      this.stream.write(data);
    }
  }
  
  resize(cols: number, rows: number): void {
    if (this.stream) {
      this.stream.setWindow(rows, cols, 0, 0);
    }
  }
  
  async executeCommand(command: string): Promise<SSHCommandResult> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected'));
        return;
      }
      
      this.client.exec(command, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          reject(err);
          return;
        }
        
        let stdout = '';
        let stderr = '';
        
        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        
        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        stream.on('close', (code?: number) => {
          resolve({ 
            stdout, 
            stderr, 
            code: code ?? 0 
          });
        });
      });
    });
  }
  
  disconnect(): void {
    if (this.stream) {
      this.stream.end();
    }
    this.client.end();
  }
  
  getIsConnected(): boolean {
    return this.isConnected;
  }
}
