import * as http from "http";
export declare class Server {
    testMode: boolean;
    private _isRunning;
    private _servers;
    private _rpcs;
    get isRunning(): boolean;
    get servers(): Set<http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>>;
    init(): Promise<void>;
    deinit(): Promise<void>;
}
export default Server;
