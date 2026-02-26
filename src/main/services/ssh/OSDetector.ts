/**
 * OSDetector Service
 * Detects operating system, distribution, version, shell, and architecture
 */

import { SSHConnection } from './SSHConnection';
import type { OSInfo, ShellInfo } from '@shared/types';

export class OSDetector {
  private connection: SSHConnection;
  
  constructor(connection: SSHConnection) {
    this.connection = connection;
  }
  
  async detect(): Promise<OSInfo> {
    // Try to detect OS type first
    const osType = await this.detectOSType();
    
    let osInfo: OSInfo;
    
    switch (osType) {
      case 'linux':
        osInfo = await this.detectLinux();
        break;
      case 'darwin':
        osInfo = await this.detectMacOS();
        break;
      case 'windows':
        osInfo = await this.detectWindows();
        break;
      default:
        osInfo = this.getUnknownOS();
    }
    
    // Detect shell
    osInfo.shell = await this.detectShell();
    
    return osInfo;
  }
  
  private async detectOSType(): Promise<'linux' | 'darwin' | 'windows' | 'unknown'> {
    try {
      const { stdout } = await this.connection.executeCommand('uname -s');
      const os = stdout.trim().toLowerCase();
      
      if (os.includes('linux')) return 'linux';
      if (os.includes('darwin')) return 'darwin';
      if (os.includes('mingw') || os.includes('cygwin') || os.includes('msys')) return 'windows';
      
      // Try Windows-specific command
      const { code } = await this.connection.executeCommand('ver');
      if (code === 0) return 'windows';
      
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
  
  private async detectLinux(): Promise<OSInfo> {
    const info: OSInfo = {
      type: 'linux',
      architecture: 'unknown',
    };
    
    // Get architecture
    try {
      const { stdout } = await this.connection.executeCommand('uname -m');
      info.architecture = stdout.trim();
    } catch {
      // Ignore - architecture detection failed
    }
    
    // Get kernel version
    try {
      const { stdout } = await this.connection.executeCommand('uname -r');
      info.kernel = stdout.trim();
    } catch {
      // Ignore - kernel version detection failed
    }
    
    // Get hostname
    try {
      const { stdout } = await this.connection.executeCommand('hostname');
      info.hostname = stdout.trim();
    } catch {
      // Ignore - hostname detection failed
    }
    
    // Try to read os-release (most modern Linux distributions)
    try {
      const { stdout } = await this.connection.executeCommand('cat /etc/os-release');
      const osRelease = this.parseOSRelease(stdout);
      
      info.distribution = osRelease.NAME || osRelease.ID;
      info.version = osRelease.VERSION_ID;
      info.codename = osRelease.VERSION_CODENAME;
      
      // Check for specific distributions
      if (osRelease.ID) {
        const id = osRelease.ID.toLowerCase();
        const idLike = osRelease.ID_LIKE?.toLowerCase() || '';
        
        if (id.includes('raspbian') || idLike.includes('raspbian')) {
          info.distribution = 'Raspbian';
        } else if (id.includes('ubuntu')) {
          info.distribution = 'Ubuntu';
        } else if (id.includes('debian')) {
          info.distribution = 'Debian';
        } else if (id.includes('centos')) {
          info.distribution = 'CentOS';
        } else if (id.includes('fedora')) {
          info.distribution = 'Fedora';
        } else if (id.includes('arch')) {
          info.distribution = 'Arch Linux';
        } else if (id.includes('rhel')) {
          info.distribution = 'Red Hat Enterprise Linux';
        } else if (id.includes('alpine')) {
          info.distribution = 'Alpine Linux';
        }
      }
    } catch {
      // Fallback: try lsb_release
      try {
        const { stdout } = await this.connection.executeCommand('lsb_release -a 2>/dev/null');
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.startsWith('Distributor ID:')) {
            info.distribution = line.split(':')[1]?.trim();
          }
          if (line.startsWith('Release:')) {
            info.version = line.split(':')[1]?.trim();
          }
          if (line.startsWith('Codename:')) {
            info.codename = line.split(':')[1]?.trim();
          }
        }
      } catch {
        // Ignore - lsb_release not available
      }
    }
    
    return info;
  }
  
