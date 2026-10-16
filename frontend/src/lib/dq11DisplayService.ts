/**
 * DQ11 Customer Dynamic QR Display Service
 *
 * Communicates with Eventum Testware / Bonrix DQ11 3.5" TFT display
 * via the Chrome Web Serial API (USB-CDC ACM / STM32 Virtual COM Port).
 */

export type DQ11ProtocolMode = "DQ11_STANDARD" | "RAW_UPI" | "DUAL";

export interface DQ11Settings {
  baudRate: number;
  protocolMode: DQ11ProtocolMode;
  autoConnect: boolean;
}

export interface DQ11Status {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  portInfo: string | null;
  error: string | null;
  lastSent: string | null;
}

const DEFAULT_SETTINGS: DQ11Settings = {
  baudRate: 115200,
  protocolMode: "DQ11_STANDARD",
  autoConnect: true,
};

const STORAGE_KEY_SETTINGS = "agb_dq11_settings";

class DQ11DisplayManager {
  private port: any = null;
  private writer: any = null;
  private settings: DQ11Settings = { ...DEFAULT_SETTINGS };
  private listeners: Set<() => void> = new Set();
  private status: DQ11Status = {
    isSupported: false,
    isConnected: false,
    isConnecting: false,
    portInfo: null,
    error: null,
    lastSent: null,
  };
  private isInitialized = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.loadSettings();
      this.status.isSupported = "serial" in navigator;
      this.setupSerialListeners();
    }
  }

  private loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  public saveSettings(newSettings: Partial<DQ11Settings>) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
    } catch {}
    this.notify();
  }

  public getSettings(): DQ11Settings {
    return { ...this.settings };
  }

  public getStatus(): DQ11Status {
    return { ...this.status };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error("DQ11 listener error", err);
      }
    });
  }

  private setupSerialListeners() {
    if (typeof navigator !== "undefined" && "serial" in navigator) {
      (navigator as any).serial.addEventListener("connect", (e: any) => {
        console.log("DQ11 USB Serial device connected:", e.port);
        if (this.settings.autoConnect && !this.status.isConnected) {
          this.connectToPort(e.port);
        }
      });

      (navigator as any).serial.addEventListener("disconnect", (e: any) => {
        console.log("DQ11 USB Serial device disconnected:", e.port);
        if (this.port === e.port) {
          this.cleanup();
          this.status.isConnected = false;
          this.status.portInfo = null;
          this.status.error = "DQ11 Display disconnected from USB.";
          this.notify();
        }
      });
    }
  }

  /**
   * Automatically re-connect to a previously authorized serial port.
   */
  public async autoInit(): Promise<boolean> {
    if (this.isInitialized || !this.status.isSupported) return false;
    this.isInitialized = true;

    if (!this.settings.autoConnect) return false;

    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports && ports.length > 0) {
        // Try connecting to the first available authorized port
        return await this.connectToPort(ports[0]);
      }
    } catch (err) {
      console.warn("DQ11 auto-init error:", err);
    }
    return false;
  }

  /**
   * Prompts the user to select the DQ11 serial device via the browser native picker.
   */
  public async requestPair(): Promise<boolean> {
    if (!this.status.isSupported) {
      this.status.error = "Web Serial API is not supported in this browser. Please use Google Chrome.";
      this.notify();
      return false;
    }

    this.status.isConnecting = true;
    this.status.error = null;
    this.notify();

    try {
      // STM32 Virtual COM Port vendorId: 0x0483 (1155)
      // Allow user to select STM32 device or any USB-Serial device
      const port = await (navigator as any).serial.requestPort({
        filters: [
          { usbVendorId: 0x0483, usbProductId: 0x5740 }, // STMicroelectronics STM32 VCP
          { usbVendorId: 0x0483 },                       // Any STMicroelectronics
          { usbVendorId: 0x1a86 },                       // QinHeng CH340
          { usbVendorId: 0x10c4 },                       // Silicon Labs CP210x
          { usbVendorId: 0x0403 },                       // FTDI
        ],
      });

      if (!port) {
        this.status.isConnecting = false;
        this.notify();
        return false;
      }

      return await this.connectToPort(port);
    } catch (err: any) {
      this.status.isConnecting = false;
      if (err.name === "NotFoundError") {
        this.status.error = "No serial device was selected.";
      } else {
        this.status.error = err.message || "Failed to pair DQ11 device.";
      }
      this.notify();
      return false;
    }
  }

  /**
   * Opens the selected serial port and creates a persistent text writer.
   */
  public async connectToPort(port: any): Promise<boolean> {
    this.status.isConnecting = true;
    this.status.error = null;
    this.notify();

    try {
      // If port is already open, close it first
      if (this.port) {
        await this.cleanup();
      }

      this.port = port;

      // Extract port info if available
      let infoStr = "USB Serial Device";
      try {
        const info = port.getInfo?.();
        if (info?.usbVendorId) {
          const vidHex = info.usbVendorId.toString(16).padStart(4, "0").toUpperCase();
          const pidHex = info.usbProductId ? info.usbProductId.toString(16).padStart(4, "0").toUpperCase() : "????";
          infoStr = `STM32 / USB Serial (VID: ${vidHex}, PID: ${pidHex})`;
        }
      } catch {}

      // Open the port with configured baud rate
      await this.port.open({
        baudRate: this.settings.baudRate || 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });

      this.writer = this.port.writable.getWriter();
      this.status.isConnected = true;
      this.status.isConnecting = false;
      this.status.portInfo = infoStr;
      this.status.error = null;
      this.notify();

      // Send initial welcome command
      await this.sendWelcome();
      return true;
    } catch (err: any) {
      this.cleanup();
      this.status.isConnected = false;
      this.status.isConnecting = false;
      this.status.portInfo = null;
      this.status.error = err.message || "Could not open serial port.";
      this.notify();
      return false;
    }
  }

  /**
   * Safely closes the writer and port.
   */
  public async disconnect(): Promise<void> {
    await this.cleanup();
    this.status.isConnected = false;
    this.status.portInfo = null;
    this.status.error = null;
    this.notify();
  }

  private async cleanup() {
    try {
      if (this.writer) {
        await this.writer.close();
        this.writer.releaseLock();
      }
    } catch {}
    this.writer = null;

    try {
      if (this.port) {
        await this.port.close();
      }
    } catch {}
    this.port = null;
  }

  /**
   * Raw text write to the DQ11 serial device.
   */
  public async write(text: string): Promise<boolean> {
    if (!this.writer || !this.status.isConnected) {
      console.warn("DQ11 is not connected, cannot send:", text);
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      await this.writer.write(data);
      this.status.lastSent = text.trim();
      this.notify();
      return true;
    } catch (err: any) {
      console.error("Failed to write to DQ11:", err);
      this.status.error = "Write error: " + (err.message || "Device communication failed");
      this.notify();
      return false;
    }
  }

  /**
   * Displays the dynamic UPI QR code on the DQ11 screen.
   */
  public async showPaymentQr(params: {
    upiUri: string;
    amount: number;
    billNo?: string;
    storeName?: string;
  }): Promise<boolean> {
    if (!this.status.isConnected) return false;

    const { upiUri } = params;
    if (!upiUri) return false;

    let payload = "";
    if (this.settings.protocolMode === "RAW_UPI") {
      payload = `${upiUri}\r\n`;
    } else if (this.settings.protocolMode === "DUAL") {
      payload = `DisplayQRCodeScreen**${upiUri}**\r\n${upiUri}\r\n`;
    } else {
      // Default: DQ11_STANDARD
      payload = `DisplayQRCodeScreen**${upiUri}**\r\n`;
    }

    return await this.write(payload);
  }

  /**
   * Displays payment success on the DQ11 screen.
   */
  public async showSuccess(params?: {
    billNo?: string;
    amount?: number;
    date?: string;
  }): Promise<boolean> {
    if (!this.status.isConnected) return false;

    const bill = params?.billNo || "PAID";
    const amt = params?.amount !== undefined ? `₹${params.amount.toFixed(2)}` : "";
    const dateStr = params?.date || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    const payload = `DisplaySuccessQRCodeScreen**${bill}**${amt}**${dateStr}**\r\n`;
    return await this.write(payload);
  }

  /**
   * Resets the DQ11 screen back to the welcome / ready state.
   */
  public async sendWelcome(storeName?: string): Promise<boolean> {
    if (!this.status.isConnected) return false;

    const name = storeName || "ApnaGreen Basket";
    const payload = `WelcomeScreen**${name}**\r\n`;
    return await this.write(payload);
  }

  /**
   * Clears any active QR and shows cancelled state.
   */
  public async showCancel(): Promise<boolean> {
    if (!this.status.isConnected) return false;
    const payload = `DisplayCancelQRCodeScreen**\r\n`;
    return await this.write(payload);
  }

  /**
   * Sends a test transaction QR (₹1.00) to verify display function.
   */
  public async sendTest(upiId: string = "8603057958@sbi"): Promise<boolean> {
    const testUri = `upi://pay?pa=${upiId}&pn=ApnaGreen%20Basket&am=1.00&cu=INR&tn=DQ11%20Test`;
    return await this.showPaymentQr({
      upiUri: testUri,
      amount: 1.0,
      billNo: "TEST-01",
      storeName: "ApnaGreen Basket",
    });
  }
}

// Global Singleton Instance
export const dq11Display = new DQ11DisplayManager();
