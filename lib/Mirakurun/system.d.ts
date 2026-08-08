export declare function getIPv4AddressesForListen(): string[];
export declare function getIPv6AddressesForListen(): string[];
export declare function isPermittedIPAddress(addr: string): boolean;
export declare function isPermittedHost(url: string, allowedHostname?: string): boolean;
export declare function getLatestVersion(): Promise<string>;