  private async detectMacOS(): Promise<OSInfo> {
    const info: OSInfo = {
      type: 'darwin',
      distribution: 'macOS',
      architecture: 'unknown',
    };
    
    // Get version from sw_vers
    try {
      const { stdout } = await this.connection.executeCommand('sw_vers -productVersion');
      info.version = stdout.trim();
    } catch {
      // Ignore - sw_vers not available
    }
    
    // Get architecture
    try {
      const { stdout } = await this.connection.executeCommand('uname -m');
      info.architecture = stdout.trim();
    } catch {
      // Ignore - architecture detection failed
    }
    
    // Get kernel
    try {
      const { stdout } = await this.connection.executeCommand('uname -r');
      info.kernel = stdout.trim();
    } catch {
      // Ignore - kernel detection failed
    }
    
    // Get hostname
    try {
      const { stdout } = await this.connection.executeCommand('hostname');
      info.hostname = stdout.trim();
    } catch {
      // Ignore - hostname detection failed
    }
    
    return info;
  }
  
  private async detectWindows(): Promise<OSInfo> {
    const info: OSInfo = {
      type: 'windows',
      distribution: 'Windows',
      architecture: 'unknown',
    };
    
    // Try to get Windows version
    try {
      const { stdout } = await this.connection.executeCommand(
        'powershell -Command "[System.Environment]::OSVersion.VersionString"'
      );
      info.version = stdout.trim();
    } catch {
      // Ignore - PowerShell command failed
    }
    
    // Get architecture
    try {
      const { stdout } = await this.connection.executeCommand(
        'powershell -Command "$env:PROCESSOR_ARCHITECTURE"'
      );
      info.architecture = stdout.trim();
    } catch {
      // Ignore - architecture detection failed
    }
    
    // Get hostname
    try {
      const { stdout } = await this.connection.executeCommand('hostname');
      info.hostname = stdout.trim();
    } catch {
      // Ignore - hostname detection failed
    }
    
    return info;
  }
  
  private async detectShell(): Promise<ShellInfo> {
    // Try to detect current shell
    try {
      const { stdout } = await this.connection.executeCommand('echo $SHELL');
      const shellPath = stdout.trim();
      
      if (shellPath.includes('bash')) {
        const version = await this.getShellVersion('bash --version 2>/dev/null | head -n1');
        return { type: 'bash', path: shellPath, version };
      }
      if (shellPath.includes('zsh')) {
        const version = await this.getShellVersion('zsh --version 2>/dev/null');
        return { type: 'zsh', path: shellPath, version };
      }
      if (shellPath.includes('fish')) {
        const version = await this.getShellVersion('fish --version 2>/dev/null');
        return { type: 'fish', path: shellPath, version };
      }
      if (shellPath.includes('sh')) {
        return { type: 'sh', path: shellPath };
      }
    } catch {
      // Ignore - shell detection failed, use fallback
    }
    
    // Check for PowerShell (Windows)
    try {
      const { code } = await this.connection.executeCommand('powershell -Command "echo test"');
      if (code === 0) {
        return { type: 'powershell', path: 'powershell.exe' };
      }
    } catch {
      // Ignore - PowerShell not available
    }
    
    // Default to bash
    return { type: 'bash', path: '/bin/bash' };
  }
  
  private async getShellVersion(command: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.connection.executeCommand(command);
      const match = stdout.match(/(\d+\.\d+(\.\d+)?)/);
      return match ? match[1] : undefined;
    } catch {
      // Ignore - shell version detection failed
      return undefined;
    }
  }
  
  private parseOSRelease(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/);
      if (match) {
        result[match[1]] = match[2];
      }
    }
    
    return result;
  }
  
  private getUnknownOS(): OSInfo {
    return {
      type: 'linux', // Assume Linux as fallback
      architecture: 'unknown',
    };
  }
}
